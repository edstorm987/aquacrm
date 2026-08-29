// THE API BEHIND THE PAGES: WHO MAY CALL IT?
//
// `smoke-plugin-page-host-gates.test.ts` closed the read door — three hosts,
// a surface per page, a ceiling per surface, and an undeclared page inheriting
// the ceiling instead of the host's much wider one. This file asks the same
// question of the layer underneath, where the answer was still "anyone with a
// session":
//
//   • `/api/portal/[module]/[...rest]` had NO surface rule. Its only gate was
//     `route.visibleToRoles ?? route.roles`, and **133 of the 312 registered
//     plugin API routes declare neither**. A closed page whose API still
//     answers is not closed.
//   • `/portal/clients/[clientId]` (the client record workspace — finance,
//     contracts, the relationship ledger, internal notes) still gated on
//     `requireRoleForClient([...ALL_ROLES])`, so an `end-customer` ATTACHED to
//     the client reached it by typing the URL. It is not a plugin page, so the
//     page fix could not reach it.
//
// The shape here mirrors the page suite deliberately:
//
//   ARM 1  The real dispatcher, driven for real. Every registered route, every
//          method it declares, every one of the eight roles, with a REAL signed
//          session — compared against `effectiveApiRoles`. Mutating verbs
//          included: the refusal happens before `route.handler` runs, so a
//          POST that must be refused is proven refused, not assumed.
//   ARM 2  The invariants behind arm 1's expectation, including the count of
//          undeclared routes — the number that made this a finding.
//   ARM 3  The client record workspace and its siblings, driven with real
//          sessions for all eight roles.
//   ARM 4  Mutation checks. A guard nobody has watched fail is a guess.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { isNextNotFound, isNextRedirect, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

// The client-workspace page imports `next/link` and client components that
// reach for `React.createContext` / `React.Component`, absent from the
// react-server build the suite runs under. Every gate under test throws long
// before any of that renders. (Same trick as smoke-plugin-page-host-gates.)
import * as React from "react";
type ReactShim = { createContext?: unknown; Component?: unknown; default?: ReactShim };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
class StubComponent { props: unknown; state: unknown; setState() {} render(): unknown { return null; } }
function shimReact(target: ReactShim | undefined) {
  if (!target) return;
  target.createContext ??= stubContext;
  target.Component ??= StubComponent;
  shimReact(target.default);
}
shimReact(React as unknown as ReactShim);

import { issueSession, AuthError } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { upsertInstall } from "../src/server/pluginInstalls";
import { listPlugins, registerPlugin } from "../src/built-ins/runtime/_registry";
import { pluginApiRouteAllowedRoles } from "../src/built-ins/runtime/_types";
import type { AquaPlugin, PluginApiRoute, PluginPage } from "../src/built-ins/runtime/_types";
import {
  HOST_SURFACES,
  SURFACE_ROLE_CEILING,
  apiRoleCeiling,
  apiRouteAllowsRole,
  apiRouteBackingPage,
  effectiveApiRoles,
  effectivePageRoles,
  pageResolvesAt,
  pluginApiSurfaces,
  scopePolicySurfaces,
  type HostSurface,
} from "../src/built-ins/runtime/_pageScope";
import { ALL_ROLES, AGENCY_ROLES, CLIENT_ROLES, LEAD_AGENCY_ID, type Role } from "../src/server/types";

// ─── Fixture ──────────────────────────────────────────────────────────────

let agencyId = "";
let clientId = "";
const tokens = new Map<Role, string>();

/** The registry as it SHIPS — synthetic manifests excluded. The counts in
 *  arm 2 are claims about the product, not about this test's scaffolding. */
const SYNTH_PREFIX = "zz-api-synthetic";
function shippedPlugins(): AquaPlugin[] {
  return listPlugins().filter(plugin => !plugin.id.startsWith(SYNTH_PREFIX));
}

function synthPlugin(overrides: Partial<AquaPlugin> & { id: string }): AquaPlugin {
  return {
    name: overrides.id,
    version: "1.0.0",
    status: "stable",
    category: "ops",
    tagline: "t",
    description: "d",
    navItems: [],
    pages: [],
    api: [],
    settings: { groups: [] },
    features: [],
    ...overrides,
  } as AquaPlugin;
}

const noop = async () => new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

// The "313th route": manifests written after this test, by an author who
// declares nothing. If the fix depended on the twelve shipped manifests being
// individually correct, these would leak.
const SYNTH_AGENCY = `${SYNTH_PREFIX}-agency`;
const SYNTH_CLIENT = `${SYNTH_PREFIX}-client`;
const SYNTH_CUSTOMER = `${SYNTH_PREFIX}-customer`;

