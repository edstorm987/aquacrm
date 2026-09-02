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

// What counts as "this route authenticates".
//
// Two vocabularies, and the second was missing until 2026-08-27. The original
// list knows only the SESSION helpers. Since then the access kernel grew its own
// entry points, and eighteen routes — every `portal/access/*`, every
// `portal/dev/*`, `fulfillment/clients`, `site-editor/files` — authenticate
// through those instead. This sweep read all eighteen as sessionless, which is
// the worst way for a security enumeration to be wrong: it names real routes as
// unguarded, so the next reader either panics or, far more likely, stops
// believing the list. Each was checked by hand on 27 Aug; all eighteen gate.
//
// Add to this list when a new authorisation entry point appears — never widen it
// to silence a specific route.
const READS_SESSION =
  /getSessionFromRequest|requireSession|requireRole|requireRoleForClient|getSession\(|assertTenantScope|requireAgencyScope/;
const READS_ACCESS_KERNEL =
  /requireCurrentAccessActor|requireAccessCapability|requireDevProjectAccess|requireWholeWorkingTreeFounderAccess|requireCurrentWorkspaceElementAccess|requireCurrentClientWorkspaceElementAccess|requireCurrentFulfilmentTechnicalAccess/;
const authenticates = (source: string): boolean =>
  READS_SESSION.test(source) || READS_ACCESS_KERNEL.test(source);
const READS_QUERY_AGENCY = /searchParams\.get\(["']agencyId["']\)|x-aqua-agency-id/;
const READS_REQUEST_CLIENT =
  /searchParams\.get\(["']clientId["']\)|x-aqua-client-id|body[\w?.]*\.clientId|input\.clientId|params[\w?.()]*\)?\.clientId|\{[^}]*\bclientId\b[^}]*\}\s*=\s*(body|input|payload|await)/;

describe("the non-plugin app API routes — the class with no class-level guard", () => {
  it("the enumeration is pinned, so a new route cannot join unnoticed", () => {
    const routes = appApiRoutes();
    // 133 → 144 on 2026-08-27. The eleven newcomers are the access-kernel and
    // dev-editor routes; each was audited before this number moved, and the
    // audit is what the three assertions below now encode. Never move this
    // number without doing that: the count is only worth pinning because
    // changing it is supposed to cost something.
    //
    // 144 → 145 on 2026-08-27: `chrome/layout`, a person's own sidebar
    // arrangement and saved tabs. Audited before the number moved — it takes
    // BOTH its agency and its user from the session and reads neither from the
    // body, which is the whole security property of a route whose record key is
    // `${agencyId}|${userId}`. The two sweeps below cover it like any other.
    // 145 → 146 on 2026-08-27: `client-forms/[noticeId]`, opening one enquiry
    // that lives in a CLIENT's own Supabase. Audited before the number moved.
    // Its tenant comes from `getActiveAgencyId(session)`; the notice is then
    // looked up scoped to that agency, so a foreign notice id is simply not
    // found rather than found-and-refused. The client whose access is checked
    // is the one named by the STORED notice — nothing in the request says whose
    // data it is, which is the property that matters for a route whose whole
    // job is to read somebody else's database.
    // 146 → 147 on 2026-08-27: `customer/enquiries/seen`, a client marking one
    // of their own enquiries read. Audited before the number moved. Its tenant
    // comes from the session's `clientId`, and the AGENCY is read off that
    // client's record rather than from the request — so the body's only
    // influence is which notice id it names, and a notice belonging to anyone
    // else is not found rather than found-and-refused.
    //
    // It exists as a route at all because the alternative was writing during a
    // render, which the read-path analyser flags and issue #21 removed.
    // 147 → 148 on 2026-08-27: `website-sources/mapping`, accepting a detected
    // column mapping. Audited before the number moved. Tenant from the session;
    // the clientId in the body is validated against that agency before anything
    // is written, and it is gated on `fulfilment.tags` — the same element that
    // governs scanning the site the mapping came from.
    // 148 → 149 on 2026-08-28: `governance/subject-access`, the GDPR Art. 15/20
    // export. Audited before the number moved. Tenant from the SESSION
    // (`getActiveAgencyId`); the body names only a personId, and a person in
    // another agency resolves to null so the route answers 404 rather than
    // refusing a record it has already located. The export itself then keeps
    // only records whose own `agencyId` matches, because the file it produces
    // is handed to a member of the public.
    // 149 → 150 on 2026-08-28: `governance/retention`, setting the retention
    // periods. Audited before the number moved. Tenant from the SESSION
    // (`getActiveAgencyId`); the body carries only day counts, and a blank or
    // unparseable one CLEARS that period rather than widening what is deleted.
    // Owner-only, unlike the rest of Governance, because the next sweep deletes
    // by whatever it stores.
    // 150 → 151 on 2026-08-28: `plugins/health`, which runs each installed
    // module's manifest `healthcheck`. Audited before the number moved. It
    // takes an OPTIONAL `?clientId=` and resolves it through the shared
    // `routeTenantScope(session, { clientId })` — the same guard
    // `plugins/settings` uses — so a client id belonging to another agency does
    // not resolve and the route answers 404 rather than reporting that scope's
    // health. Read-only: it calls hooks and returns what they say. It exists
    // because ten modules implemented a healthcheck and nothing called any.
    // 151 → 152 on 2026-08-29: `telephony/call`, which places an outbound call
    // to anyone in the CRM rather than only to a website enquiry. Audited
    // before the number moved. Tenant from the SESSION via the shared
    // `routeTenantScope(session, { clientId })`; the OPTIONAL `clientId` in the
    // body is resolved through that same guard and answers 404 when it belongs
    // to another agency, so a caller cannot dial from another tenant's Twilio
    // connection. The number it dials is taken from the request — which is the
    // point of a dialler — but is normalised, checked against the agency's own
    // do-not-call records, and refused with 409 before any provider call. It
    // exists because the voice bridge worked and only the enquiry composer
    // could reach it.
    // 152 → 153 on 2026-08-29: `telephony/email`, the same outreach surface in
    // the other channel. Audited before the number moved. Tenant from the
    // SESSION through the shared `routeTenantScope`; the OPTIONAL clientId is
    // resolved through it and 404s when it is another agency's, so a message
    // cannot be sent from another tenant's Resend/SMTP connection. It applies
    // the same do-not-contact suppression the dialler does, because a flag one
    // channel ignores reads as compliance while the other carries on.
    // 153 → 154 on 2026-08-29: `chrome/department`, which puts a department hat
    // on. Audited before the number moved. Tenant from the SESSION only — the
    // body carries a department id validated against a closed list of five and
    // nothing else, no client id and no agency id. It writes the person's own
    // work session and their own cookie; there is no path through it that
    // reaches another tenant's data.
    // 154 → 155 on 2026-08-30: `agency/identity`, the first write path a
    // non-founder has had for the workspace name and brand colour. Its tenant
    // comes from `requireRole(["agency-owner", "agency-manager"]).agencyId` —
    // the session, never the request. It accepts exactly two fields (name, a
    // brand patch validated against a four-key allow-list) and deliberately
    // IGNORES a slug in the body: the slug is authority — public enquiry routes
    // resolve the founder tenant by it — and must not move on a rename.
    // 155 → 156 on 2026-08-30: `intelligence/my-radar`, the topbar quick-look's
    // fresh read of one person's week plus their own open Actions. Audited
    // before the number moved. Its tenant comes from the SESSION
    // (`getSessionFromRequest` + the AGENCY_ROLES check) — never the request,
    // which carries no ids at all. Read-only, no `flushPendingWrites`.
    // agency-staff is additionally gated on the `staff.overview` element (the
    // gate `dashboard-planning` applies, because it is the same working-time
    // data), and an Action naming a client is filtered through
    // `canReadClientAssociation` exactly as GET `portal/tasks` filters it —
    // the STORED task's clientId is read; nothing client-shaped is accepted
    // from the caller.
    // 156 → 158 on 2026-08-30: `pipelines/boards` + `pipelines/cards`,
    // Ed's own kanbans. Both take their tenant from requireRole().agencyId —
    // the session, never the request — and both refuse any pipeline whose
    // kind is not "custom", which is the wall keeping the free-card API off
    // lead and fulfilment cards and their event/transaction semantics.
    // 158 → 159 on 2026-08-31: `governance/breaches`, the GDPR Art. 33/34
    // breach register — the gap `compliancePosture` named as "there is nowhere
    // in the app to record it and no clock counting the 72 hours". Audited
    // before the number moved. Tenant from the SESSION only:
    // `requireRole(["agency-owner","agency-manager"])` then
    // `getActiveAgencyId(session)`, never the request. The body carries an
    // `incidentId`, but every register call takes that id TOGETHER WITH the
    // session's agencyId and answers 404 when the pair does not resolve, so
    // another tenant's incident cannot be assessed, notified or closed. An
    // optional `companyId` is checked against `listTradingCompanies(agencyId)`
    // and 404s otherwise. `assess` and `close` re-gate to owner-only, because
    // deciding a breach is not notifiable is a legal judgement.
    // 159 → 160 on 2026-09-01: `agency/command-scan`, the explicit heavy
    // Radar/KPI execution door. It accepts no tenant input: the agency comes
    // only from a fresh, current-member signed session and the result is bound
    // to that realm/agency/user/revision principal before provider persistence.
    assert.equal(routes.length, 160,
      `there are now ${routes.length} non-plugin routes under src/app/api/portal, not 160.`
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
    const sessionless = appApiRoutes().filter(route => !authenticates(routeSource(route)));
    assert.deepEqual(sessionless.sort(), [
      // `portal/fulfillment/presets` used to sit here as "static constants, no
      // tenant, no store read". It now calls `getSessionFromRequest` — it
      // gained a check rather than losing one, so it left this list.
      //
      // Authorised by a signed, expiring media token, not by a session.
      "portal/inbox/media/content/route.ts",
      // Supabase's OWN session (`client.auth.getUser()`), about the caller's
      // own account only — there is no id in the request naming whose account.
      "portal/mfa/enrol/route.ts",
      "portal/mfa/verify/route.ts",
    ], "a route lost (or gained) its session check — read the reason list before changing this");
    assert.equal(sessionless.length, 3, "three, and each named above");
  });

  it("the routes that DO take a client id from the request are pinned, one by one", () => {
    // Not a hole by itself: each reader must either use the shared
    // routeTenantScope guard or pair the id with the signed session agency.
    // It is pinned because this is the surface where a future omission would
    // live, and `phases/apply` (arm 2) is what that mistake looks like.
    const readers = appApiRoutes().filter(route => READS_REQUEST_CLIENT.test(routeSource(route)));
    assert.deepEqual(readers, [
      "portal/activity-inbox/list/route.ts",
      "portal/client-portal-design/route.ts",
      "portal/clients/[clientId]/erase/route.ts",
      "portal/clients/[clientId]/radar/route.ts",
      "portal/connections/route.ts",
      "portal/contracts/templates/route.ts",
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
      "portal/plugins/health/route.ts",
      "portal/plugins/settings/route.ts",
      "portal/products/rollout/route.ts",
      "portal/settings/integrations/route.ts",
      "portal/tasks/route.ts",
      "portal/tasks/templates/route.ts",
      // Takes an OPTIONAL clientId and resolves it through the shared
      // `routeTenantScope(session, { clientId })`, 404-ing when it does not
      // belong to the session agency — so a call can never be placed on
      // another tenant's Twilio connection. Audited when it joined this list
      // (2026-08-29).
      "portal/telephony/call/route.ts",
      // Same guard, same reason, same audit date as telephony/call.
      "portal/telephony/email/route.ts",
      // Takes a clientId from the body and pairs it with the SESSION agency
      // before writing: `client.agencyId !== agencyId` → 404. Audited when it
      // joined this list (2026-08-27).
      "portal/website-sources/mapping/route.ts",
    ], "the client-id-from-request set changed — check the newcomer uses routeTenantScope or pairs it with the session agency");
  });

  it("every one of them derives tenant scope from the session", () => {
    // Direct pairing with the session agency and the shared routeTenantScope
    // guard are the two supported forms. The helper validates ownership and
    // returns an agency derived from the signed session.
    const orphans = appApiRoutes()
      .filter(route => READS_REQUEST_CLIENT.test(routeSource(route)))
      // Three supported forms, not two. `actor.resourceAgencyId` is the access
      // kernel's equivalent of `session.agencyId` — the agency the RESOLVED
      // actor is scoped to — and `requireDevProjectAccess` resolves project
      // scope for the caller before the handler sees the id at all.
      .filter(route => !/routeTenantScope\(session\s*,|session\.agencyId|getActiveAgencyId\(session\)|session\.clientId|actor\.resourceAgencyId|requireDevProjectAccess|requireActorCapabilities/.test(routeSource(route)));
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

    // The PROPERTY, not one expression's exact shape. This used to insist on the
    // inlined `applyPhaseToClient(clientId, phaseId, getActiveAgencyId(session))`
    // and started failing the moment the route hoisted that call into a local so
    // it could ALSO pre-check the client's tenancy — a strictly better route that
    // the old pin reported as a regression. What must hold is that the agency
    // handed to the applier comes from the SESSION and never from the body.
    assert.match(source, /getActiveAgencyId\(session\)/,
      "the apply route stopped naming the session's agency at all");
    assert.match(
      source,
      /applyPhaseToClient\(\s*clientId,\s*phaseId,\s*(?:getActiveAgencyId\(session\)|agencyId)\s*\)/,
      "the applier is no longer handed the session's agency as its third argument",
    );
    assert.match(source, /const agencyId = getActiveAgencyId\(session\)|applyPhaseToClient\(clientId, phaseId, getActiveAgencyId\(session\)\)/,
      "`agencyId`, if a local, must be the session's — not re-read from anywhere else");
    assert.doesNotMatch(source, /applyPhaseToClient\([^)]*\bbody\b[^)]*\)/,
      "the applier is being handed something body-derived — this is the exact hole ARM 2 exists for");

    // And the improvement that came with the hoist: the route refuses a client
    // outside the session's agency BEFORE it reaches the applier, so an outsider
    // gets the same "not found" as a nonexistent id.
    assert.match(source, /getClientForAgency\(agencyId, clientId\)/,
      "the route stopped checking the client belongs to the session's agency");
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
