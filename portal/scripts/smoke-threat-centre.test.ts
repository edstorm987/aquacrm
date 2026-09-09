// Threat centre — Phase 6 acceptance.
//
// The mission bar: the click-path must actually work, honestly. This suite
// drives the REAL route handlers in-process (real requireRole, real password
// verification, real control plane) and pins:
//   1. GUARDS — anonymous and staff callers get nothing; owner required.
//   2. RE-AUTH + DUAL CONFIRM — a valid owner SESSION alone cannot act: the
//      password is re-verified per action, the CONTAIN phrase and a written
//      reason are mandatory.
//   3. TENANT SCOPE — an owner cannot suspend another tenant's user (same
//      error as "not found": no id oracle), and PLATFORM-WIDE switches are
//      the operator's only.
//   4. EFFECT — an accepted action actually flips the control plane and lands
//      in the durable record.
//   5. HONESTY — the overview declares BLIND posture items (no scanner, no
//      drain) instead of faking green.

import { withRequestScope, withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { NextRequest } from "next/server";

const AGENCY_A = "threat-agency-a";
const AGENCY_B = "threat-agency-b";
const FOUNDER_AGENCY = "threat-founder-agency";
const FOUNDER_EMAIL = "founder-threat@example.com";
const PASSWORD = "Threat-centre-1!";

let overviewRoute: typeof import("../src/app/api/portal/security/overview/route");
let actionsRoute: typeof import("../src/app/api/portal/security/actions/route");
let issueSession: typeof import("../src/lib/server/auth/auth")["issueSession"];
let control: typeof import("../src/lib/server/auth/securityControl");
let ids: { ownerA: string; staffA: string; targetA: string; ownerB: string; founder: string };
let tokens: { ownerA: string; staffA: string; ownerB: string; founder: string; founderAal2: string };

function actionRequest(body: Record<string, unknown>, ip: string): NextRequest {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextRequest } = require("next/server") as typeof import("next/server");
  return new NextRequest("http://localhost/api/portal/security/actions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** A fully-confirmed body — each test then breaks ONE gate at a time. */
function confirmed(action: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { action, reason: "containment drill for the acceptance suite", confirm: "CONTAIN", password: PASSWORD, ...extra };
}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

before(async () => {
  process.env.FOUNDER_EMAIL = FOUNDER_EMAIL;
  const { ensureHydrated } = await import("../src/server/storage");
  await ensureHydrated();
  const auth = await import("../src/lib/server/auth/auth");
  issueSession = auth.issueSession;
  control = await import("../src/lib/server/auth/securityControl");
  overviewRoute = await import("../src/app/api/portal/security/overview/route");
  actionsRoute = await import("../src/app/api/portal/security/actions/route");

  const { createUser } = await import("../src/server/users");
  const ownerA = createUser({ email: "owner-a-threat@example.com", password: PASSWORD, role: "agency-owner", agencyId: AGENCY_A });
  const staffA = createUser({ email: "staff-a-threat@example.com", password: PASSWORD, role: "agency-staff", agencyId: AGENCY_A });
  const targetA = createUser({ email: "target-a-threat@example.com", password: PASSWORD, role: "agency-staff", agencyId: AGENCY_A });
  const ownerB = createUser({ email: "owner-b-threat@example.com", password: PASSWORD, role: "agency-owner", agencyId: AGENCY_B });
  const founder = createUser({ email: FOUNDER_EMAIL, password: PASSWORD, role: "agency-owner", agencyId: FOUNDER_AGENCY });
  ids = { ownerA: ownerA.id, staffA: staffA.id, targetA: targetA.id, ownerB: ownerB.id, founder: founder.id };

  const mint = (user: { id: string; email: string; role: string; agencyId?: string }, aal?: "aal2") =>
    issueSession({
      userId: user.id,
      email: user.email,
      role: user.role as never,
      agencyId: user.agencyId,
      agencyIds: user.agencyId ? [user.agencyId] : [],
      activeAgencyId: user.agencyId,
      aal,
    } as never);
  tokens = {
    ownerA: mint(ownerA), staffA: mint(staffA), ownerB: mint(ownerB),
    founder: mint(founder), founderAal2: mint(founder, "aal2"),
  };
});

describe("Threat centre — guards", () => {
  it("refuses anonymous and staff callers on both routes", async () => {
    await withRequestScope({}, async () => {
      const anonOverview = await overviewRoute.GET();
      assert.equal(anonOverview.status, 401);
    });

    await withSession(tokens.staffA, async () => {
      assert.equal((await overviewRoute.GET()).status, 403);
      const refused = await actionsRoute.POST(actionRequest(confirmed("lockdown-tenant"), nextIp()));
      assert.equal(refused.status, 403);
    });
  });
});

describe("Threat centre — re-auth and dual confirmation", () => {
  it("a valid owner session alone cannot act: password, phrase and reason are each mandatory", async () => {
    await withSession(tokens.ownerA, async () => {
      const noPassword = await actionsRoute.POST(actionRequest({ ...confirmed("lockdown-tenant"), password: "wrong-password" }, nextIp()));
      assert.equal(noPassword.status, 403);
      assert.equal(((await noPassword.json()) as { error: string }).error, "reauthentication_failed");

      const noPhrase = await actionsRoute.POST(actionRequest({ ...confirmed("lockdown-tenant"), confirm: "yes do it" }, nextIp()));
      assert.equal(noPhrase.status, 400);
      assert.equal(((await noPhrase.json()) as { error: string }).error, "confirm_required");

      const noReason = await actionsRoute.POST(actionRequest({ ...confirmed("lockdown-tenant"), reason: "ok" }, nextIp()));
      assert.equal(noReason.status, 400);
      assert.equal(((await noReason.json()) as { error: string }).error, "reason_required");

      const unknown = await actionsRoute.POST(actionRequest(confirmed("drop-all-tables"), nextIp()));
      assert.equal(unknown.status, 400);
    });
    // None of the refused attempts flipped anything.
    assert.equal(control.isTenantLockedDown(AGENCY_A), false);
  });
});

describe("Threat centre — tenant scope", () => {
  it("an owner cannot suspend another tenant's user, and gets no id oracle", async () => {
    await withSession(tokens.ownerB, async () => {
      const crossTenant = await actionsRoute.POST(actionRequest(confirmed("suspend-user", { userId: ids.targetA }), nextIp()));
      assert.equal(crossTenant.status, 400);
      const body = (await crossTenant.json()) as { error: string };
      assert.equal(body.error, "user_not_in_scope");

      const missing = await actionsRoute.POST(actionRequest(confirmed("suspend-user", { userId: "no-such-user" }), nextIp()));
      assert.equal(missing.status, 400);
      assert.equal(((await missing.json()) as { error: string }).error, "user_not_in_scope", "unknown and foreign ids must be indistinguishable");
    });
    assert.equal(control.isUserSuspended(ids.targetA), false);
  });

  it("platform-wide switches are the operator's only", async () => {
    await withSession(tokens.ownerA, async () => {
      const refused = await actionsRoute.POST(actionRequest(confirmed("set-global-read-only"), nextIp()));
      assert.equal(refused.status, 403);
      assert.equal(((await refused.json()) as { error: string }).error, "operator_only");
    });
    assert.equal(control.isGlobalReadOnly(), false);

    // Even the operator is refused a platform-wide switch WITHOUT a step-up
    // (AAL2) session — password re-entry is not a second factor. Visibly
    // unavailable, directed to the operator console; NOT silently downgraded.
    await withSession(tokens.founder, async () => {
      const refused = await actionsRoute.POST(actionRequest(confirmed("disable-ai"), nextIp()));
      assert.equal(refused.status, 403);
      assert.equal(((await refused.json()) as { error: string }).error, "aal2_required");
    });
    assert.equal(control.isAiDisabled(), null);

    // With a step-up (AAL2) operator session, the platform switch is allowed.
    await withSession(tokens.founderAal2, async () => {
      const allowed = await actionsRoute.POST(actionRequest(confirmed("disable-ai"), nextIp()));
      assert.equal(allowed.status, 200);
      assert.ok(control.isAiDisabled());
      const restore = await actionsRoute.POST(actionRequest(confirmed("enable-ai"), nextIp()));
      assert.equal(restore.status, 200);
    });
    assert.equal(control.isAiDisabled(), null);
  });
});

describe("Threat centre — the click-path actually works", () => {
  it("a fully-confirmed action flips the real control and lands in the durable record", async () => {
    await withSession(tokens.ownerA, async () => {
      const suspend = await actionsRoute.POST(actionRequest(confirmed("suspend-user", { userId: ids.targetA }), nextIp()));
      assert.equal(suspend.status, 200);
      assert.equal(((await suspend.json()) as { ok: boolean }).ok, true);
    });
    assert.equal(control.isUserSuspended(ids.targetA), true);

    // The action is in the DURABLE record with the acting owner's identity.
    const durable = control.readSecurityControl().recentEvents ?? [];
    const entry = [...durable].reverse().find(event => event.kind === "user.suspended");
    assert.ok(entry, "suspension must be durably recorded");
    assert.equal(entry?.actor, `owner:${ids.ownerA}`);

    await withSession(tokens.ownerA, async () => {
      const lift = await actionsRoute.POST(actionRequest(confirmed("unsuspend-user", { userId: ids.targetA }), nextIp()));
      assert.equal(lift.status, 200);
    });
    assert.equal(control.isUserSuspended(ids.targetA), false);
  });

  it("an owner cannot suspend themselves", async () => {
    await withSession(tokens.ownerA, async () => {
      const refused = await actionsRoute.POST(actionRequest(confirmed("suspend-user", { userId: ids.ownerA }), nextIp()));
      assert.equal(refused.status, 400);
      assert.equal(((await refused.json()) as { error: string }).error, "cannot_target_self");
    });
  });
});

describe("Threat centre — honest overview", () => {
  it("the overview reports switches, the durable record, and says BLIND where it is blind", async () => {
    await withSession(tokens.ownerA, async () => {
      const response = await overviewRoute.GET();
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        ok: boolean;
        viewer: { operator: boolean };
        posture: Array<{ id: string; status: string; detail: string }>;
        durableActions: Array<{ kind: string }>;
        suspendedUsers: unknown[];
      };
      assert.equal(body.ok, true);
      assert.equal(body.viewer.operator, false);

      // No scanner and no drain are connected in this process — the page must
      // SAY so, not render a green shield.
      const scanner = body.posture.find(item => item.id === "scanner");
      assert.equal(scanner?.status, "blind");
      assert.match(scanner?.detail ?? "", /NO scanner is connected/);
      const drain = body.posture.find(item => item.id === "event-drain");
      assert.equal(drain?.status, "blind");
      // Restore capability is honestly "owner action", never "enforced".
      assert.equal(body.posture.find(item => item.id === "backup")?.status, "owner");

      // The suspension exercised above is visible in this owner's record.
      assert.ok(body.durableActions.some(event => event.kind === "user.suspended"));
    });
  });

  it("a tenant owner's overview never contains another tenant's durable events", async () => {
    await withSession(tokens.ownerB, async () => {
      const response = await overviewRoute.GET();
      const body = (await response.json()) as { durableActions: Array<{ kind: string; tenantId?: string }>; suspendedUsers: Array<{ userId: string }> };
      // ownerA's tenant-scoped actions must not appear for ownerB.
      assert.ok(!body.durableActions.some(event => event.tenantId === AGENCY_A));
      assert.ok(!body.suspendedUsers.some(entry => entry.userId === ids.targetA));
    });
  });
});