before(async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "API Gates", slug: `api-gates-${Date.now()}` });
  agencyId = agency.id;
  const client = createClient(agency.id, { name: "API Gates Client", slug: "api-gates-client" });
  clientId = client.id;

  registerPlugin(synthPlugin({
    id: SYNTH_AGENCY,
    scopePolicy: "agency",
    api: [{ path: "secret", methods: ["GET", "POST"], handler: noop }],
  }));
  registerPlugin(synthPlugin({
    id: SYNTH_CLIENT,
    scopePolicy: "client",
    api: [{ path: "secret", methods: ["GET", "POST"], handler: noop }],
  }));
  // A client-scoped plugin that ALSO owns a shopper page — the shape that
  // legitimately keeps `end-customer` in a ceiling.
  registerPlugin(synthPlugin({
    id: SYNTH_CUSTOMER,
    scopePolicy: "client",
    pages: [{
      path: `/portal/customer/${SYNTH_PREFIX}-customer`,
      component: async () => ({ default: () => null }),
      visibleToRoles: ["end-customer"],
    }],
    api: [
      { path: "me", methods: ["GET"], handler: noop, visibleToRoles: ["end-customer"] },
      { path: "back-office", methods: ["GET"], handler: noop },
    ],
  }));

  // The MOST permissive install picture: every plugin at every scope its
  // policy permits. If a route is unreachable here it is unreachable anywhere.
  for (const plugin of listPlugins()) {
    const policy = plugin.scopePolicy ?? "either";
    if (policy !== "client") {
      upsertInstall({ pluginId: plugin.id, scope: { agencyId }, enabled: true, config: {}, features: {} });
    }
    if (policy !== "agency") {
      upsertInstall({ pluginId: plugin.id, scope: { agencyId, clientId }, enabled: true, config: {}, features: {} });
    }
  }

  for (const role of ALL_ROLES) {
    const isLead = role === "lead";
    const holderAgency = isLead ? LEAD_AGENCY_ID : agencyId;
    const user = createUser({
      email: `${role}@api-gates.test`,
      name: role,
      role,
      agencyId: holderAgency,
      password: "api-gates-pass-phrase",
    });
    tokens.set(role, issueSession({
      userId: user.id,
      email: user.email,
      role,
      agencyId: holderAgency,
      // Client-side roles are scoped to THIS client so the dispatcher's tenancy
      // pre-check passes and the only thing left to refuse them is the gate
      // under test. A leak has to be a real leak, not a tenancy accident.
      clientId: (CLIENT_ROLES as readonly string[]).includes(role) || role === "end-customer"
        ? clientId
        : undefined,
      sessionRev: user.sessionRev ?? 0,
    }));
  }
});

// ─── Driving the real dispatcher ──────────────────────────────────────────

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Call the REAL `/api/portal/[module]/[...rest]` handler with a real signed
 * session. Nothing about the gate is stubbed.
 *
 * A handler that throws counts as REACHED — a broken plugin handler is not
 * access control, and the throw proves the request got past every gate.
 */
async function callApi(pluginId: string, rest: string[], method: Method, role: Role): Promise<number> {
  const { NextRequest } = await import("next/server");
  const mod = await import("../src/app/api/portal/[module]/[...rest]/route");
  const handler = mod[method] as (
    req: import("next/server").NextRequest,
    ctx: { params: Promise<{ module: string; rest: string[] }> },
  ) => Promise<Response>;

  // Both scope hints supplied on purpose: the dispatcher needs `agencyId` to
  // peek a `public: true` route before requiring a session, and `clientId`
  // both satisfies the tenancy pre-check for client-side roles and resolves
  // the client-scoped install. This is the most FAVOURABLE request a caller
  // could make — anything refused here is refused everywhere.
  const url = `http://localhost/api/portal/${pluginId}/${rest.join("/")}`
    + `?agencyId=${encodeURIComponent(agencyId)}&clientId=${encodeURIComponent(clientId)}`;

  return withSession(tokens.get(role)!, async () => {
    try {
      const response = await handler(
        new NextRequest(url, method === "GET" ? undefined : { method, body: "{}" }),
        { params: Promise.resolve({ module: pluginId, rest }) },
      );
      return response.status;
    } catch {
      // Past every gate, into a handler that did not like an empty body.
      return 200;
    }
  });
}

function routeRest(route: PluginApiRoute): string[] {
  return route.path.split("/").filter(Boolean);
}

// ─── ARM 1: the real dispatcher, the real sessions ────────────────────────

