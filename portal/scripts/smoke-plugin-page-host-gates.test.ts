// WHICH HOSTS CAN REACH THIS PAGE, AND WHAT IS EACH HOST'S OWN GATE?
//
// The previous guard (`smoke-finance-section-gates.test.ts`, arm 2) asked a
// different and much smaller question: within ONE plugin, does a page behind a
// narrowed nav entry declare roles at least as narrow? It was structural, it
// never touched a host route, and it passed green while this was true of the
// shipped app:
//
//   end-customer  /portal/clients/<id>/agency-hr/staff           → RENDERED
//   end-customer  /portal/clients/<id>/agency-marketing/leads    → RENDERED
//   end-customer  /portal/clients/<id>/email-sender/logs         → RENDERED
//   end-customer  /portal/clients/<id>/contacts        (no prefix!) → RENDERED
//   client-owner  /portal/clients/<id>/agency-hr/staff           → RENDERED
//
// Nothing in a single plugin's manifest is wrong in those rows. What is wrong
// is that a THIRD host — one with a much wider door than the surface the page
// was written for — could resolve them at all. A guard that never leaves the
// manifest cannot see that, so this one leaves the manifest.
//
// The shape here:
//
//   ARM 1  The real question, driven for real. For every registered plugin
//          page, every URL any host could resolve it at, and every one of the
//          eight roles: mount the REAL host route component with a REAL signed
//          session and compare what actually happened against
//          `effectivePageRoles`. Nothing is stubbed except React's client-only
//          bits, which the gates run long before.
//   ARM 2  The invariants that make arm 1's expectation trustworthy: nothing
//          exceeds its surface's role ceiling, no agency-scoped page has a
//          client or customer surface, and the customer surface is only ever
//          reached by a page that names it in full.
//   ARM 3  The nav-vs-page narrowing class, including the ORPHAN variant that
//          `pluginPageForNavHref` structurally cannot see (leads-pipeline's
//          Campaigns nav entry points at an app route, so its page looked
//          unclaimed).
//   ARM 4  Mutation checks. A guard nobody has watched fail is a guess.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { isNextNotFound, isNextRedirect, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

// The host routes import `next/link` and `components/ui/ErrorBoundary`, which
// reach for `React.createContext` / `React.Component` — absent from the
// react-server build the suite runs under. Every gate under test throws long
// before any of that renders. (Same trick as smoke-finance-section-gates.)
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
import { navItemAllowedRoles, pluginPageAllowedRoles } from "../src/built-ins/runtime/_types";
import type { AquaPlugin, PluginPage } from "../src/built-ins/runtime/_types";
import { pluginPageForNavHref } from "../src/built-ins/runtime/_routeResolver";
import {
  HOST_SURFACES,
  SURFACE_ROLE_CEILING,
  effectivePageRoles,
  pageSurfaces,
  surfaceOfFullUrlPath,
  type HostSurface,
} from "../src/built-ins/runtime/_pageScope";
import { ALL_ROLES, AGENCY_ROLES, CLIENT_ROLES, LEAD_AGENCY_ID, type Role } from "../src/server/types";

// ─── Fixture: one agency, one client, one signed session per role ─────────

let agencyId = "";
let clientId = "";
const tokens = new Map<Role, string>();

function synthPlugin(overrides: Partial<AquaPlugin> & { id: string; pages: PluginPage[] }): AquaPlugin {
  return {
    name: overrides.id,
    version: "1.0.0",
    status: "stable",
    category: "ops",
    tagline: "t",
    description: "d",
    navItems: [],
    api: [],
    settings: { groups: [] },
    features: [],
    ...overrides,
  } as AquaPlugin;
}

// Two synthetic manifests registered ALONGSIDE the real ones. They are the
// "91st page" — proof the rules hold for a manifest written after this test,
// by an author who declares nothing. If the fix depended on the twelve
// shipped manifests being individually correct, these two would leak.
const SYNTH_AGENCY_ID = "zz-synthetic-agency-scoped";
const SYNTH_CLIENT_ID = "zz-synthetic-client-scoped";

