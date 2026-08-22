// WHOSE TENANT IS IT? — the plugin API dispatcher, driven across two agencies.
//
// `smoke-plugin-api-host-gates.test.ts` settled WHO may call a plugin API route
// (role, per surface, default-deny). It is deliberately agnostic about WHERE
// the call lands, and that was the hole:
//
//   an agency-owner in agency A POSTed
//     /api/portal/agency-hr/staff?agencyId=B
//   → 201 CREATED, body `agencyId: "<B>"`, readable back with `?agencyId=B`,
//   while their OWN agency listed empty.
//
// The mechanism was the R032 public-route peek. The dispatcher must resolve a
// route once before it can know whether the route is `public: true` (a Stripe
// webhook has no session, so its agency can only come from the URL), and the
// peek did that resolution with the CALLER'S OWN `?agencyId=`. Line 65 then
// reused the peek as the authoritative resolution whenever it was non-null —
// which it is for every route the query names an install for. The corrected
// `session?.agencyId ?? queryAgencyId` fed only the fallback branch, and the
// fallback branch never ran.
//
// The rule now, in `src/lib/server/portal/apiTenantScope.ts`:
//
//   a query-supplied agencyId is authoritative ONLY on a genuinely public
//   route. The instant a session exists the SESSION decides the tenant, and a
//   query naming someone else is a refusal — not a silent change of scope.
//
// This class has escaped three guards, so the arms below are behavioural: the
// REAL dispatcher, REAL signed sessions, two real agencies with real data in
// both, and a probe plugin whose handler reports the tenant its `PluginCtx`
// actually carried — so "refused" and "landed in the right place" are separate,
// independently proven claims rather than one status code.
//
//   ARM 1  The exact reproduction, and the write proven to land in A.
//   ARM 2  Every method × every role × a representative route set, ?agencyId=B.
//   ARM 3  Reads never see B — with B's data seeded so a leak would show.
//   ARM 4  The public routes the peek exists for, still working.
//   ARM 5  The same shape on clientId.
//   ARM 6  R025 multi-agency: naming your OWN other agency still works.
//   ARM 7  Mutation checks — the guard watched failing.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withRequestScope, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { upsertInstall } from "../src/server/pluginInstalls";
import { listPlugins, registerPlugin } from "../src/built-ins/runtime/_registry";
import { resolvePluginApiRoute } from "../src/built-ins/runtime/_routeResolver";
import { resolveApiTenantScope } from "../src/lib/server/portal/apiTenantScope";
import type { AquaPlugin, PluginCtx } from "../src/built-ins/runtime/_types";
import { ALL_ROLES, CLIENT_ROLES, LEAD_AGENCY_ID, type Role } from "../src/server/types";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
const METHODS: Method[] = ["GET", "POST", "PATCH", "PUT", "DELETE"];

// ─── Fixture: two agencies that must never see each other ─────────────────

let agencyA = "";
let agencyB = "";
let clientA = "";
let clientA2 = "";
let clientB = "";

/** Sessions for every role, held in agency A. */
const tokensA = new Map<Role, string>();
/** An owner in agency B, so B's side can be read honestly. */
let ownerB = "";
/** An R025 master user whose membership is [A, B]. */
let masterAB = "";
/** A client-owner in A attached to `clientA`. */
let clientOwnerA = "";

// A probe plugin whose handlers report the tenant the dispatcher handed them.
// Status codes alone cannot tell "refused" from "answered about the wrong
// agency"; this can.
const PROBE = "zz-tenancy-probe";
const PROBE_CLIENT = "zz-tenancy-probe-client";

function probeHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  return Promise.resolve(new Response(
    JSON.stringify({ ok: true, sawAgencyId: ctx.agencyId, sawClientId: ctx.clientId ?? null }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
}

function probePlugin(id: string, scopePolicy: "agency" | "client"): AquaPlugin {
  return {
    id,
    name: id,
    version: "1.0.0",
    status: "stable",
    category: "ops",
    tagline: "t",
    description: "d",
    scopePolicy,
    navItems: [],
    pages: [],
    api: [
      { path: "probe", methods: [...METHODS], handler: probeHandler },
      // The public shape the peek exists for, with a handler that reports the
      // tenant it was given.
      { path: "public-probe", methods: [...METHODS], handler: probeHandler, public: true },
    ],
    settings: { groups: [] },
    features: [],
  } as unknown as AquaPlugin;
}

before(async () => {
  await ensureHydrated();

  const a = createAgency({ name: "Tenancy A", slug: `tenancy-a-${Date.now()}` });
  const b = createAgency({ name: "Tenancy B", slug: `tenancy-b-${Date.now()}` });
  agencyA = a.id;
  agencyB = b.id;
  clientA = createClient(a.id, { name: "A Client", slug: "a-client" }).id;
  clientA2 = createClient(a.id, { name: "A Second Client", slug: "a-client-2" }).id;
  clientB = createClient(b.id, { name: "B Client", slug: "b-client" }).id;

  registerPlugin(probePlugin(PROBE, "agency"));
  registerPlugin(probePlugin(PROBE_CLIENT, "client"));

  // Install everything at BOTH agencies. The leak needs the plugin to exist in
  // the victim tenant, and a fixture where it does not would pass for the
  // wrong reason.
  for (const plugin of listPlugins()) {
    const policy = plugin.scopePolicy ?? "either";
    for (const [agencyId, clientId] of [[agencyA, clientA], [agencyA, clientA2], [agencyB, clientB]] as const) {
      if (policy !== "client") {
        upsertInstall({ pluginId: plugin.id, scope: { agencyId }, enabled: true, config: {}, features: {} });
      }
      if (policy !== "agency") {
        upsertInstall({ pluginId: plugin.id, scope: { agencyId, clientId }, enabled: true, config: {}, features: {} });
      }
    }
  }

  for (const role of ALL_ROLES) {
    const isLead = role === "lead";
    const holderAgency = isLead ? LEAD_AGENCY_ID : agencyA;
    const user = createUser({
      email: `${role}@tenancy-a.test`,
      name: role,
      role,
      agencyId: holderAgency,
      password: "tenancy-guard-pass-phrase",
    });
    tokensA.set(role, issueSession({
      userId: user.id,
      email: user.email,
      role,
      agencyId: holderAgency,
      clientId: (CLIENT_ROLES as readonly string[]).includes(role) || role === "end-customer"
        ? clientA
        : undefined,
      sessionRev: user.sessionRev ?? 0,
    }));
  }
  clientOwnerA = tokensA.get("client-owner")!;

  const bOwner = createUser({
    email: "owner@tenancy-b.test", name: "B owner", role: "agency-owner",
    agencyId: agencyB, password: "tenancy-guard-pass-phrase",
  });
  ownerB = issueSession({
    userId: bOwner.id, email: bOwner.email, role: "agency-owner",
    agencyId: agencyB, sessionRev: bOwner.sessionRev ?? 0,
  });

  const master = createUser({
    email: "master@tenancy.test", name: "master", role: "agency-owner",
    agencyId: agencyA, password: "tenancy-guard-pass-phrase",
  });
  masterAB = issueSession({
    userId: master.id, email: master.email, role: "agency-owner",
    agencyId: agencyA, agencyIds: [agencyA, agencyB], activeAgencyId: agencyA,
    sessionRev: master.sessionRev ?? 0,
  });
});

// ─── Driving the real dispatcher ──────────────────────────────────────────

interface Call {
  plugin: string;
  rest: string[];
  method: Method;
  /** Omit for an anonymous caller (the webhook shape). */
  token?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}

interface Reply { status: number; body: string; json: Record<string, unknown> | null }

async function call(input: Call): Promise<Reply> {
  const { NextRequest } = await import("next/server");
  const mod = await import("../src/app/api/portal/[module]/[...rest]/route");
  const handler = mod[input.method] as (
    req: import("next/server").NextRequest,
    ctx: { params: Promise<{ module: string; rest: string[] }> },
  ) => Promise<Response>;

  const search = new URLSearchParams(input.query ?? {}).toString();
  const url = `http://localhost/api/portal/${input.plugin}/${input.rest.join("/")}`
    + (search ? `?${search}` : "");

  const run = async (): Promise<Reply> => {
    const init: RequestInit & { headers?: Record<string, string> } = {
      method: input.method,
      headers: { "content-type": "application/json", ...(input.headers ?? {}) },
    };
    if (input.method !== "GET") init.body = JSON.stringify(input.body ?? {});
    try {
      const response = await handler(
        new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]),
        { params: Promise.resolve({ module: input.plugin, rest: input.rest }) },
      );
      const body = await response.text();
      let json: Record<string, unknown> | null = null;
      try { json = JSON.parse(body) as Record<string, unknown>; } catch { json = null; }
      return { status: response.status, body, json };
    } catch (error) {
      // Past every gate, into a handler that disliked the test body. That is a
      // REACHED route, and for this suite reaching is the failure mode — so it
      // is reported as such rather than swallowed.
      return { status: 599, body: String(error), json: null };
    }
  };

  return input.token ? withSession(input.token, run) : withRequestScope({}, run);
}

