// THE ROUTES NO SURFACE RULE REACHES.
//
// Two guards now cover the plugin system: `_pageScope` gates plugin PAGES and
// plugin API ROUTES by surface, and `apiTenantScope` decides whose tenant a
// plugin API call lands in. Neither touches:
//
//   • the 133 concrete route handlers under `src/app/api/portal/` that are NOT
//     the plugin dispatcher. They have no manifest, no surface, no class-level
//     rule — each one is on its own;
//   • the app-route PAGES under `src/app/portal/` that render plugin content
//     server-side, where the app route's gate and the plugin manifest's gate
//     are two separate declarations that can disagree. On 22 Aug 2026 one did:
//     `/portal/agency/marketing` gated on `requireRole([...AGENCY_ROLES])` and
//     rendered leads-pipeline's `CampaignsWorkspace`, while the plugin page
//     `campaigns` declares owner/manager-only — so `agency-staff` read every
//     campaign by URL through a surface the plugin had closed, and could not
//     read the same data through the API that backs it.
//
// ARM 1  The enumeration. Every non-plugin portal route, what it reads its
//        tenant from, and which ones have no Aqua session at all.
// ARM 2  `phases/apply` — the one cross-tenant WRITE this sweep found, driven.
// ARM 3  Marketing vs the campaigns manifest, driven for every agency role.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import { withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

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

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient, getClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { upsertPhase } from "../src/server/phases";
import { applyPhaseToClient } from "../src/server/phaseApplier";
import { listPlugins } from "../src/built-ins/runtime/_registry";
import { pageAllowsRoleAt } from "../src/built-ins/runtime/_pageScope";
import { AGENCY_ROLES, type Role } from "../src/server/types";

// ─── ARM 1: the enumeration ───────────────────────────────────────────────

/** Every concrete route handler under `src/app/api/portal/`, dispatcher aside. */
function appApiRoutes(): string[] {
  return execFileSync("find", ["src/app/api/portal", "-name", "route.ts"], { encoding: "utf8" })
    .trim().split("\n")
    .map(path => path.replace("src/app/api/", ""))
    .filter(path => !path.includes("[module]"))
    .sort();
}

function routeSource(short: string): string {
  const raw = readFileSync(`src/app/api/${short}`, "utf8");
  // Comments stripped: several of these files DISCUSS the patterns below in
  // their header notes, and a grep over prose is not a grep over code.
  return raw.split("\n").filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
}