before(async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "Host Gates", slug: `host-gates-${Date.now()}` });
  agencyId = agency.id;
  const client = createClient(agency.id, { name: "Host Gates Client", slug: "host-gates-client" });
  clientId = client.id;

  registerPlugin(synthPlugin({
    id: SYNTH_AGENCY_ID,
    scopePolicy: "agency",
    // Undeclared on purpose: an author who wrote no access control at all.
    pages: [{ path: "secret", component: async () => ({ default: () => null }) }],
  }));
  registerPlugin(synthPlugin({
    id: SYNTH_CLIENT_ID,
    scopePolicy: "client",
    pages: [{ path: "secret", component: async () => ({ default: () => null }) }],
  }));

  // Install everything the way the runtime would: each plugin at the scope(s)
  // its policy permits. This is deliberately the MOST permissive install
  // picture — if a page is unreachable here it is unreachable anywhere.
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
      email: `${role}@host-gates.test`,
      name: role,
      role,
      agencyId: holderAgency,
      password: "host-gates-pass-phrase",
    });
    tokens.set(role, issueSession({
      userId: user.id,
      email: user.email,
      role,
      agencyId: holderAgency,
      // Client-side roles are scoped to THIS client, so `requireRoleForClient`
      // passes its tenant check and the only thing left to refuse them is the
      // gate under test. A leak has to be a real leak, not a tenancy accident.
      clientId: (CLIENT_ROLES as readonly string[]).includes(role) || role === "end-customer"
        ? clientId
        : undefined,
      sessionRev: user.sessionRev ?? 0,
    }));
  }
});

// ─── Driving the real host routes ─────────────────────────────────────────

type Outcome = "rendered" | "not-found" | "auth-denied" | "redirect" | "not-active-notice";

/** Walk a returned element tree for a marker prop, without rendering it. */
function findProp(node: unknown, prop: string, depth = 0): string | null {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findProp(child, prop, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as { props?: Record<string, unknown> };
  if (!el.props) return null;
  const value = el.props[prop];
  if (typeof value === "string") return value;
  return findProp(el.props.children, prop, depth + 1);
}

function classify(result: unknown, thrown: unknown): Outcome {
  if (thrown) {
    if (isNextNotFound(thrown)) return "not-found";
    if (isNextRedirect(thrown)) return "redirect";
    if (thrown instanceof AuthError) return "auth-denied";
    // Anything else threw AFTER the gate let the request through — a broken
    // component is not access control. Count it as reached.
    return "rendered";
  }
  if (findProp(result, "data-plugin-id")) return "rendered";
  if (findProp(result, "data-testid") === "workspace-tool-unavailable") return "not-active-notice";
  // The customer host answers some URLs with its own fixed sections; nothing
  // in this walk targets those, but be explicit rather than silently "reached".
  return "not-active-notice";
}

async function driveHost(host: HostSurface, rest: string[], role: Role): Promise<Outcome> {
  const mod = host === "agency"
    ? await import("../src/app/portal/agency/[...rest]/page")
    : host === "client"
      ? await import("../src/app/portal/clients/[clientId]/[...rest]/page")
      : await import("../src/app/portal/customer/[...rest]/page");
  const route = mod.default as (props: {
    params: Promise<Record<string, unknown>>;
    searchParams: Promise<Record<string, never>>;
  }) => Promise<unknown>;
  const params = host === "client"
    ? { clientId, rest }
    : { rest };

  return withSession(tokens.get(role)!, async () => {
    try {
      const result = await route({
        params: Promise.resolve(params),
        searchParams: Promise.resolve({}),
      });
      return classify(result, null);
    } catch (error) {
      return classify(null, error);
    }
  });
}

// ─── Candidate URLs: every way a host could be asked for a page ───────────

interface Candidate { host: HostSurface; rest: string[]; url: string }

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}
function isParam(seg: string): boolean {
  return seg.startsWith(":") || (seg.startsWith("[") && seg.endsWith("]"));
}
const CONCRETE = "sample-segment";