describe("plugin API routes — the real dispatcher, driven with a real session for every role", () => {
  it("no route answers a role its surface does not serve — every route, every method, all eight roles", async () => {
    const violations: string[] = [];
    let asserted = 0;
    let refusedCells = 0;
    let admittedCells = 0;
    let mutatingCells = 0;

    for (const plugin of listPlugins()) {
      for (const route of plugin.api) {
        if (route.public === true) continue; // outside the role system by design
        const rest = routeRest(route);
        // A parameterised path can't be driven literally; the manifest ships
        // exactly one (`sitemap-:locale.xml`) and its gate is the same object.
        if (rest.some(segment => segment.includes(":"))) continue;
        for (const method of route.methods) {
          for (const role of ALL_ROLES) {
            const shouldAnswer = apiRouteAllowsRole(plugin, route, role);
            // Both directions are driven, with one deliberate asymmetry: an
            // ADMITTED mutating verb is not called, because the gate is the
            // only thing under test and running 400-odd real POST/DELETE
            // handlers would be testing the plugins instead. The admitted GET
            // proves the door still opens; arm 1b names the writes that must.
            if (shouldAnswer && method !== "GET") continue;
            const status = await callApi(plugin.id, rest, method, role);
            asserted += 1;
            if (!shouldAnswer && method !== "GET") mutatingCells += 1;
            if (shouldAnswer) {
              admittedCells += 1;
              // A handler that 500s, 400s or throws still got past the gate.
              // Only 403 means the gate itself refused someone it should not.
              if (status === 403) {
                violations.push(
                  `${role} · ${method} /api/portal/${plugin.id}/${route.path} → 403,`
                  + ` but the gate says ${effectiveApiRoles(plugin, route).join(", ")}`,
                );
              }
              continue;
            }
            // 403 is the gate. 404 is the only other legitimate refusal, and
            // only for `lead`, whose sentinel agency holds no installs at all
            // — it is refused a step EARLIER than the gate.
            const legitimate = status === 403 || (role === "lead" && status === 404);
            if (!legitimate) {
              violations.push(
                `${role} · ${method} /api/portal/${plugin.id}/${route.path} → HTTP ${status};`
                + ` effective gate = ${effectiveApiRoles(plugin, route).join(", ") || "(nobody)"}`,
              );
            } else {
              refusedCells += 1;
            }
          }
        }
      }
    }

    assert.deepEqual(violations, [],
      `the dispatcher answered a role the route's surface does not serve:\n  ${violations.join("\n  ")}`);
    // Guard the guard: if the walk ever stops walking these fail loudly rather
    // than passing an empty violation list.
    assert.ok(asserted > 1500, `only ${asserted} route/method/role cells were driven — the walk stopped walking`);
    assert.ok(mutatingCells > 400, `only ${mutatingCells} MUTATING cells were refused — the write side is not covered`);
    assert.ok(admittedCells > 300,
      `only ${admittedCells} cells were ADMITTED — if everything is refused the gate proves nothing`);
    assert.equal(refusedCells + admittedCells, asserted);
  });

  it("…and the surfaces that are supposed to work still answer", async () => {
    // The admit direction. `status !== 403` is the claim: the handler was
    // reached, whatever it then decided to do with an empty test body.
    const allowed: [Role, string, string[], Method, string][] = [
      ["agency-owner", "agency-finance", ["budgets"], "GET", "the owner's budgets"],
      ["agency-manager", "agency-finance", ["operations", "payments"], "GET", "operations payments"],
      ["agency-staff", "agency-finance", ["invoices"], "GET", "invoices (the viewer section)"],
      ["agency-staff", "agency-hr", ["staff"], "GET", "the staff directory"],
      ["agency-staff", "agency-marketing", ["campaigns"], "GET", "marketing campaigns"],
      ["agency-staff", "leads-pipeline", ["contacts"], "GET", "leads contacts"],
      ["agency-staff", "email-sender", ["messages"], "GET", "the email outbox"],
      ["client-owner", "client-crm", ["contacts"], "GET", "the client's own CRM"],
      ["client-owner", "ecommerce", ["orders"], "GET", "the client's store orders"],
      ["client-staff", "memberships", ["plans"], "GET", "the client's membership plans"],
      ["client-owner", "affiliates", ["payouts"], "GET", "the client's affiliate payouts"],
      ["freelancer", "website-editor", ["pages"], "GET", "the website editor's pages"],
      // The shopper's own data, which is the whole reason the customer surface
      // is part of a client-scoped plugin's ceiling.
      ["end-customer", "memberships", ["me"], "GET", "the shopper's own membership"],
      ["end-customer", "affiliates", ["me"], "GET", "the shopper's own affiliate record"],
      ["end-customer", "client-crm", ["me", "profile"], "GET", "the shopper's own profile"],
      // …and a write the shopper is entitled to make.
      ["end-customer", "memberships", ["me", "cancel"], "POST", "cancelling their own membership"],
    ];
    const lost: string[] = [];
    for (const [role, pluginId, rest, method, label] of allowed) {
      const status = await callApi(pluginId, rest, method, role);
      if (status === 403) lost.push(`${role} lost ${label} (${method} /api/portal/${pluginId}/${rest.join("/")})`);
    }
    assert.deepEqual(lost, [], `the narrowing broke legitimate access:\n  ${lost.join("\n  ")}`);
  });

  it("the named leaks are refused, including the writes behind closed pages", async () => {
    // Every row is a role the PAGE layer already refuses, calling the API that
    // backs that same page. Before this fix each one answered.
    const proven: [Role, string, string[], Method][] = [
      // Undeclared routes that fell through to "anyone with a session".
      ["end-customer", "website-editor", ["pages"], "GET"],
      ["end-customer", "website-editor", ["pages"], "DELETE"],
      ["end-customer", "website-editor", ["users", "force-password"], "POST"],
      ["end-customer", "ecommerce", ["orders"], "GET"],
      ["end-customer", "ecommerce", ["products"], "POST"],
      ["end-customer", "fulfillment", ["marketplace", "install"], "POST"],
      ["end-customer", "fulfillment", ["phases"], "DELETE"],
      ["lead", "website-editor", ["sites"], "GET"],
      ["lead", "ecommerce", ["discounts"], "POST"],
      // Client-side roles reaching an AGENCY-scoped plugin's API.
      ["client-owner", "agency-hr", ["staff"], "GET"],
      ["client-owner", "agency-finance", ["operations", "profiles"], "GET"],
      ["client-staff", "agency-marketing", ["leads"], "GET"],
      ["freelancer", "leads-pipeline", ["contacts"], "GET"],
      ["end-customer", "agency-hr", ["staff", "archive"], "POST"],
      // A client role reaching the agency's own fulfilment controls.
      ["client-owner", "fulfillment", ["phases"], "GET"],
      ["client-owner", "fulfillment", ["marketplace"], "GET"],
      // The route-wider-than-its-page class: the page hides these from staff.
      ["agency-staff", "agency-hr", ["roles"], "GET"],
      ["agency-staff", "leads-pipeline", ["campaigns"], "GET"],
      ["agency-staff", "fulfillment", ["phases"], "GET"],
      // A shopper reaching the operator's back office on a plugin that DOES
      // have a customer surface — the surface is not a blanket pass.
      ["end-customer", "memberships", ["subscribers"], "GET"],
      ["end-customer", "affiliates", ["payouts"], "GET"],
      ["end-customer", "client-crm", ["contacts"], "GET"],
    ];
    const open: string[] = [];
    for (const [role, pluginId, rest, method] of proven) {
      const status = await callApi(pluginId, rest, method, role);
      if (status !== 403 && !(role === "lead" && status === 404)) {
        open.push(`${role} · ${method} /api/portal/${pluginId}/${rest.join("/")} → HTTP ${status}`);
      }
    }
    assert.deepEqual(open, [], `still open:\n  ${open.join("\n  ")}`);
  });

  it("a lead reaches no plugin API route at all, and the gate says so before the install does", async () => {
    // `lead` is in no surface's ceiling — `_pageScope.ts` says leads have no
    // portal surface, and the API agrees. It is ALSO refused a step earlier:
    // a lead's session carries the LEAD_AGENCY_ID sentinel, which holds no
    // installs, so `resolvePluginApiRoute` returns nothing. Both are asserted
    // because relying on the second alone would break the day someone installs
    // a plugin at the sentinel agency.
    for (const plugin of shippedPlugins()) {
      for (const route of plugin.api) {
        if (route.public === true) continue;
        assert.ok(!effectiveApiRoles(plugin, route).includes("lead"),
          `${plugin.id}/${route.path} admits a lead`);
      }
    }
    for (const [pluginId, rest] of [["public-funnel", ["me-context"]], ["website-editor", ["config"]]] as const) {
      const status = await callApi(pluginId, [...rest], "GET", "lead");
      assert.notEqual(status, 200, `a lead answered /api/portal/${pluginId}/${rest.join("/")}`);
    }
  });

  it("a public route is still public — the new gate does not touch it", async () => {
    // `public: true` means the handler does its own auth (HMAC, capture
    // handoff). Those routes never had a session to gate with, and gating them
    // by role now would break every webhook at once.
    const publics = shippedPlugins().flatMap(plugin =>
      plugin.api.filter(route => route.public === true).map(route => [plugin, route] as const));
    assert.ok(publics.length >= 7, `only ${publics.length} public routes found — the fixture drifted`);
    for (const [plugin, route] of publics) {
      assert.deepEqual(effectiveApiRoles(plugin, route), [...ALL_ROLES],
        `${plugin.id}/${route.path} is public but the role model narrowed it`);
    }
  });
});