/** A refusal by the tenancy guard, or by something even earlier. */
function refused(reply: Reply): boolean {
  return reply.status === 401 || reply.status === 403 || reply.status === 404;
}

// The representative route set. Real shipped routes, every method covered,
// agency-scoped and client-scoped plugins, reads and writes.
const REPRESENTATIVE: [string, string[], Method][] = [
  ["agency-hr", ["staff"], "GET"],
  ["agency-hr", ["staff"], "POST"],
  ["agency-hr", ["staff"], "PATCH"],
  ["agency-hr", ["roles"], "DELETE"],
  ["agency-hr", ["departments"], "GET"],
  ["agency-finance", ["invoices"], "GET"],
  ["agency-finance", ["invoices"], "DELETE"],
  ["agency-finance", ["invoices", "template"], "PUT"],
  ["leads-pipeline", ["contacts"], "GET"],
  ["leads-pipeline", ["commercial"], "PUT"],
  ["agency-marketing", ["campaigns"], "DELETE"],
  ["client-crm", ["contacts"], "GET"],
  ["client-crm", ["contacts"], "DELETE"],
  ["memberships", ["plans"], "GET"],
  ["ecommerce", ["orders"], "GET"],
  ["website-editor", ["pages"], "GET"],
  [PROBE, ["probe"], "GET"],
  [PROBE, ["probe"], "POST"],
  [PROBE, ["probe"], "PATCH"],
  [PROBE, ["probe"], "PUT"],
  [PROBE, ["probe"], "DELETE"],
  [PROBE_CLIENT, ["probe"], "POST"],
];

const NEW_STAFF = {
  name: "Planted By A",
  email: "planted@tenancy.test",
  role: "Engineer",
  title: "Engineer",
  joinedAt: "2026-01-01",
};

async function staffNamesIn(agencyId: string, token: string): Promise<string[]> {
  const reply = await call({
    plugin: "agency-hr", rest: ["staff"], method: "GET", token, query: { agencyId },
  });
  const staff = (reply.json?.staff ?? []) as { name?: string }[];
  return Array.isArray(staff) ? staff.map(s => s.name ?? "") : [];
}

// ─── ARM 1: the reproduction ──────────────────────────────────────────────