/**
 * Every URL that could plausibly land on this page, INCLUDING the ones that
 * must now be refused. The point is not to enumerate the routing table — it is
 * to knock on every door the resolver used to open. Both client-host doors are
 * here: the explicit `<pluginId>/<sub>` prefix, and the bare static path that
 * falls through because only `settings` exists as a literal child of
 * `/portal/clients/[clientId]/`.
 */
function candidates(plugin: AquaPlugin, page: PluginPage): Candidate[] {
  const out: Candidate[] = [];
  if (page.path.startsWith("/")) {
    const segs = splitPath(page.path).map(s => (isParam(s) ? CONCRETE : s));
    if (segs[0] === "portal" && segs[1] === "agency") {
      out.push({ host: "agency", rest: segs.slice(2), url: `/${segs.join("/")}` });
    }
    if (segs[0] === "portal" && segs[1] === "clients") {
      out.push({ host: "client", rest: segs.slice(3), url: `/portal/clients/<id>/${segs.slice(3).join("/")}` });
    }
    if (segs[0] === "portal" && segs[1] === "customer") {
      out.push({ host: "customer", rest: segs.slice(2), url: `/${segs.join("/")}` });
    }
    return out;
  }
  const raw = splitPath(page.path);
  const segs = raw.map(s => (isParam(s) ? CONCRETE : s));
  const tail = segs.length ? `/${segs.join("/")}` : "";
  out.push({ host: "agency", rest: [plugin.id, ...segs], url: `/portal/agency/${plugin.id}${tail}` });
  out.push({ host: "client", rest: [plugin.id, ...segs], url: `/portal/clients/<id>/${plugin.id}${tail}` });
  out.push({ host: "customer", rest: [plugin.id, ...segs], url: `/portal/customer/${plugin.id}${tail}` });
  if (segs.length > 0 && !raw.some(isParam)) {
    out.push({ host: "client", rest: segs, url: `/portal/clients/<id>${tail}  [bare]` });
  }
  return out;
}

/**
 * Which page (if any) a host would resolve this candidate URL to. Uses the
 * REAL resolvers — the expectation must not be a second copy of the routing
 * logic that could drift from the one shipping.
 */
async function resolveCandidate(candidate: Candidate) {
  const r = await import("../src/built-ins/runtime/_routeResolver");
  if (candidate.host === "agency") return r.resolveAgencyPluginPage({ agencyId, rest: candidate.rest });
  if (candidate.host === "client") return r.resolveClientPluginPage({ agencyId, clientId, rest: candidate.rest });
  return r.resolveCustomerPluginPage({ agencyId, clientId, rest: candidate.rest });
}

// ─── ARM 1: the real hosts, the real sessions ─────────────────────────────