// ─── ARM 2: the invariants behind the expectation ─────────────────────────

describe("plugin API routes — surface invariants no manifest can break", () => {
  it("every route's effective roles are inside the union of its plugin's surface ceilings", () => {
    const violations: string[] = [];
    for (const plugin of listPlugins()) {
      const ceiling = new Set<Role>();
      for (const surface of pluginApiSurfaces(plugin)) {
        for (const role of SURFACE_ROLE_CEILING[surface]) ceiling.add(role);
      }
      for (const route of plugin.api) {
        if (route.public === true) continue;
        const over = effectiveApiRoles(plugin, route).filter(role => !ceiling.has(role));
        if (over.length) violations.push(`${plugin.id}/${route.path} admits ${over.join(", ")}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it("no route is wider than the page it backs, on any surface that page serves", () => {
    // The rule the last pass asserted for five named routes, stated over all
    // of them. Compared surface by surface on purpose: memberships' `plans`
    // GET backs the operator's Plans page AND serves the shopper, and a
    // whole-blob comparison would strip the shopper to satisfy a page that
    // was never for them.
    const violations: string[] = [];
    for (const plugin of listPlugins()) {
      for (const route of plugin.api) {
        if (route.public === true) continue;
        const backing = apiRouteBackingPage(plugin, route);
        if (!backing) continue;
        const effective = effectiveApiRoles(plugin, route);
        for (const surface of HOST_SURFACES) {
          if (!pageResolvesAt(plugin, backing, surface)) continue;
          const pageRoles = effectivePageRoles(plugin, backing, surface);
          const onSurface = effective.filter(role => SURFACE_ROLE_CEILING[surface].includes(role));
          const wider = onSurface.filter(role => !pageRoles.includes(role));
          if (wider.length) {
            violations.push(
              `${plugin.id}/${route.path} at ${surface} admits ${wider.join(", ")}, `
              + `but the page it backs ("${backing.path || "(index)"}") does not`,
            );
          }
        }
      }
    }
    assert.deepEqual(violations, [], `routes wider than their pages:\n  ${violations.join("\n  ")}`);
  });

  it("an agency-scoped plugin's API never answers a client role, a shopper or a lead", () => {
    const violations: string[] = [];
    for (const plugin of listPlugins()) {
      if ((plugin.scopePolicy ?? "either") !== "agency") continue;
      for (const route of plugin.api) {
        if (route.public === true) continue;
        const over = effectiveApiRoles(plugin, route).filter(role => !AGENCY_ROLES.includes(role));
        if (over.length) violations.push(`${plugin.id}/${route.path} admits ${over.join(", ")}`);
      }
    }
    assert.deepEqual(violations, []);
  });

  it("only a plugin that owns a /portal/customer page can answer a shopper", () => {
    // The mechanism that keeps `end-customer` alive on memberships / affiliates
    // / client-crm and nowhere else. A plugin cannot back into the shopper
    // surface by having an install scope, exactly as with pages.
    for (const plugin of listPlugins()) {
      const ownsCustomerPage = plugin.pages.some(page => page.path.startsWith("/portal/customer/"));
      for (const route of plugin.api) {
        if (route.public === true) continue;
        const admits = effectiveApiRoles(plugin, route).includes("end-customer");
        if (admits) {
          assert.ok(ownsCustomerPage,
            `${plugin.id}/${route.path} answers a shopper but ${plugin.id} owns no /portal/customer page`);
        }
      }
    }
    const withCustomer = listPlugins().filter(p => p.pages.some(pg => pg.path.startsWith("/portal/customer/")));
    assert.ok(withCustomer.length >= 3, "the shopper-surface plugins vanished — re-read this test");
  });

  it("the undeclared-route count is what made this a finding, and it is now harmless", () => {
    // Not a hand-counted number: computed from the shipped registry. It is
    // pinned so the next author sees the scale of what default-deny is
    // carrying — and so a manifest sweep that "fixes" it by declaring roles
    // everywhere has to say so out loud here.
    let total = 0;
    let undeclared = 0;
    let publicRoutes = 0;
    for (const plugin of shippedPlugins()) {
      for (const route of plugin.api) {
        total += 1;
        if (route.public === true) publicRoutes += 1;
        if (!pluginApiRouteAllowedRoles(route)) undeclared += 1;
      }
    }
    // 2026-08-27: total 312 → 313 → 315, undeclared 133 → 135 (unchanged by the
    // second move: `leads/restore` and `leads/purge` both DECLARE their roles).
    //
    // Moving these numbers is only honest if the LOOP BELOW was run first, and
    // it was — separately, because the assertions here short-circuit before it.
    // All 128 undeclared non-public routes were re-checked against the ceiling:
    // **zero are open**. No route answers a lead, none answers a shopper without
    // owning a `/portal/customer/` page, and none answers every role. The
    // undeclared count rising is not by itself a finding; the ceiling failing
    // would be, and it has not.
    //
    // (`undeclared` counts the 7 public routes too — they declare no roles by
    // definition — so 135 = 128 gated + 7 public.)
    //
    // 2026-08-27, later: 315 → 316, undeclared 135 → 136. One route,
    // `website-editor /export`, which mounts the static-export handler that had
    // been written and tested but never registered — the Customise page's
    // Export button called `/api/admin/export-code`, which is not a route in
    // this app (issue #30).
    //
    // It declares no roles, which is this module's convention: the
    // website-editor manifest declares `visibleToRoles` on **none** of its
    // routes, so all of them inherit the ceiling rather than a second list that
    // could drift from the pages they back. The loop below was re-run and still
    // reports zero open routes, and the new one was also checked live on a dev
    // lane — anonymous GET answers 401, an owner without `siteId` answers 400,
    // and an owner with one gets a 200 `application/zip`.
    // 2026-08-28: 316 → 333. Seventeen routes, all from one addition — the
    // client-crm `journey-pipelines` add-on (boards, stages, cards,
    // automations). **`undeclared` did not move**, which is the number that
    // matters: every one of the seventeen declares `visibleToRoles`, so none
    // of them inherits the ceiling. They also carry
    // `requiresFeature: "journey-pipelines"`, so the dispatcher refuses them
    // outright for a client without the add-on.
    //
    // The loop below was re-run separately before this line was touched, as
    // the note above requires: **zero open routes**, unchanged. Counts
    // verified by enumeration, not by adding 17 to the old number:
    // total 333, undeclared 136, public 7.
    assert.equal(total, 333, `the registry now ships ${total} API routes, not 333 — re-run the enumeration`);
    assert.equal(undeclared, 136, `${undeclared} routes declare no roles, not 136 — re-run the enumeration`);
    assert.equal(publicRoutes, 7, `${publicRoutes} routes are public, not 7`);

    // …and none of them is open. This is the whole point: the count can stay
    // wherever it lands for ever, because the fallback is the ceiling and not
    // the door. THIS loop is the assertion that matters — the counts above are
    // only tripwires that make someone come and read it.
    for (const plugin of shippedPlugins()) {
      for (const route of plugin.api) {
        if (route.public === true) continue;
        if (pluginApiRouteAllowedRoles(route)) continue;
        const effective = effectiveApiRoles(plugin, route);
        assert.ok(!effective.includes("end-customer") || plugin.pages.some(p => p.path.startsWith("/portal/customer/")),
          `undeclared ${plugin.id}/${route.path} answers a shopper`);
        assert.ok(!effective.includes("lead"), `undeclared ${plugin.id}/${route.path} answers a lead`);
        assert.ok(effective.length < ALL_ROLES.length,
          `undeclared ${plugin.id}/${route.path} still answers everybody`);
      }
    }
  });

  it("an unrecognised scopePolicy resolves to NO surface, not every surface", () => {
    // `_pageScope.ts:124` used to end in `default: return ["agency","client"]`,
    // so a policy this file does not understand — a typo, or a member added to
    // the union without updating the switch — silently became the WIDEST
    // answer, in the one file whose whole argument is default-deny.
    const bogus = { scopePolicy: "global" } as unknown as AquaPlugin;
    assert.deepEqual(scopePolicySurfaces(bogus), []);
    assert.deepEqual(pluginApiSurfaces({ ...bogus, pages: [] } as AquaPlugin), []);
    // The declared values are unchanged, and absent still means "either" so a
    // plugin that installs at both scopes still renders at both.
    assert.deepEqual(scopePolicySurfaces({ scopePolicy: "agency" } as AquaPlugin), ["agency"]);
    assert.deepEqual(scopePolicySurfaces({ scopePolicy: "client" } as AquaPlugin), ["client"]);
    assert.deepEqual(scopePolicySurfaces({ scopePolicy: "either" } as AquaPlugin), ["agency", "client"]);
    assert.deepEqual(scopePolicySurfaces({} as AquaPlugin), ["agency", "client"]);
  });
});

// ─── ARM 3: the client record workspace ───────────────────────────────────

type Outcome = "rendered" | "not-found" | "auth-denied" | "redirect";

function classify(thrown: unknown): Outcome {
  if (isNextNotFound(thrown)) return "not-found";
  if (isNextRedirect(thrown)) return "redirect";
  if (thrown instanceof AuthError) return "auth-denied";
  // Threw AFTER the gate let the request through — a broken component is not
  // access control. Count it as reached.
  return "rendered";
}

async function driveClientRoute(
  which: "overview" | "settings",
  role: Role,
  searchParams: Record<string, string> = {},
): Promise<Outcome> {
  const mod = which === "overview"
    ? await import("../src/app/portal/clients/[clientId]/page")
    : await import("../src/app/portal/clients/[clientId]/settings/page");
  const route = mod.default as (props: {
    params: Promise<Record<string, unknown>>;
    searchParams: Promise<Record<string, string>>;
  }) => Promise<unknown>;
  return withSession(tokens.get(role)!, async () => {
    try {
      await route({
        params: Promise.resolve({ clientId }),
        searchParams: Promise.resolve(searchParams),
      });
      return "rendered";
    } catch (error) {
      return classify(error);
    }
  });
}

async function driveClientLayout(role: Role): Promise<Outcome> {
  const mod = await import("../src/app/portal/clients/[clientId]/layout");
  const layout = mod.default as (props: {
    children: unknown;
    params: Promise<Record<string, unknown>>;
  }) => Promise<unknown>;
  return withSession(tokens.get(role)!, async () => {
    try {
      await layout({ children: null, params: Promise.resolve({ clientId }) });
      return "rendered";
    } catch (error) {
      return classify(error);
    }
  });
}

describe("the client record workspace — a real session for every role", () => {
  it("its gate IS the client surface's ceiling, not a second list that can drift", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../src/app/portal/clients/[clientId]/page.tsx", import.meta.url), "utf8"));
    assert.match(source, /requireRoleForClient\(\[\.\.\.SURFACE_ROLE_CEILING\.client\]/,
      "the overview page stopped deriving its gate from the shared ceiling");
    // Anchored to a statement, not a substring: the comment above the gate
    // quotes the old call on purpose, and a bare grep would fail on the
    // explanation of the fix.
    assert.ok(!/^\s*(?:const |let )?session\s*=\s*await requireRoleForClient\(\[\.\.\.ALL_ROLES\]/m.test(source),
      "the overview page is back on the every-role door");
    const layoutSource = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../src/app/portal/clients/[clientId]/layout.tsx", import.meta.url), "utf8"));
    assert.match(layoutSource, /requireRoleForClient\(\[\.\.\.SURFACE_ROLE_CEILING\.client\]/,
      "the workspace shell stopped deriving its gate from the shared ceiling");
    assert.ok(!/^\s*(?:const |let )?session\s*=\s*await requireRoleForClient\(\[\.\.\.ALL_ROLES\]/m.test(layoutSource),
      "the workspace shell is back on the every-role door");
    // …and the ceiling itself still excludes the two roles this closed.
    assert.ok(!SURFACE_ROLE_CEILING.client.includes("end-customer"));
    assert.ok(!SURFACE_ROLE_CEILING.client.includes("lead"));
  });

  it("an end-customer and a lead are refused the client record, on every tab", async () => {
    // Every tab, because the tab is a search param and the finance/record tabs
    // are the ones carrying invoices, contracts and internal notes. A gate
    // that only held on the default tab would be no gate.
    const tabs = ["overview", "relationship", "delivery", "marketing", "systems",
      "finance", "communications", "files", "portal", "notes"];
    for (const role of ["end-customer", "lead"] as Role[]) {
      for (const tab of tabs) {
        const outcome = await driveClientRoute("overview", role, { tab });
        assert.notEqual(outcome, "rendered",
          `${role} still renders /portal/clients/<id>?tab=${tab} (${outcome})`);
      }
      // The chrome around it is refused too — a sidebar naming Commercial and
      // Client record, with the client's name and stage on it, is itself the
      // internal record's shape.
      assert.notEqual(await driveClientLayout(role), "rendered",
        `${role} still renders the client workspace shell`);
    }
  });

  it("…and the workspace's own people keep it", async () => {
    for (const role of [...AGENCY_ROLES, ...CLIENT_ROLES]) {
      assert.equal(await driveClientRoute("overview", role), "rendered",
        `${role} lost the client workspace`);
      assert.equal(await driveClientLayout(role), "rendered",
        `${role} lost the client workspace shell`);
    }
  });

  it("a refused caller is redirected to /portal, which knows where they belong", async () => {
    // `/portal` is the role-aware router: an end-customer lands at
    // `/portal/customer`. Refusing with a 404 would leave a shopper who typed
    // the URL staring at nothing.
    assert.equal(await driveClientRoute("overview", "end-customer"), "redirect");
    assert.equal(await driveClientLayout("end-customer"), "redirect");
    const portal = await import("../src/app/portal/page");
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../src/app/portal/page.tsx", import.meta.url), "utf8"));
    assert.ok(typeof portal.default === "function");
    assert.match(source, /end-customer"\)\s*redirect\("\/portal\/customer"\)/,
      "/portal no longer sends an end-customer to their own portal — the redirect above now goes nowhere");
  });

  it("the sibling routes under the same folder are gated too", async () => {
    // `settings` was already agency-only; `[...rest]` is the plugin host and
    // is capped by `pageAllowsRoleAt`. Both asserted here so a future sibling
    // added beside them has a pattern to match — and so a regression in either
    // shows up next to the one this fixed.
    for (const role of ALL_ROLES) {
      const outcome = await driveClientRoute("settings", role);
      const shouldReach = AGENCY_ROLES.includes(role);
      assert.equal(outcome === "rendered", shouldReach,
        `${role} · client settings → ${outcome}`);
    }
    const restMod = await import("../src/app/portal/clients/[clientId]/[...rest]/page");
    assert.ok(typeof restMod.default === "function");
    const restSource = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../src/app/portal/clients/[clientId]/[...rest]/page.tsx", import.meta.url), "utf8"));
    assert.match(restSource, /pageAllowsRoleAt\(plugin, page, "client", session\.role\)/,
      "the plugin host stopped calling the shared page gate");

    // Nothing else lives under this folder. If a route is added, it has to
    // answer this question too — this list failing is the reminder.
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(new URL("../src/app/portal/clients/[clientId]/", import.meta.url), { withFileTypes: true });
    const routeDirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    assert.deepEqual(routeDirs, ["[...rest]", "settings"],
      "a new route folder appeared under /portal/clients/[clientId]/ — gate it and add it here");
  });
});

// ─── ARM 4: mutation checks ───────────────────────────────────────────────

describe("the API guard can see a hole", () => {
  it("a brand-new agency-scoped plugin whose route declares nothing is refused by everyone but the agency", async () => {
    for (const role of ALL_ROLES) {
      const shouldAnswer = AGENCY_ROLES.includes(role);
      for (const method of ["GET", "POST"] as Method[]) {
        const status = await callApi(SYNTH_AGENCY, ["secret"], method, role);
        if (shouldAnswer) {
          assert.notEqual(status, 403, `${role} lost the agency plugin's own ${method}`);
        } else {
          assert.ok(status === 403 || (role === "lead" && status === 404),
            `${role} answered an undeclared agency-scoped ${method} (HTTP ${status})`);
        }
      }
    }
  });

  it("a brand-new client-scoped plugin whose route declares nothing reaches the workspace but never a shopper", async () => {
    for (const role of ALL_ROLES) {
      const shouldAnswer = AGENCY_ROLES.includes(role) || CLIENT_ROLES.includes(role);
      const status = await callApi(SYNTH_CLIENT, ["secret"], "POST", role);
      if (shouldAnswer) assert.notEqual(status, 403, `${role} lost the client plugin's own POST`);
      else assert.ok(status === 403 || (role === "lead" && status === 404),
        `${role} answered an undeclared client-scoped POST (HTTP ${status})`);
    }
  });

  it("owning a shopper page opens the shopper's route and NOT the back office beside it", async () => {
    assert.notEqual(await callApi(SYNTH_CUSTOMER, ["me"], "GET", "end-customer"), 403);
    assert.equal(await callApi(SYNTH_CUSTOMER, ["back-office"], "GET", "end-customer"), 403);
    assert.notEqual(await callApi(SYNTH_CUSTOMER, ["back-office"], "GET", "client-owner"), 403);
  });

  it("a declaration can only narrow — naming a role the surface does not serve does not serve it", () => {
    const hr = shippedPlugins().find(p => p.id === "agency-hr")!;
    const staffRoute = hr.api.find(r => r.path === "staff" && r.methods.includes("GET"))!;
    assert.deepEqual(effectiveApiRoles(hr, staffRoute), [...AGENCY_ROLES]);

    // The union bug, written out: a manifest that names the shopper.
    const widened: PluginApiRoute = { ...staffRoute, visibleToRoles: [...AGENCY_ROLES, "end-customer", "client-owner"] };
    assert.deepEqual(effectiveApiRoles(hr, widened), [...AGENCY_ROLES],
      "a declared role outside the surface ceiling was unioned in");
  });

  it("the page a route backs is load-bearing — widen the page and the route widens with it", () => {
    const hr = shippedPlugins().find(p => p.id === "agency-hr")!;
    const rolesRoute = hr.api.find(r => r.path === "roles" && r.methods.includes("GET"))!;
    const rolesPage = hr.pages.find(p => p.path === "roles")!;

    // As shipped: the Roles page is owner/manager, so the route is too — even
    // though the manifest still declares `agency-staff` on it.
    assert.deepEqual(pluginApiRouteAllowedRoles(rolesRoute), ["agency-owner", "agency-manager", "agency-staff"]);
    assert.deepEqual(apiRouteBackingPage(hr, rolesRoute), rolesPage);
    assert.deepEqual(effectiveApiRoles(hr, rolesRoute), ["agency-owner", "agency-manager"]);

    // Open the page to staff in a COPY of the manifest and the route follows.
    // If this ever returns the same two roles, the pairing has stopped working
    // and the "never wider than its page" rule is asserting nothing.
    const opened = {
      ...hr,
      pages: hr.pages.map((page: PluginPage) =>
        page.path === "roles" ? { ...page, visibleToRoles: [...AGENCY_ROLES] } : page),
    } as AquaPlugin;
    assert.deepEqual(effectiveApiRoles(opened, rolesRoute), [...AGENCY_ROLES]);
  });

  it("the old rule — declared-or-everyone — is caught as a hole by arm 1's expectation", () => {
    // The negative control. `declared ?? ALL_ROLES` is exactly what shipped
    // before this change; running the same comparison against it must produce
    // a large pile of violations, or arm 1 is passing for the wrong reason.
    const wouldLeak: string[] = [];
    for (const plugin of shippedPlugins()) {
      for (const route of plugin.api) {
        if (route.public === true) continue;
        const declared = pluginApiRouteAllowedRoles(route);
        const oldAnswer = declared ? ALL_ROLES.filter(r => declared.includes(r)) : [...ALL_ROLES];
        const now = effectiveApiRoles(plugin, route);
        for (const role of oldAnswer) {
          if (!now.includes(role)) wouldLeak.push(`${role} → ${plugin.id}/${route.path}`);
        }
      }
    }
    assert.ok(wouldLeak.length > 250,
      `the old rule only differs on ${wouldLeak.length} cells — that is too few to be the hole that was reported`);
    // …and the difference is one-directional: nothing GAINED access.
    const gained: string[] = [];
    for (const plugin of shippedPlugins()) {
      for (const route of plugin.api) {
        if (route.public === true) continue;
        const declared = pluginApiRouteAllowedRoles(route);
        const oldAnswer = declared ? ALL_ROLES.filter(r => declared.includes(r)) : [...ALL_ROLES];
        for (const role of effectiveApiRoles(plugin, route)) {
          if (!oldAnswer.includes(role)) gained.push(`${role} → ${plugin.id}/${route.path}`);
        }
      }
    }
    assert.deepEqual(gained, [], `the new rule WIDENED something:\n  ${gained.join("\n  ")}`);
  });
});