const READS_SESSION =
  /getSessionFromRequest|requireSession|requireRole|requireRoleForClient|getSession\(|assertTenantScope|requireAgencyScope/;
const READS_QUERY_AGENCY = /searchParams\.get\(["']agencyId["']\)|x-aqua-agency-id/;
const READS_REQUEST_CLIENT =
  /searchParams\.get\(["']clientId["']\)|x-aqua-client-id|body[\w?.]*\.clientId|input\.clientId|params[\w?.()]*\)?\.clientId|\{[^}]*\bclientId\b[^}]*\}\s*=\s*(body|input|payload|await)/;

describe("the non-plugin app API routes — the class with no class-level guard", () => {
  it("the enumeration is pinned, so a new route cannot join unnoticed", () => {
    const routes = appApiRoutes();
    assert.equal(routes.length, 133,
      `there are now ${routes.length} non-plugin routes under src/app/api/portal, not 133.`
      + " A new one has appeared: decide where IT gets its tenant from, then update this count.");
  });

  it("NOT ONE of them takes its agency from the request — the dispatcher was the only one", () => {
    // The sweep the brief asked for. `?agencyId=` / `x-aqua-agency-id` appear
    // in exactly one file in `src/`, and it is the plugin dispatcher, which now
    // refuses them for anyone holding a session. If this list is ever non-empty
    // the new route has to answer the same question the dispatcher just did.
    const fromRequest = appApiRoutes().filter(route => READS_QUERY_AGENCY.test(routeSource(route)));
    assert.deepEqual(fromRequest, [],
      `these routes read an agency id from the request:\n  ${fromRequest.join("\n  ")}`);
  });

  it("only four run without an Aqua session, and each has a named reason", () => {
    const sessionless = appApiRoutes().filter(route => !READS_SESSION.test(routeSource(route)));
    assert.deepEqual(sessionless.sort(), [
      // Static constants. No tenant, no store read, no parameter.
      "portal/fulfillment/presets/route.ts",
      // Authorised by a signed, expiring media token, not by a session.
      "portal/inbox/media/content/route.ts",
      // Supabase's OWN session (`client.auth.getUser()`), about the caller's
      // own account only — there is no id in the request naming whose account.
      "portal/mfa/enrol/route.ts",
      "portal/mfa/verify/route.ts",
    ], "a route lost (or gained) its session check — read the reason list before changing this");
  });

  it("the routes that DO take a client id from the request are pinned, one by one", () => {
    // Not a hole by itself: every one of these pairs the request's clientId
    // with `session.agencyId` and hands the pair to an agency-scoped store, so
    // a stranger's client id selects nothing. It is pinned because that is a
    // per-route property with no rule behind it — the sweep's real finding is
    // that this list is the surface area a future mistake will live in, and
    // `phases/apply` (arm 2) is what that mistake looks like.
    const readers = appApiRoutes().filter(route => READS_REQUEST_CLIENT.test(routeSource(route)));
    assert.deepEqual(readers, [
      "portal/activity-inbox/list/route.ts",
      "portal/client-portal-design/route.ts",
      "portal/clients/[clientId]/erase/route.ts",
      "portal/clients/[clientId]/radar/route.ts",
      "portal/connections/route.ts",
      "portal/customer/workspace/route.ts",
      "portal/dev/projects/route.ts",
      "portal/governance/erasure/preview/route.ts",
      "portal/identity-resolution/route.ts",
      "portal/inbox/conversations/route.ts",
      "portal/journey/payment-request/route.ts",
      "portal/people/route.ts",
      "portal/performance/experiments/route.ts",
      "portal/performance/reports/route.ts",
      "portal/performance/search-console/route.ts",
      "portal/phases/apply/route.ts",
      "portal/pipelines/move-client/route.ts",
      "portal/plugins/settings/route.ts",
      "portal/products/rollout/route.ts",
      "portal/settings/integrations/route.ts",
      "portal/tasks/route.ts",
      "portal/tasks/templates/route.ts",
    ], "the client-id-from-request set changed — check the newcomer pairs it with session.agencyId");
  });

  it("every one of them still names the session's agency somewhere", () => {
    // The property that makes the list above safe, asserted rather than
    // assumed. A route that reads a clientId from the request and never
    // mentions the session's agency is scoping by the caller's word alone.
    const orphans = appApiRoutes()
      .filter(route => READS_REQUEST_CLIENT.test(routeSource(route)))
      .filter(route => !/session\.agencyId|getActiveAgencyId\(session\)|session\.clientId/.test(routeSource(route)));
    assert.deepEqual(orphans, [],
      `these scope a client by the request alone:\n  ${orphans.join("\n  ")}`);
  });
});

// ─── ARM 2: the cross-tenant write the sweep found ────────────────────────

describe("phases/apply — a client id from the body, and nothing asking whose it was", () => {
  let agencyA = "";
  let agencyB = "";
  let clientB = "";
  let phaseB = "";
  let phaseA = "";
  let clientA = "";

  before(async () => {
    await ensureHydrated();
    agencyA = createAgency({ name: "Phase A", slug: `phase-a-${Date.now()}` }).id;
    agencyB = createAgency({ name: "Phase B", slug: `phase-b-${Date.now()}` }).id;
    clientA = createClient(agencyA, { name: "A client", slug: "phase-a-client" }).id;
    clientB = createClient(agencyB, { name: "B client", slug: "phase-b-client" }).id;
    phaseA = upsertPhase({
      id: `phase_${agencyA}_a`, agencyId: agencyA, stage: "aqua-blueprint",
      label: "A planning", order: 10, pluginPreset: [], checklist: [],
    }).id;
    phaseB = upsertPhase({
      id: `phase_${agencyB}_b`, agencyId: agencyB, stage: "aqua-mastery",
      label: "B live care", order: 10, pluginPreset: [], checklist: [],
    }).id;
  });

  it("naming BOTH of agency B's ids no longer applies anything — the agencies agreed with each other, not with the caller", async () => {
    // The old check was `client.agencyId === phase.agencyId`. Supply a client
    // in B and a phase in B and it passed: the two ids agreed, and nobody asked
    // whether the CALLER did. An owner in A moved a stranger's client to a new
    // stage and installed plugins into their workspace.
    const stageBefore = getClient(clientB)?.stage;
    const result = await applyPhaseToClient(clientB, phaseB, agencyA);
    assert.deepEqual(result, { ok: false, error: "phase_not_found" },
      "agency A reached into agency B's phases");
    assert.equal(getClient(clientB)?.stage, stageBefore, "agency B's client was moved");
  });

  it("naming the stranger's CLIENT with your own phase is refused too, and does not confirm the client exists", async () => {
    const stageBefore = getClient(clientB)?.stage;
    const result = await applyPhaseToClient(clientB, phaseA, agencyA);
    assert.deepEqual(result, { ok: false, error: "client_not_found" },
      "a distinct error would confirm a stranger's client id to whoever probed for it");
    assert.equal(getClient(clientB)?.stage, stageBefore);
  });

  it("…and the legitimate apply still works", async () => {
    const result = await applyPhaseToClient(clientA, phaseA, agencyA);
    assert.equal(result.ok, true, `the owner lost their own phase apply: ${JSON.stringify(result)}`);
    assert.equal(getClient(clientA)?.stage, "aqua-blueprint");
  });

  it("the route hands it the SESSION's agency, not the body's", async () => {
    const source = readFileSync("src/app/api/portal/phases/apply/route.ts", "utf8");
    assert.match(source, /applyPhaseToClient\(clientId, phaseId, getActiveAgencyId\(session\)\)/,
      "the apply route stopped naming the session's agency");
    // …and the signature makes it impossible to forget: a third REQUIRED
    // parameter, so a new caller cannot omit the tenant the way this one did.
    const applier = readFileSync("src/server/phaseApplier.ts", "utf8");
    assert.match(applier, /phaseId: string,\s*\n\s*agencyId: string,\s*\n\):/,
      "agencyId is no longer a required parameter of applyPhaseToClient");
  });
});

// ─── ARM 2b: the client host's own clientId ───────────────────────────────

describe("the client workspace host takes its client from the path — and checks it", () => {
  it("all three routes under /portal/clients/[clientId] refuse a client of another agency", () => {
    // `requireRoleForClient` waves every AGENCY role through for any clientId
    // (that is its job — an agency role may open any of its own clients), so
    // the tenancy question is answered separately, by `getClientForAgency`.
    // Two of the three already did; the plugin catch-all leaned on the
    // resolver finding no install, which is an accident of install scoping
    // rather than a rule. All three now state it.
    for (const file of [
      "src/app/portal/clients/[clientId]/page.tsx",
      "src/app/portal/clients/[clientId]/settings/page.tsx",
      "src/app/portal/clients/[clientId]/[...rest]/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /getClientForAgency\(session\.agencyId, clientId\)/,
        `${file} does not check the path's clientId against the session's agency`);
    }
    // The shell too, so the chrome cannot paint a stranger's brand kit.
    assert.match(readFileSync("src/app/portal/clients/[clientId]/layout.tsx", "utf8"),
      /getClientForAgency\(session\.agencyId, clientId\)/);
  });

  it("the agency and customer hosts take their agency from the SESSION, never a query", () => {
    // Item 4 of the sweep: do the page hosts have the dispatcher's peek shape?
    // They do not — none of the three reads an agency from the request at all.
    for (const file of [
      "src/app/portal/agency/[...rest]/page.tsx",
      "src/app/portal/clients/[clientId]/[...rest]/page.tsx",
      "src/app/portal/customer/[...rest]/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8")
        .split("\n").filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
      assert.ok(!/agencyId:\s*(sp|searchParams|params)\b/.test(source),
        `${file} takes its agency from the request`);
      assert.match(source, /agencyId: session\.agencyId/,
        `${file} stopped taking its agency from the session`);
    }
  });
});

// ─── ARM 3: the marketing page vs the campaigns manifest ──────────────────

/** Walk a returned React tree looking for a component by name. */
function treeMentions(node: unknown, name: string, depth = 0): boolean {
  if (depth > 40 || node == null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(child => treeMentions(child, name, depth + 1));
  const element = node as { type?: unknown; props?: { children?: unknown } };
  const type = element.type as { name?: string; displayName?: string } | string | undefined;
  if (typeof type === "function" && (type.name === name || type.displayName === name)) return true;
  const props = element.props;
  if (props && typeof props === "object") {
    for (const value of Object.values(props as Record<string, unknown>)) {
      if (treeMentions(value, name, depth + 1)) return true;
    }
  }
  return false;
}

describe("the marketing app route and the campaigns plugin page now agree", () => {
  const tokens = new Map<Role, string>();
  let agencyId = "";

  before(async () => {
    await ensureHydrated();
    agencyId = createAgency({ name: "Marketing gate", slug: `mkt-gate-${Date.now()}` }).id;
    for (const role of AGENCY_ROLES) {
      const user = createUser({
        email: `${role}@mkt-gate.test`, name: role, role, agencyId,
        password: "marketing-gate-pass-phrase",
      });
      tokens.set(role, issueSession({
        userId: user.id, email: user.email, role, agencyId, sessionRev: user.sessionRev ?? 0,
      }));
    }
  });

  it("the manifest is the declaration: campaigns is owner/manager, and staff is refused", () => {
    const plugin = listPlugins().find(candidate => candidate.id === "leads-pipeline")!;
    const page = plugin.pages.find(candidate => candidate.path === "campaigns")!;
    assert.ok(pageAllowsRoleAt(plugin, page, "agency", "agency-owner"));
    assert.ok(pageAllowsRoleAt(plugin, page, "agency", "agency-manager"));
    assert.ok(!pageAllowsRoleAt(plugin, page, "agency", "agency-staff"),
      "the manifest opened Campaigns to staff — then the marketing page is right and this test is wrong");
  });

  it("the marketing page ASKS the manifest rather than restating the answer", () => {
    const source = readFileSync("src/app/portal/agency/marketing/page.tsx", "utf8");
    assert.match(source, /pageAllowsRoleAt\(plugin, page, "agency", role\)/,
      "the marketing page stopped deriving its campaigns gate from the plugin manifest");
    assert.match(source, /const canSeeCampaigns = campaignsVisibleToRole\(session\.role\)/);
    // Both consumers read the same gated list — the block AND the in-view nav.
    assert.match(source, /visibleSections\(orderedMarketingSections\(view, section\)\)/,
      "the section list is no longer gated where the blocks are rendered");
    assert.match(source, /sections=\{visibleSections\(MARKETING_VIEW_SECTIONS\[view\] \?\? \[\]\)\}/,
      "the in-view nav is no longer gated, so a refused role is still offered the tab");
  });

  it("agency-staff no longer renders the campaign composer at /portal/agency/marketing", async () => {
    const mod = await import("../src/app/portal/agency/marketing/page");
    const page = mod.default as (props: {
      searchParams: Promise<Record<string, string | undefined>>;
    }) => Promise<unknown>;

    // Every way in: the merged Demand view, the section deep link, and the
    // retired `?view=campaigns` bookmark that resolves onto it.
    const ways: Record<string, string | undefined>[] = [
      { view: "demand" },
      { view: "demand", section: "campaigns" },
      { view: "campaigns" },
      { view: "demand", section: "campaigns", compose: "social" },
    ];

    for (const searchParams of ways) {
      const staffTree = await withSession(tokens.get("agency-staff")!, () =>
        page({ searchParams: Promise.resolve(searchParams) }));
      assert.ok(!treeMentions(staffTree, "CampaignsWorkspace"),
        `agency-staff still renders CampaignsWorkspace at ?${new URLSearchParams(
          searchParams as Record<string, string>).toString()}`);
    }
  });

  it("…and owner and manager keep it, on the same URLs", async () => {
    const mod = await import("../src/app/portal/agency/marketing/page");
    const page = mod.default as (props: {
      searchParams: Promise<Record<string, string | undefined>>;
    }) => Promise<unknown>;
    for (const role of ["agency-owner", "agency-manager"] as Role[]) {
      const tree = await withSession(tokens.get(role)!, () =>
        page({ searchParams: Promise.resolve({ view: "demand", section: "campaigns" }) }));
      assert.ok(treeMentions(tree, "CampaignsWorkspace"),
        `${role} lost the campaign composer on the marketing page`);
    }
  });

  it("the rest of Demand still renders for staff — the gate closed one block, not the view", async () => {
    const mod = await import("../src/app/portal/agency/marketing/page");
    const page = mod.default as (props: {
      searchParams: Promise<Record<string, string | undefined>>;
    }) => Promise<unknown>;
    const tree = await withSession(tokens.get("agency-staff")!, () =>
      page({ searchParams: Promise.resolve({ view: "demand" }) }));
    assert.ok(treeMentions(tree, "MarketingFunnelBoard") || treeMentions(tree, "MarketingSectionNavigation"),
      "staff lost the whole Demand view, not just Campaigns");
  });
});