describe("plugin pages — the real host routes, driven with a real session for every role", () => {
  it("no host renders a page to a role its surface does not serve", async () => {
    const violations: string[] = [];
    let asserted = 0;
    let renderedCells = 0;

    for (const plugin of listPlugins()) {
      for (const page of plugin.pages) {
        for (const candidate of candidates(plugin, page)) {
          const resolved = await resolveCandidate(candidate);
          // Whatever the URL resolves to is what the host will gate — which
          // may be a DIFFERENT plugin's page (a shadowing route). Expect
          // against the page the resolver actually chose, not the one we
          // derived the URL from.
          const expected = resolved
            ? effectivePageRoles(resolved.plugin, resolved.page, candidate.host)
            : [];

          for (const role of ALL_ROLES) {
            const outcome = await driveHost(candidate.host, candidate.rest, role);
            // The agency host rewrites some legacy URLs before any gate runs
            // (fulfillment/*, leads-pipeline/*). A redirect shows no content;
            // arm 1b proves those rewrites are role-blind.
            if (outcome === "redirect") continue;
            asserted += 1;
            const reached = outcome === "rendered";
            if (reached) renderedCells += 1;
            const shouldReach = expected.includes(role);
            if (reached !== shouldReach) {
              violations.push(
                `${role} · ${candidate.url} → ${outcome}; expected ${shouldReach ? "RENDERED" : "refused"}`
                + ` (resolves to ${resolved ? `${resolved.plugin.id}/${resolved.page.path || "(index)"}` : "nothing"};`
                + ` effective gate = ${expected.join(", ") || "(nobody)"})`,
              );
            }
          }
        }
      }
    }

    assert.deepEqual(violations, [],
      `the host's effective gate disagrees with the page's surface:\n  ${violations.join("\n  ")}`);
    // Guard the guard: if the walk ever stops walking, these fail loudly
    // rather than passing an empty violation list.
    assert.ok(asserted > 1200, `only ${asserted} host/role cells were driven — the walk stopped walking`);
    assert.ok(renderedCells > 100, `only ${renderedCells} cells rendered — every gate is refusing, so nothing is proven`);
  });

  it("the named leaks from the 22 Aug finding are all refused, and the finance fix still holds", async () => {
    const proven: [Role, HostSurface, string[], string][] = [
      ["end-customer", "client", ["agency-hr", "staff"], "/portal/clients/<id>/agency-hr/staff"],
      ["end-customer", "client", ["agency-marketing", "leads"], "/portal/clients/<id>/agency-marketing/leads"],
      ["end-customer", "client", ["email-sender", "logs"], "/portal/clients/<id>/email-sender/logs"],
      ["end-customer", "client", ["contacts"], "/portal/clients/<id>/contacts  [bare, client-crm]"],
      ["end-customer", "client", ["staff"], "/portal/clients/<id>/staff  [bare, agency-hr]"],
      ["client-owner", "client", ["agency-hr", "staff"], "/portal/clients/<id>/agency-hr/staff"],
      ["client-owner", "client", ["agency-finance", "operations"], "/portal/clients/<id>/agency-finance/operations"],
      ["client-staff", "client", ["leads-pipeline", "contacts"], "/portal/clients/<id>/leads-pipeline/contacts"],
      ["freelancer", "client", ["agency-marketing", "campaigns"], "/portal/clients/<id>/agency-marketing/campaigns"],
      // The customer host, same class, found by this sweep rather than the
      // finding: an end-customer reading the operator's back office.
      ["end-customer", "customer", ["memberships", "subscribers"], "/portal/customer/memberships/subscribers"],
      ["end-customer", "customer", ["affiliates", "payouts"], "/portal/customer/affiliates/payouts"],
      ["end-customer", "customer", ["client-crm", "contacts"], "/portal/customer/client-crm/contacts"],
      ["end-customer", "customer", ["agency-hr", "staff"], "/portal/customer/agency-hr/staff"],
      // The agency-side fix that started this, unchanged.
      ["agency-staff", "agency", ["agency-finance", "operations"], "/portal/agency/agency-finance/operations"],
      ["agency-staff", "agency", ["agency-hr", "employees"], "/portal/agency/agency-hr/employees"],
      ["agency-staff", "agency", ["leads-pipeline", "campaigns"], "/portal/agency/leads-pipeline/campaigns"],
    ];
    for (const [role, host, rest, label] of proven) {
      const outcome = await driveHost(host, rest, role);
      assert.notEqual(outcome, "rendered", `${role} still renders ${label}`);
    }
  });

  it("…and the surfaces that are supposed to work still work", async () => {
    const allowed: [Role, HostSurface, string[], string][] = [
      ["agency-owner", "agency", ["agency-finance", "operations"], "finance operations"],
      ["agency-staff", "agency", ["agency-finance", "invoices"], "finance invoices (viewer section)"],
      ["agency-staff", "agency", ["agency-hr", "departments"], "hr departments"],
      ["agency-staff", "agency", ["agency-marketing", "campaigns"], "marketing campaigns"],
      ["agency-staff", "agency", ["leads-pipeline", "contacts"], "leads contacts"],
      ["agency-staff", "agency", ["email-sender", "logs"], "email logs"],
      ["client-owner", "client", ["checklist"], "the client's own checklist (bare path)"],
      ["client-owner", "client", ["client-crm", "contacts"], "the client's CRM"],
      ["client-owner", "client", ["ecommerce", "orders"], "the client's store orders"],
      ["client-owner", "client", ["editor"], "the website editor"],
      ["agency-manager", "client", ["client-crm", "contacts"], "agency previewing the client's CRM"],
      ["end-customer", "customer", ["memberships"], "the shopper's own membership"],
      ["end-customer", "customer", ["affiliates"], "the shopper's own affiliate page"],
      ["end-customer", "customer", ["profile"], "the shopper's own profile"],
    ];
    for (const [role, host, rest, label] of allowed) {
      const outcome = await driveHost(host, rest, role);
      assert.equal(outcome, "rendered", `${role} lost ${label} (got ${outcome})`);
    }
  });

  it("the agency host's legacy URL rewrites happen before any gate, so they are role-blind", async () => {
    // These run ahead of `requireRole` on purpose. If one ever became
    // role-dependent it would be a gate in disguise, and arm 1's `continue`
    // on "redirect" would be hiding it.
    for (const rest of [["fulfillment"], ["fulfillment", "clients"], ["leads-pipeline"], ["leads-pipeline", "board"]]) {
      const outcomes = new Set<Outcome>();
      for (const role of AGENCY_ROLES) outcomes.add(await driveHost("agency", rest, role));
      assert.deepEqual([...outcomes], ["redirect"],
        `/portal/agency/${rest.join("/")} is no longer a plain rewrite for every agency role`);
    }
  });

  it("a mutating request cannot slip past the page gate either", async () => {
    // The page gate is a READ gate; the writes behind these surfaces live on
    // `/api/portal/<plugin>/<route>` and carry their own `visibleToRoles`.
    // Assert the two agree, so "the page is closed but the POST is open" is a
    // failing test rather than a discovery.
    //
    // The comparison used to inline `route.visibleToRoles ?? route.roles`,
    // which was a second copy of the dispatcher's policy living in a test —
    // and it agreed with the dispatcher only because all five rows below
    // happen to declare roles. It now asks the real gate,
    // `apiRouteAllowsRole`, so the assertion cannot drift from what ships.
    // The whole-API version of this question is
    // `smoke-plugin-api-host-gates.test.ts`.
    const { resolvePluginApiRoute } = await import("../src/built-ins/runtime/_routeResolver");
    const { apiRouteAllowsRole, effectiveApiRoles } = await import("../src/built-ins/runtime/_pageScope");
    const mutations: [string, string[], Role, string][] = [
      ["agency-hr", ["employees"], "agency-staff", "POST"],
      ["agency-finance", ["budgets"], "agency-staff", "POST"],
      ["agency-marketing", ["campaigns"], "end-customer", "POST"],
      ["client-crm", ["contacts"], "end-customer", "POST"],
      ["memberships", ["plans"], "end-customer", "POST"],
    ];
    const open: string[] = [];
    for (const [pluginId, rest, role, method] of mutations) {
      const resolved = resolvePluginApiRoute(pluginId, rest, { agencyId, clientId }, method);
      if (!resolved) continue;
      if (apiRouteAllowsRole(resolved.plugin, resolved.route, role)) {
        open.push(
          `${method} /api/portal/${pluginId}/${rest.join("/")} answers ${role}`
          + ` (effective gate = ${effectiveApiRoles(resolved.plugin, resolved.route).join(", ") || "nobody"})`,
        );
      }
    }
    assert.deepEqual(open, [], `write routes are wider than the pages they back:\n  ${open.join("\n  ")}`);
  });
});