describe("the reported cross-tenant write", () => {
  it("an agency-owner in A POSTing /api/portal/agency-hr/staff?agencyId=B is refused — the exact reproduction", async () => {
    const before = await staffNamesIn(agencyB, ownerB);

    const reply = await call({
      plugin: "agency-hr", rest: ["staff"], method: "POST",
      token: tokensA.get("agency-owner")!,
      query: { agencyId: agencyB },
      body: NEW_STAFF,
    });

    assert.equal(reply.status, 403,
      `POST staff?agencyId=B answered HTTP ${reply.status} — the body was ${reply.body.slice(0, 300)}`);
    assert.equal(reply.json?.error, "tenant_scope_mismatch");
    assert.ok(!reply.body.includes(agencyB),
      "the refusal echoed the other agency's id back to the caller");

    // …and nothing landed. Not in B —
    const after = await staffNamesIn(agencyB, ownerB);
    assert.deepEqual(after, before, "the refused write still reached agency B");
    assert.ok(!after.includes(NEW_STAFF.name), "agency B holds the record A tried to plant");
    // — and not, quietly, in A either. A refusal is a refusal, not a redirect.
    const home = await staffNamesIn(agencyA, tokensA.get("agency-owner")!);
    assert.ok(!home.includes(NEW_STAFF.name),
      "the write naming agency B was silently redirected into agency A");
  });

  it("…and reading it back with ?agencyId=B is refused too, while A's own agency answers", async () => {
    const stolen = await call({
      plugin: "agency-hr", rest: ["staff"], method: "GET",
      token: tokensA.get("agency-owner")!, query: { agencyId: agencyB },
    });
    assert.equal(stolen.status, 403);
    assert.ok(!stolen.body.includes(agencyB));

    const own = await call({
      plugin: "agency-hr", rest: ["staff"], method: "GET",
      token: tokensA.get("agency-owner")!, query: { agencyId: agencyA },
    });
    assert.equal(own.status, 200, `the owner lost their own staff list (HTTP ${own.status})`);
  });

  it("the same write WITHOUT the foreign agencyId lands in A, and B never sees it", async () => {
    // The other half of the claim. A guard that refused everything would pass
    // the test above and break the product.
    const created = await call({
      plugin: "agency-hr", rest: ["staff"], method: "POST",
      token: tokensA.get("agency-owner")!,
      query: { agencyId: agencyA },
      body: { ...NEW_STAFF, email: "landed@tenancy.test", name: "Landed In A" },
    });
    assert.equal(created.status, 201, `the legitimate write failed: HTTP ${created.status} ${created.body.slice(0, 200)}`);

    assert.ok((await staffNamesIn(agencyA, tokensA.get("agency-owner")!)).includes("Landed In A"),
      "the legitimate write did not land in A");
    assert.ok(!(await staffNamesIn(agencyB, ownerB)).includes("Landed In A"),
      "A's own write leaked into B");
  });

  it("the probe reports the tenant the dispatcher handed the handler, and it is always the session's", async () => {
    // The strongest form of the claim: not "403", but "the ctx said A".
    for (const method of METHODS) {
      const own = await call({
        plugin: PROBE, rest: ["probe"], method,
        token: tokensA.get("agency-owner")!, query: { agencyId: agencyA },
      });
      assert.equal(own.json?.sawAgencyId, agencyA, `${method} with ?agencyId=A saw ${own.json?.sawAgencyId}`);

      const none = await call({
        plugin: PROBE, rest: ["probe"], method, token: tokensA.get("agency-owner")!,
      });
      assert.equal(none.json?.sawAgencyId, agencyA, `${method} with no query saw ${none.json?.sawAgencyId}`);

      const foreign = await call({
        plugin: PROBE, rest: ["probe"], method,
        token: tokensA.get("agency-owner")!, query: { agencyId: agencyB },
      });
      assert.equal(foreign.status, 403, `${method} with ?agencyId=B answered HTTP ${foreign.status}`);
      assert.equal(foreign.json?.sawAgencyId, undefined,
        `${method} with ?agencyId=B reached the handler`);
    }
  });
});

// ─── ARM 2: every method, every role, the representative set ──────────────

describe("no session-holder can name another agency, on any route or verb", () => {
  it("every method × every role × the representative route set, with ?agencyId=B", async () => {
    const leaks: string[] = [];
    let asserted = 0;
    for (const [plugin, rest, method] of REPRESENTATIVE) {
      for (const role of ALL_ROLES) {
        const reply = await call({
          plugin, rest, method, token: tokensA.get(role)!, query: { agencyId: agencyB },
        });
        asserted += 1;
        if (!refused(reply)) {
          leaks.push(`${role} · ${method} /api/portal/${plugin}/${rest.join("/")}?agencyId=B → HTTP ${reply.status}`);
        }
        if (reply.body.includes(agencyB)) {
          leaks.push(`${role} · ${method} /api/portal/${plugin}/${rest.join("/")} echoed agency B's id`);
        }
      }
    }
    assert.deepEqual(leaks, [], `the dispatcher acted in another tenant:\n  ${leaks.join("\n  ")}`);
    assert.ok(asserted >= 150, `only ${asserted} cells were driven — the walk stopped walking`);
  });

  it("the header form is the same door — x-aqua-agency-id cannot name B either", async () => {
    // `?agencyId=` is only one of the two ways in; the dispatcher also reads
    // `x-aqua-agency-id`. A fix that only watched the query string would leave
    // the header wide open.
    for (const method of METHODS) {
      const reply = await call({
        plugin: PROBE, rest: ["probe"], method,
        token: tokensA.get("agency-owner")!,
        headers: { "x-aqua-agency-id": agencyB },
      });
      assert.equal(reply.status, 403, `${method} via header answered HTTP ${reply.status}`);
      assert.equal(reply.json?.sawAgencyId, undefined);
    }
  });

  it("a lead — whose session lives in the sentinel tenant — reaches neither agency", async () => {
    for (const agencyId of [agencyA, agencyB]) {
      const reply = await call({
        plugin: PROBE, rest: ["probe"], method: "POST", token: tokensA.get("lead")!, query: { agencyId },
      });
      assert.ok(refused(reply), `a lead reached ${agencyId} (HTTP ${reply.status})`);
      assert.equal(reply.json?.sawAgencyId, undefined);
    }
  });
});

