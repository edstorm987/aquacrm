// BOS auth-gate smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId, UserId, UserProfile } from "../lib/tenancy";
import type {
  ActivityLogPort, EventBusPort, FunnelMePort, UserPort,
} from "../server/ports";
import {
  containerWithDeps,
  evaluate,
  matchesBosPath,
  isBosAsset,
  buildLoginRedirect,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_milesy_master";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  user: UserPort;
  funnel: FunnelMePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(opts: { withFunnel?: boolean; userMap?: Map<string, UserProfile>; funnelMap?: Map<string, { leadUserId: UserId; email: string; hcSlot?: Record<string, unknown>; capturedAt?: number }> } = {}): World {
  const userMap = opts.userMap ?? new Map<string, UserProfile>();
  const funnelMap = opts.funnelMap ?? new Map<string, { leadUserId: UserId; email: string; hcSlot?: Record<string, unknown>; capturedAt?: number }>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  const user: UserPort = {
    getUser(id) { return userMap.get(id) ?? null; },
  };
  const funnel: FunnelMePort = {
    getMeContextByUserId(id) { return funnelMap.get(id) ?? null; },
  };
  const w: World = {
    user, funnel, activity, events: eventBus,
    inspect: { activityLog, events },
  };
  void opts.withFunnel; // funnel always provided; opt-out via container
  return w;
}

function container(world: World, withFunnel = true) {
  return containerWithDeps({
    agencyId: AGENCY,
    activity: world.activity, events: world.events,
    user: world.user,
    ...(withFunnel ? { funnel: world.funnel } : {}),
  });
}

describe("@aqua/plugin-bos-auth-gate smoke", () => {
  // ── Pure helpers ──────────────────────────────────────────────

  test("1. matchesBosPath matches /business-os and /api/portal/business-os subtrees", () => {
    assert.equal(matchesBosPath("/business-os"), true);
    assert.equal(matchesBosPath("/business-os/dashboard"), true);
    assert.equal(matchesBosPath("/api/portal/business-os/me"), true);
    assert.equal(matchesBosPath("/business-os-other"), false);  // prefix-only false-positive
    assert.equal(matchesBosPath("/portal/agency"), false);
    assert.equal(matchesBosPath("/"), false);
  });

  test("2. isBosAsset detects static asset suffixes", () => {
    assert.equal(isBosAsset("/business-os/style.css"), true);
    assert.equal(isBosAsset("/business-os/app.js"), true);
    assert.equal(isBosAsset("/business-os/logo.svg"), true);
    assert.equal(isBosAsset("/business-os/dashboard"), false);
    assert.equal(isBosAsset("/api/portal/business-os/me"), false);
  });

  test("3. buildLoginRedirect appends from=bos and next encoded", () => {
    const r = buildLoginRedirect({ nextPath: "/business-os/dashboard?x=1" });
    assert.match(r, /^\/login\?/);
    assert.match(r, /from=bos/);
    assert.match(r, /next=%2Fbusiness-os%2Fdashboard%3Fx%3D1/);
  });

  // ── evaluate decision engine ─────────────────────────────────

  test("4. evaluate allows out-of-scope path trivially", () => {
    const d = evaluate({ pathname: "/portal/agency", signedIn: false });
    assert.equal(d.outcome, "allow");
    assert.equal(d.reason, "out_of_scope");
  });

  test("5. evaluate allows static asset under /business-os/ regardless of auth", () => {
    const d = evaluate({ pathname: "/business-os/app.js", signedIn: false });
    assert.equal(d.outcome, "allow");
    assert.equal(d.reason, "static_asset");
  });

  test("6. anon → redirect with from=bos&next=<original>", () => {
    const d = evaluate({ pathname: "/business-os/dashboard", signedIn: false });
    assert.equal(d.outcome, "redirect");
    assert.match(d.redirect ?? "", /^\/login\?from=bos&next=%2Fbusiness-os%2Fdashboard$/);
    assert.equal(d.reason, "not_signed_in");
  });

  test("7. signed-in lead → allow", () => {
    const d = evaluate({ pathname: "/business-os/dashboard", signedIn: true, role: "lead" });
    assert.equal(d.outcome, "allow");
  });

  test("8. signed-in agency-staff → allow (operator inspection)", () => {
    const d = evaluate({ pathname: "/business-os/dashboard", signedIn: true, role: "agency-manager" });
    assert.equal(d.outcome, "allow");
  });

  test("9. signed-in client-owner → redirect (role not allowed)", () => {
    const d = evaluate({ pathname: "/business-os/dashboard", signedIn: true, role: "client-owner" });
    assert.equal(d.outcome, "redirect");
    assert.equal(d.reason, "role_not_allowed");
  });

  test("10. devBypass=true → dev-bypass outcome with banner (anon allowed through)", () => {
    const d = evaluate({ pathname: "/business-os/dashboard", signedIn: false }, { devBypass: true });
    assert.equal(d.outcome, "dev-bypass");
    assert.match(d.banner ?? "", /DEV MODE/);
  });

  test("11. custom loginPath flows through to the redirect URL", () => {
    const d = evaluate(
      { pathname: "/business-os/x", signedIn: false },
      { loginPath: "/sign-in" },
    );
    assert.match(d.redirect ?? "", /^\/sign-in\?/);
  });

  // ── me payload resolver ──────────────────────────────────────

  test("12. me returns null for unknown user", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const me = await c.gate.me("user_unknown", "lead");
    assert.equal(me, null);
    resetClock();
  });

  test("13. me payload for lead with HC slot present returns hcSlot + agencyless:true", async () => {
    setClock(() => T0);
    const userMap = new Map<string, UserProfile>([
      ["user_lead_a", { id: "user_lead_a", email: "ed@example.com", agencyId: "lead-tenant" }],
    ]);
    const funnelMap = new Map([
      ["user_lead_a", { leadUserId: "user_lead_a", email: "ed@example.com", hcSlot: { slot: 3 }, capturedAt: T0 }],
    ]);
    const w = buildWorld({ userMap, funnelMap });
    const c = container(w);
    const me = await c.gate.me("user_lead_a", "lead");
    assert.ok(me);
    assert.equal(me?.user.email, "ed@example.com");
    assert.equal(me?.user.role, "lead");
    assert.equal(me?.agencyless, true);
    assert.equal((me?.hcSlot as { slot: number } | undefined)?.slot, 3);
    assert.equal(me?.capturedAt, T0);
    assert.ok(w.inspect.activityLog.some(e => e.action === "bos-auth-gate.me_read"));
    resetClock();
  });

  test("14. me payload for agency-manager → agencyless:false; works without funnel port (no hcSlot)", async () => {
    setClock(() => T0);
    const userMap = new Map<string, UserProfile>([
      ["user_op", { id: "user_op", email: "ops@milesy.com", agencyId: "agency_milesy_master" }],
    ]);
    const w = buildWorld({ userMap });
    const c = container(w, false);  // no funnel port wired
    const me = await c.gate.me("user_op", "agency-manager");
    assert.ok(me);
    assert.equal(me?.agencyless, false);
    assert.equal(me?.hcSlot, undefined);
    assert.equal(me?.capturedAt, undefined);
    resetClock();
  });

  test("15. me payload omits role when no role passed in", async () => {
    setClock(() => T0);
    const userMap = new Map<string, UserProfile>([
      ["user_x", { id: "user_x", email: "x@y.com", agencyId: "lead-tenant" }],
    ]);
    const w = buildWorld({ userMap });
    const c = container(w);
    const me = await c.gate.me("user_x");
    assert.ok(me);
    assert.equal(me?.user.role, undefined);
    assert.equal(me?.agencyless, false);     // role !== "lead" → false
    resetClock();
  });

  test("16. me logs activity with category 'bos-auth-gate' + emits me_read event", async () => {
    setClock(() => T0);
    const userMap = new Map<string, UserProfile>([
      ["user_y", { id: "user_y", email: "y@z.com", agencyId: "lead-tenant" }],
    ]);
    const w = buildWorld({ userMap });
    const c = container(w);
    await c.gate.me("user_y", "lead");
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["bos-auth-gate"]);
    assert.ok(w.inspect.events.some(e => e.name === "bos-auth-gate.me_read"));
    resetClock();
  });
});

resetClock();