// ─── ARM 2: the invariants behind the expectation ─────────────────────────

describe("plugin pages — surface invariants no manifest can break", () => {
  it("every page's effective gate at every host is inside that surface's ceiling", () => {
    const violations: string[] = [];
    for (const plugin of listPlugins()) {
      for (const page of plugin.pages) {
        for (const host of HOST_SURFACES) {
          const effective = effectivePageRoles(plugin, page, host);
          const over = effective.filter(role => !SURFACE_ROLE_CEILING[host].includes(role));
          if (over.length) {
            violations.push(`${plugin.id}/${page.path || "(index)"} at ${host} admits ${over.join(", ")}`);
          }
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("the client workspace ceiling excludes end-customer and lead, and the customer surface is only end-customer", () => {
    // Stated as an assertion rather than a comment, because widening either
    // one silently reopens the whole hole.
    assert.deepEqual([...SURFACE_ROLE_CEILING.client].sort(), [...AGENCY_ROLES, ...CLIENT_ROLES].sort());
    assert.ok(!SURFACE_ROLE_CEILING.client.includes("end-customer"), "end-customers belong at /portal/customer");
    assert.ok(!SURFACE_ROLE_CEILING.client.includes("lead"), "leads have no client workspace");
    assert.deepEqual([...SURFACE_ROLE_CEILING.customer], ["end-customer"]);
    assert.deepEqual([...SURFACE_ROLE_CEILING.agency], [...AGENCY_ROLES]);
  });

  it("an agency-scoped plugin's pages have no client or customer surface — declared or not", () => {
    const violations: string[] = [];
    for (const plugin of listPlugins()) {
      if ((plugin.scopePolicy ?? "either") !== "agency") continue;
      for (const page of plugin.pages) {
        const surfaces = pageSurfaces(plugin, page);
        if (surfaces.some(s => s !== "agency")) {
          violations.push(`${plugin.id}/${page.path || "(index)"} → ${surfaces.join(", ")}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("a relative page path is never a customer-surface page", () => {
    for (const plugin of listPlugins()) {
      for (const page of plugin.pages) {
        if (page.path.startsWith("/")) continue;
        assert.ok(!pageSurfaces(plugin, page).includes("customer"),
          `${plugin.id}/${page.path || "(index)"} backed onto the end-customer surface without declaring it`);
      }
    }
  });

  it("every customer nav item is backed by a page that declares its full /portal/customer URL", () => {
    // The relative-path door onto the customer host is gone. If a plugin still
    // navigates there without a full-URL page, its tab is a 404 — which is a
    // build error, not a security one, and it should fail here not in a
    // shopper's browser.
    const broken: string[] = [];
    for (const plugin of listPlugins()) {
      for (const item of plugin.navItems) {
        if (!item.href.startsWith("/portal/customer/")) continue;
        const backing = plugin.pages.some(page =>
          page.path.startsWith("/portal/customer/") && surfaceOfFullUrlPath(page.path) === "customer"
          && page.path.replace(/\[[^\]]+\]/g, "*") === item.href.replace(/\[[^\]]+\]/g, "*"));
        if (!backing) broken.push(`${plugin.id} · ${item.href}`);
      }
    }
    assert.deepEqual(broken, []);
  });
});

// ─── ARM 3: nav-vs-page narrowing, orphans included ───────────────────────

function navScope(href: string): HostSurface | null {
  if (href.startsWith("/portal/agency/")) return "agency";
  if (href.startsWith("/portal/clients/")) return "client";
  if (href.startsWith("/portal/customer/")) return "customer";
  return null;
}

/** The violations arm 3 reports, as a function so arm 4 can mutate the input. */
function narrowingViolations(plugins: AquaPlugin[]): string[] {
  const violations: string[] = [];
  for (const plugin of plugins) {
    const widest = new Map<HostSurface, Set<Role>>();
    for (const item of plugin.navItems) {
      const scope = navScope(item.href);
      const roles = navItemAllowedRoles(item);
      if (!scope || !roles) continue;
      const bucket = widest.get(scope) ?? new Set<Role>();
      for (const role of roles) bucket.add(role);
      widest.set(scope, bucket);
    }
    const narrows = plugin.navItems.some(item => {
      const scope = navScope(item.href);
      const roles = navItemAllowedRoles(item);
      if (!scope || !roles) return false;
      return [...(widest.get(scope) ?? [])].some(role => !roles.includes(role));
    });

    // 3a — a nav entry narrower than its scope's baseline, whose page admits
    // someone the tab hides. The original class.
    for (const item of plugin.navItems) {
      const scope = navScope(item.href);
      const navRoles = navItemAllowedRoles(item);
      if (!scope || !navRoles) continue;
      const hiddenFrom = [...widest.get(scope)!].filter(role => !navRoles.includes(role));
      if (hiddenFrom.length === 0) continue;
      const page = pluginPageForNavHref(plugin, item.href);
      if (!page) continue;
      const stillIn = hiddenFrom.filter(role => effectivePageRoles(plugin, page, scope).includes(role));
      if (stillIn.length) {
        violations.push(
          `${plugin.id} · nav "${item.id}" (${item.href}) hides the tab from ${stillIn.join(", ")} `
          + `but page "${page.path}" still admits them at the ${scope} host`,
        );
      }
    }

    // 3b — the ORPHAN class, which 3a structurally cannot see. When no nav
    // entry resolves to a page, `pluginPageForNavHref` returns null and 3a
    // skips it — so leads-pipeline's Campaigns page (nav href
    // `/portal/agency/marketing`, an app route with no plugin id in it) was
    // never asked the question at all. If a plugin narrows ANYWHERE, it is
    // making access-control claims, and a page nothing navigates to must say
    // out loud who it is for.
    if (!narrows) continue;
    const named = new Set<string>();
    for (const item of plugin.navItems) {
      const page = pluginPageForNavHref(plugin, item.href);
      if (page) named.add(page.path);
    }
    for (const page of plugin.pages) {
      if (named.has(page.path)) continue;
      if (pluginPageAllowedRoles(page)) continue;
      violations.push(
        `${plugin.id} · page "${page.path || "(index)"}" has no nav entry AND declares no roles, `
        + `in a plugin that narrows other tabs — reachable by URL with nothing saying who for`,
      );
    }
  }
  return violations;
}

describe("plugin pages — nav-only access control cannot come back", () => {
  it("no page behind a narrowed nav entry, and no orphan page, is left undeclared", () => {
    const violations = narrowingViolations(listPlugins());
    assert.deepEqual(violations, [], `nav-only access control:\n  ${violations.join("\n  ")}`);
  });
});

// ─── ARM 4: mutation checks ───────────────────────────────────────────────

describe("the guard can see a hole", () => {
  it("a brand-new agency-scoped plugin that declares nothing is refused by the client and customer hosts", async () => {
    // Registered in `before`, never touched by any manifest edit. This is the
    // 91st page: the rule has to hold without the author knowing it exists.
    for (const role of ALL_ROLES) {
      assert.notEqual(
        await driveHost("client", [SYNTH_AGENCY_ID, "secret"], role),
        "rendered",
        `${role} rendered an undeclared agency-scoped page under the client host`,
      );
      assert.notEqual(
        await driveHost("customer", [SYNTH_AGENCY_ID, "secret"], role),
        "rendered",
        `${role} rendered an undeclared agency-scoped page under the customer host`,
      );
    }
    // Not a blanket lockout: the same page is live on its OWN surface.
    assert.equal(await driveHost("agency", [SYNTH_AGENCY_ID, "secret"], "agency-staff"), "rendered");
  });

  it("a brand-new client-scoped plugin that declares nothing reaches the workspace but never a shopper", async () => {
    assert.equal(await driveHost("client", [SYNTH_CLIENT_ID, "secret"], "client-owner"), "rendered");
    assert.equal(await driveHost("client", [SYNTH_CLIENT_ID, "secret"], "agency-staff"), "rendered");
    assert.notEqual(await driveHost("client", [SYNTH_CLIENT_ID, "secret"], "end-customer"), "rendered");
    assert.notEqual(await driveHost("customer", [SYNTH_CLIENT_ID, "secret"], "end-customer"), "rendered");
    // And on the wrong surface entirely it does not exist.
    assert.notEqual(await driveHost("agency", [SYNTH_CLIENT_ID, "secret"], "agency-owner"), "rendered");
  });

  it("widening a scope policy in a COPY of a manifest is caught by the ceiling arm", () => {
    const hr = listPlugins().find(p => p.id === "agency-hr");
    assert.ok(hr);
    const staff = hr.pages.find(p => p.path === "staff");
    assert.ok(staff, "agency-hr staff page vanished");

    // As shipped: agency surface only.
    assert.deepEqual(pageSurfaces(hr, staff), ["agency"]);
    assert.deepEqual(effectivePageRoles(hr, staff, "client"), []);

    // Mutated copy — scopePolicy relaxed to "either", roles stripped. This is
    // exactly the shape the hole had, and it must come back as reachable.
    const widened = { ...hr, scopePolicy: "either" as const } as AquaPlugin;
    const stripped = { ...staff, visibleToRoles: undefined, roles: undefined };
    assert.ok(pageSurfaces(widened, stripped).includes("client"), "the surface rule stopped noticing");
    assert.deepEqual(
      effectivePageRoles(widened, stripped, "client"),
      [...AGENCY_ROLES, ...CLIENT_ROLES],
      "an undeclared page must inherit the ceiling — if this is empty the guard is asserting nothing",
    );
    // …and the ceiling still holds the line where it matters.
    assert.ok(!effectivePageRoles(widened, stripped, "client").includes("end-customer"));
  });

  it("stripping a declaration is caught by the narrowing arm (3a and 3b both fire)", () => {
    const strip = (pluginId: string, path: string) => listPlugins().map(plugin =>
      plugin.id !== pluginId ? plugin : {
        ...plugin,
        pages: plugin.pages.map(page =>
          page.path === path ? { ...page, visibleToRoles: undefined, roles: undefined } : page),
      } as AquaPlugin);

    // 3a: finance Settings is named by a narrowed nav entry.
    const a = narrowingViolations(strip("agency-finance", "settings"));
    assert.ok(a.some(v => v.includes("agency-finance") && v.includes("settings")),
      `3a did not fire:\n  ${a.join("\n  ")}`);

    // 3b: leads-pipeline Campaigns is an ORPHAN — its nav href is an app
    // route, so 3a is structurally blind to it. This is the exact page the
    // previous guard missed.
    const b = narrowingViolations(strip("leads-pipeline", "campaigns"));
    assert.ok(b.some(v => v.includes("leads-pipeline") && v.includes("campaigns") && v.includes("no nav entry")),
      `3b did not fire on the orphan class:\n  ${b.join("\n  ")}`);
    assert.equal(pluginPageForNavHref(listPlugins().find(p => p.id === "leads-pipeline")!, "/portal/agency/marketing"), null,
      "the Campaigns nav href now maps to a page — 3b's premise changed, re-read the test");

    // Control: unmutated, both are silent.
    assert.deepEqual(narrowingViolations(listPlugins()), []);
  });
});