// ─── ARM 3: reads never see B, with B's data actually there ───────────────

describe("reads never see the other tenant", () => {
  const SECRET = "B Secret Employee";

  before(async () => {
    const planted = await call({
      plugin: "agency-hr", rest: ["staff"], method: "POST", token: ownerB,
      query: { agencyId: agencyB },
      body: { ...NEW_STAFF, name: SECRET, email: "b-secret@tenancy.test" },
    });
    assert.equal(planted.status, 201, `could not seed agency B: ${planted.body.slice(0, 200)}`);
  });

  it("B's record is invisible to every role in A, however they ask for it", async () => {
    const attempts: [string, Call][] = [
      ["query agencyId", { plugin: "agency-hr", rest: ["staff"], method: "GET", query: { agencyId: agencyB } }],
      ["header agencyId", { plugin: "agency-hr", rest: ["staff"], method: "GET", headers: { "x-aqua-agency-id": agencyB } }],
      ["both, query first", {
        plugin: "agency-hr", rest: ["staff"], method: "GET",
        query: { agencyId: agencyB }, headers: { "x-aqua-agency-id": agencyB },
      }],
      ["agencyId plus B's client", {
        plugin: "agency-hr", rest: ["staff"], method: "GET",
        query: { agencyId: agencyB, clientId: clientB },
      }],
      ["single-record read", {
        plugin: "agency-hr", rest: ["staff", "get"], method: "GET",
        query: { agencyId: agencyB, id: "any" },
      }],
    ];
    const seen: string[] = [];
    for (const [label, shape] of attempts) {
      for (const role of ALL_ROLES) {
        const reply = await call({ ...shape, token: tokensA.get(role)! });
        if (reply.body.includes(SECRET)) seen.push(`${role} read B's staff via ${label}`);
        if (!refused(reply)) seen.push(`${role} · ${label} → HTTP ${reply.status}, not a refusal`);
      }
    }
    assert.deepEqual(seen, [], `agency B leaked:\n  ${seen.join("\n  ")}`);
  });

  it("…and B's own owner still reads it", async () => {
    assert.ok((await staffNamesIn(agencyB, ownerB)).includes(SECRET),
      "the guard cost agency B its own data");
  });
});

// ─── ARM 4: the public routes the peek exists for ─────────────────────────

describe("public routes — the reason the peek exists — still work", () => {
  it("the shipped public routes are exactly the seven, and each names its own module", () => {
    const publics = listPlugins()
      .filter(plugin => !plugin.id.startsWith("zz-"))
      .flatMap(plugin => plugin.api.filter(route => route.public === true).map(r => `${plugin.id}/${r.path}`))
      .sort();
    assert.deepEqual(publics, [
      "affiliates/webhooks/stripe",
      "agency-finance/stripe/webhook",
      "email-sender/public/webhook/postmark",
      "leads-pipeline/commercial/stripe-webhook",
      "memberships/stripe/webhook",
      "public-funnel/hc-complete",
      "public-funnel/tool-complete",
    ], "the public-route set changed — re-read the tenancy rule before shipping it");
  });

  it("an anonymous caller reaches every one of them, naming the tenant in the URL", async () => {
    // This IS the webhook: no cookie, no session, the tenant supplied by the
    // URL. Reaching the handler is the claim — what a handler then does with a
    // test body (400 invalid_body, 400 bad signature) is the handler's business.
    const blocked: string[] = [];
    for (const plugin of listPlugins()) {
      const clientScoped = (plugin.scopePolicy ?? "either") === "client";
      for (const route of plugin.api) {
        if (route.public !== true) continue;
        const rest = route.path.split("/").filter(Boolean);
        const reply = await call({
          plugin: plugin.id, rest, method: "POST",
          // A client-scoped plugin has no agency-scoped install, so its public
          // routes need BOTH ids to resolve — see the test below.
          query: clientScoped ? { agencyId: agencyB, clientId: clientB } : { agencyId: agencyB },
        });
        if (reply.status === 401 || reply.status === 403 || reply.status === 404) {
          blocked.push(`${plugin.id}/${route.path} → HTTP ${reply.status} ${reply.body.slice(0, 120)}`);
        }
      }
    }
    assert.deepEqual(blocked, [], `the tenancy guard broke a public route:\n  ${blocked.join("\n  ")}`);
  });

  it("a public route on a CLIENT-scoped plugin needs ?clientId= as well, or it 401s", async () => {
    // Pre-existing, not introduced here, and worth stating: the peek can only
    // discover `public: true` by RESOLVING the route, and resolving needs an
    // install. `memberships` and `affiliates` are client-scoped, so
    // `?agencyId=` alone finds nothing, the peek returns null, and the
    // dispatcher falls through to `requireSession` → 401. Stripe must be
    // configured with both ids on those two endpoints. If that is ever fixed
    // (by looking the route up from the manifest rather than the install),
    // this test is where the change gets noticed.
    for (const pluginId of ["memberships", "affiliates", PROBE_CLIENT]) {
      const plugin = listPlugins().find(p => p.id === pluginId)!;
      const route = plugin.api.find(r => r.public === true)!;
      const rest = route.path.split("/").filter(Boolean);
      const agencyOnly = await call({
        plugin: pluginId, rest, method: "POST", query: { agencyId: agencyB },
      });
      assert.equal(agencyOnly.status, 401,
        `${pluginId}/${route.path} with agencyId alone → HTTP ${agencyOnly.status}`);
      const both = await call({
        plugin: pluginId, rest, method: "POST", query: { agencyId: agencyB, clientId: clientB },
      });
      assert.notEqual(both.status, 401,
        `${pluginId}/${route.path} with both ids still 401s — the webhook cannot be called at all`);
    }
  });

  it("a public route lands in the agency the URL names, and the probe proves it", async () => {
    for (const [label, agencyId] of [["A", agencyA], ["B", agencyB]] as const) {
      const reply = await call({
        plugin: PROBE, rest: ["public-probe"], method: "POST", query: { agencyId },
      });
      assert.equal(reply.status, 200, `anonymous public POST for ${label} → HTTP ${reply.status}`);
      assert.equal(reply.json?.sawAgencyId, agencyId,
        `the public route landed in ${reply.json?.sawAgencyId}, not ${label}`);
    }
  });

  it("a public route with no agency named still requires a session — unchanged", async () => {
    // The pre-existing shape: without `?agencyId=` the peek cannot run, so the
    // dispatcher falls through to `requireSession`. Pinned because it is the
    // reason webhooks must carry the id, and a "simplification" that dropped
    // the peek entirely would silently 401 every webhook.
    const reply = await call({ plugin: PROBE, rest: ["public-probe"], method: "POST" });
    assert.equal(reply.status, 401);
  });

  it("holding a session does not close a public route — the documented seam, stated out loud", async () => {
    // A public route answers anonymous callers by definition. Refusing the same
    // call because the caller also holds an unrelated cookie protects nothing
    // (log out, call again) and breaks the real case: a signed-in `lead`, whose
    // session sits in the `agency_lead_global` sentinel tenant, completing a
    // funnel form that belongs to a real agency. If this is ever tightened, it
    // is a product decision and this test is where it gets argued.
    const reply = await call({
      plugin: PROBE, rest: ["public-probe"], method: "POST",
      token: tokensA.get("lead")!, query: { agencyId: agencyA },
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.json?.sawAgencyId, agencyA);
  });
});

// ─── ARM 5: the same shape on clientId ────────────────────────────────────

describe("clientId cannot name a client that is not yours", () => {
  it("an agency-side role in A cannot name a client belonging to B", async () => {
    for (const role of ["agency-owner", "agency-manager", "agency-staff"] as Role[]) {
      for (const method of METHODS) {
        const reply = await call({
          plugin: PROBE_CLIENT, rest: ["probe"], method,
          token: tokensA.get(role)!, query: { clientId: clientB },
        });
        assert.equal(reply.status, 403,
          `${role} · ${method} with B's clientId → HTTP ${reply.status}`);
        assert.equal(reply.json?.sawClientId, undefined);
      }
      // The header form too.
      const viaHeader = await call({
        plugin: PROBE_CLIENT, rest: ["probe"], method: "POST",
        token: tokensA.get(role)!, headers: { "x-aqua-client-id": clientB },
      });
      assert.equal(viaHeader.status, 403, `${role} named B's client through the header`);
    }
  });

  it("…and their own agency's clients still resolve", async () => {
    for (const clientId of [clientA, clientA2]) {
      const reply = await call({
        plugin: PROBE_CLIENT, rest: ["probe"], method: "POST",
        token: tokensA.get("agency-owner")!, query: { clientId },
      });
      assert.equal(reply.status, 200, `the owner lost their own client ${clientId}`);
      assert.equal(reply.json?.sawClientId, clientId);
      assert.equal(reply.json?.sawAgencyId, agencyA);
    }
  });

  it("a client-side role is pinned to its own client — including B's", async () => {
    for (const role of [...CLIENT_ROLES, "end-customer"] as Role[]) {
      for (const foreign of [clientA2, clientB]) {
        const reply = await call({
          plugin: PROBE_CLIENT, rest: ["probe"], method: "POST",
          token: tokensA.get(role)!, query: { clientId: foreign },
        });
        assert.ok(refused(reply),
          `${role} named ${foreign === clientB ? "B's" : "a sibling"} client → HTTP ${reply.status}`);
        assert.equal(reply.json?.sawClientId, undefined);
      }
    }
  });

  it("a client-side session with NO clientId is refused, not waved through", async () => {
    // The pre-fix guard read `queryClientId && session.clientId && …`, so a
    // client-role session missing its clientId skipped the check entirely and
    // could name anybody's client. Driven through the pure decision because
    // issuing such a session is the anomaly being guarded against.
    const decision = resolveApiTenantScope({
      session: { role: "client-owner", agencyId: agencyA, clientId: undefined },
      queryClientId: clientB,
      isPublic: false,
    });
    assert.deepEqual(decision, { ok: false, status: 403, error: "forbidden" });
  });

  it("an unknown clientId is not a refusal, and resolves to nothing", async () => {
    // Deliberate: an id naming no client cannot cross a tenant boundary (it
    // selects no install and filters to nothing), and refusing it would break
    // the callers that pass a not-yet-created id. Stated here so the choice is
    // visible rather than accidental.
    const reply = await call({
      plugin: PROBE, rest: ["probe"], method: "POST",
      token: tokensA.get("agency-owner")!, query: { clientId: "client_does_not_exist" },
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.json?.sawAgencyId, agencyA);
    assert.equal(reply.json?.sawClientId, "client_does_not_exist");
  });
});

// ─── ARM 6: R025 multi-agency ─────────────────────────────────────────────

describe("a master user's own agencies are still their own", () => {
  it("naming agency B works when B is in the session's membership", async () => {
    const reply = await call({
      plugin: PROBE, rest: ["probe"], method: "POST", token: masterAB, query: { agencyId: agencyB },
    });
    assert.equal(reply.status, 200, `the agency switcher broke (HTTP ${reply.status})`);
    assert.equal(reply.json?.sawAgencyId, agencyB);
  });

  it("…and an agency outside the membership is still refused", async () => {
    const outsider = createAgency({ name: "Tenancy C", slug: `tenancy-c-${Date.now()}` });
    upsertInstall({ pluginId: PROBE, scope: { agencyId: outsider.id }, enabled: true, config: {}, features: {} });
    const reply = await call({
      plugin: PROBE, rest: ["probe"], method: "POST", token: masterAB, query: { agencyId: outsider.id },
    });
    assert.equal(reply.status, 403);
    assert.equal(reply.json?.sawAgencyId, undefined);
  });

  it("a single-agency session's membership is its one agency, not 'anything with an install'", () => {
    assert.deepEqual(
      resolveApiTenantScope({
        session: { role: "agency-owner", agencyId: agencyA },
        queryAgencyId: agencyB,
        isPublic: false,
      }),
      { ok: false, status: 403, error: "tenant_scope_mismatch" },
    );
    assert.deepEqual(
      resolveApiTenantScope({
        session: { role: "agency-owner", agencyId: agencyA, agencyIds: [agencyA, agencyB] },
        queryAgencyId: agencyB,
        isPublic: false,
      }),
      { ok: true, agencyId: agencyB, clientId: undefined },
    );
  });
});

// ─── ARM 7: mutation checks ───────────────────────────────────────────────

describe("the tenancy guard can see a hole", () => {
  it("the resolver STILL hands over agency B — the refusal is the only thing stopping it", async () => {
    // The mutation, made concrete. Revert the fix and `resolved` becomes the
    // peek again; this asserts what the peek resolves to, so the test would
    // fail the moment the refusal above stopped running. If this ever returns
    // A, the fixture has drifted and every arm above is passing for free.
    const peeked = resolvePluginApiRoute("agency-hr", ["staff"], { agencyId: agencyB }, "POST");
    assert.ok(peeked, "the peek no longer resolves at agency B — re-read this fixture");
    assert.equal(peeked.install.agencyId, agencyB,
      "the peek stopped resolving B's install; the reproduction is no longer reproducible");
    assert.notEqual(peeked.install.id,
      resolvePluginApiRoute("agency-hr", ["staff"], { agencyId: agencyA }, "POST")!.install.id,
      "A and B share an install — the fixture cannot show a cross-tenant landing");
  });

  it("the pre-fix rule, written out, leaks on every cell this guard refuses", () => {
    // The negative control. `peeked ?? …` amounts to "the query wins whenever
    // it names an install", i.e. `queryAgencyId ?? session.agencyId`. Running
    // it over the same inputs must produce a pile of cross-tenant landings, or
    // the arms above are passing for the wrong reason.
    const preFix = (queryAgencyId: string | undefined, sessionAgencyId: string) =>
      queryAgencyId ?? sessionAgencyId;

    const leaked: string[] = [];
    for (const role of ALL_ROLES) {
      const sessionAgency = role === "lead" ? LEAD_AGENCY_ID : agencyA;
      const old = preFix(agencyB, sessionAgency);
      const now = resolveApiTenantScope({
        session: { role, agencyId: sessionAgency, clientId: clientA },
        queryAgencyId: agencyB,
        isPublic: false,
      });
      if (old === agencyB) leaked.push(`${role} → ${old}`);
      assert.equal(now.ok, false, `${role} is no longer refused`);
    }
    assert.equal(leaked.length, ALL_ROLES.length,
      `the pre-fix rule only leaked ${leaked.length} of ${ALL_ROLES.length} roles — that is not the reported bug`);
  });

  it("the dispatcher no longer reuses the peek as the authoritative resolution", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../src/app/api/portal/[module]/[...rest]/route.ts", import.meta.url), "utf8");
    // Comment lines stripped first: the fix's own commentary quotes the broken
    // line on purpose, and a bare grep would fail on the explanation.
    const code = source.split("\n").filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
    assert.ok(!/const\s+resolved\s*=\s*peeked\s*\?\?/.test(code),
      "`const resolved = peeked ?? …` is back — the peek is authoritative again");
    assert.ok(/peeked \?\? …/.test(source),
      "the comment naming the broken line went away — the next reader loses the why");
    assert.match(source, /resolveApiTenantScope\(/,
      "the dispatcher stopped asking the tenancy module who the tenant is");
    assert.match(source, /if \(!scope\.ok\)/,
      "the dispatcher stopped refusing on a tenancy mismatch");
  });

  it("the decision refuses before anything is resolved, so no handler and no install is touched", () => {
    // Order matters: the refusal has to happen before `resolvePluginApiRoute`,
    // or a mutating handler runs against the wrong install and the 403 is a
    // receipt for work already done.
    const decision = resolveApiTenantScope({
      session: { role: "agency-owner", agencyId: agencyA },
      queryAgencyId: agencyB,
      isPublic: false,
      clientOwner: () => { throw new Error("the client lookup ran on a refused tenant"); },
    });
    assert.equal(decision.ok, false);
  });

  it("an anonymous caller on a NON-public route gets nothing, even naming an agency", () => {
    // Belt and braces on the pure function: the dispatcher requires a session
    // before it ever calls this, but if that order is ever inverted the module
    // must not hand a tenant to a caller who proved nothing.
    assert.deepEqual(
      resolveApiTenantScope({ session: null, queryAgencyId: agencyB, isPublic: false }),
      { ok: false, status: 403, error: "tenant_scope_mismatch" },
    );
  });
});
