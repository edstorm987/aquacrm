import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

const read = (path: string) => readFileSync(path, "utf8");

test("showcase mode uses a separate hardcoded tenant and never copies live records", () => {
  const seed = read("src/lib/server/auth/showcaseMode.ts");
  assert.match(seed, /SHOWCASE_AGENCY_SLUG = "milesymedia-showcase"/);
  assert.match(seed, /Northstar Studio/);
  assert.match(seed, /Harbour & Pine/);
  assert.match(seed, /Fieldnote Coffee/);
  assert.match(seed, /Evergreen Legal/);
  assert.match(seed, /Lumen Architecture/);
  assert.match(seed, /currentValue: 18600, targetValue: 15000/);
  assert.match(seed, /Client retention", metric: "Retained clients", currentValue: 98/);
  assert.match(seed, /showcaseTelemetry/);
  assert.match(seed, /showcaseInvoice/);
  assert.match(seed, /Homepage consultation CTA/);
  assert.match(seed, /status: "delivered"/);
  assert.match(seed, /\.example/);
  assert.doesNotMatch(seed, /listClients\(/);
  assert.doesNotMatch(seed, /session\.agencyId/);
});

test("entering and exiting showcase mode rotates the signed tenant session", () => {
  const route = read("src/app/api/auth/showcase-mode/route.ts");
  const auth = read("src/lib/server/auth/auth.ts");
  const types = read("src/server/types.ts");
  assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
  assert.match(route, /invalid_origin/);
  assert.match(route, /resetAndSeedShowcaseWorkspace/);
  assert.match(route, /showcaseReturnAgencyId/);
  assert.match(route, /sessionCookie/);
  assert.match(auth, /showcaseReturnAgencyId/);
  assert.match(types, /showcaseReturnAgencyId/);
});

test("settings consolidates private showcase into Environment while public and legacy exits remain unmistakable", () => {
  const settings = read("src/app/portal/agency/settings/SettingsTabs.tsx");
  const panel = read("src/app/portal/agency/settings/SandboxModePanel.tsx");
  const sandboxControl = read("src/components/chrome/SandboxModeSwitcher.tsx");
  const topbar = read("src/components/chrome/Topbar.tsx");
  const control = read("src/components/chrome/ShowcaseModeControl.tsx");
  const publicControl = read("src/components/chrome/PublicShowcaseControl.tsx");
  const styles = read("src/app/globals.css");
  assert.match(settings, /label: "Environment"/);
  // The `#showcase` bookmark must still open Environment. Asserted as the
  // ALIAS ENTRY rather than the old inline `hash === "showcase" ? …` ternary:
  // that expression moved into `LEGACY_TAB_ALIASES` on 2026-08-29 when three
  // retired tab ids needed the same treatment. Matching the expression would
  // fail on a refactor while a real regression — dropping the alias — passed.
  assert.match(settings, /showcase: "environment"/);
  assert.match(panel, /Enter Sandbox Mode/);
  assert.match(panel, /Production snapshot/);
  assert.match(panel, /Reset selected data/);
  assert.match(sandboxControl, /Exit Sandbox Mode/);
  assert.match(topbar, /ShowcaseModeControl/);
  assert.match(control, /Exit Showcase Mode/);
  assert.match(control, /mm-showcase-control/);
  assert.match(publicControl, /mm-public-showcase-control/);
  assert.match(topbar, /mm-public-showcase-visitor/);
  assert.match(styles, /data-color-mode="light"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-showcase-control/);
  assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-showcase-control/);
  assert.match(styles, /data-color-mode="light"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-public-showcase-control/);
  assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\] \.mm-portal-topbar \.mm-public-showcase-control/);
});

test("showcase reset removes every tenant-owned data collection", () => {
  const seed = read("src/lib/server/auth/showcaseMode.ts");
  assert.match(seed, /for \(const value of Object\.values\(state\)\)/);
  assert.match(seed, /record\.agencyId === agencyId/);
  assert.match(seed, /clientIds\.has\(record\.clientId\)/);
  assert.match(seed, /state\.pipelineCards/);
  assert.match(seed, /state\.pluginData/);
  assert.match(seed, /state\.websiteSiteConfigs/);
  assert.match(seed, /state\.activity = state\.activity\.filter/);
  for (const leakedCollection of ["persons", "organisations", "identityResolutionReviews"]) {
    assert.match(read("src/server/storage.ts"), new RegExp(`${leakedCollection}: \\{\\}`));
  }
});

test("public showcase launches the real product with fictional read-only data", () => {
  const route = read("src/app/showcase/route.ts");
  const exit = read("src/app/showcase/exit/route.ts");
  const proxy = read("src/proxy.ts");
  const topbar = read("src/components/chrome/Topbar.tsx");
  const projects = read("../website/projects.js");
  const middleware = read("middleware.ts");

  assert.match(route, /ensurePublicShowcaseWorkspace/);
  assert.doesNotMatch(route, /resetAndSeedShowcaseWorkspace/);
  assert.match(route, /publicShowcase: true/);
  assert.match(route, /agencyIds: \[agency\.id\]/);
  assert.match(proxy, /payload\?\.publicShowcase/);
  assert.match(proxy, /This public showcase is read-only/);
  assert.match(middleware, /import \{ proxy \} from "\.\/src\/proxy"/);
  assert.match(middleware, /matcher: \["\/portal\/:path\*", "\/api\/:path\*"\]/);
  assert.match(middleware, /return proxy\(req\)/);
  assert.doesNotMatch(middleware, /NextResponse\.next/);
  assert.match(topbar, /PublicShowcaseControl/);
  assert.match(exit, /AQUACRM_WEBSITE_URL/);
  assert.match(projects, /http:\/\/localhost:3032\/showcase/);
  assert.match(projects, /https:\/\/aqua-crm\.com\/showcase/);
});

test("public showcase stays read-only without trapping a real user at sign-in", () => {
  const token = `${Buffer.from(JSON.stringify({ publicShowcase: true })).toString("base64url")}.test-signature`;
  const request = (path: string, method = "POST") => new NextRequest(`http://localhost:3032${path}`, {
    method,
    headers: { cookie: `lk_session_v1=${token}` },
  });

  assert.equal(proxy(request("/api/auth/login")).status, 200);
  assert.equal(proxy(request("/api/auth/login/browser")).status, 200);
  assert.equal(proxy(request("/api/auth/logout")).status, 200);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(proxy(request("/api/portal/tasks", method)).status, 403);
  }
  for (const path of [
    "/api/portal/calendar/google/callback",
    "/api/portal/inbox/meta/callback",
    "/api/portal/team-chat",
    "/api/portal/website",
    "/api/portal/clients/example/radar",
    "/api/cron/inbox",
    "/api/v1/records",
  ]) {
    assert.equal(proxy(request(path, "GET")).status, 403, `${path} must not mutate through GET`);
  }
});

test("public and owner showcase fixtures cannot reset one another", () => {
  const seed = read("src/lib/server/auth/showcaseMode.ts");
  const publicRoute = read("src/app/showcase/route.ts");
  assert.match(seed, /PUBLIC_SHOWCASE_AGENCY_SLUG = "milesymedia-public-showcase"/);
  assert.match(seed, /ensurePublicShowcaseWorkspace/);
  assert.match(publicRoute, /ensurePublicShowcaseWorkspace/);
  assert.doesNotMatch(publicRoute, /resetShowcaseWorkspace|resetAndSeedShowcaseWorkspace/);
});

test("public showcase chrome links to the read-only access summary, not Agency Settings", () => {
  const sidebar = read("src/lib/chrome/sidebarLayout.ts");
  const agencyLayout = read("src/app/portal/agency/layout.tsx");
  assert.match(sidebar, /input\.publicShowcase[\s\S]*label: "Permissions"[\s\S]*href: "\/portal\/account\/permissions"/);
  // The buildSidebar call moved into the shared assembler on 2026-08-30; the
  // guarantee — showcase flows into the sidebar assembly — moved with it.
  assert.match(read("src/lib/server/chrome/agencyBasePanels.ts"), /publicShowcase: session\.publicShowcase/);
  assert.match(agencyLayout, /assembleAgencyBasePanels\(session\)/);
  assert.match(agencyLayout, /session\.publicShowcase \? agency\.name : INTERNAL_WORKSPACE_NAME/);
  assert.match(read("src/app/portal/agency/page.tsx"), /session\.publicShowcase \? agency\.name : INTERNAL_WORKSPACE_NAME/);
  const clientLayout = read("src/app/portal/clients/[clientId]/layout.tsx");
  assert.match(clientLayout, /publicShowcase=\{session\.publicShowcase\}/);
  assert.match(clientLayout, /session\.publicShowcase \? "Permissions" : "Client settings"/);
});

/**
 * Source with comments stripped.
 *
 * Both pages now EXPLAIN in a comment why the seeding call was removed, and a
 * `doesNotMatch` against raw source counts that explanation as the thing it
 * forbids. Same trap the HR sweep hit by matching an import line.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

test("public showcase client hub hides every management control and heavy mutable workspace", () => {
  const page = read("src/app/portal/clients/page.tsx");
  const hub = read("src/app/portal/clients/_PeopleHub.tsx");

  // Was `if (!session.publicShowcase) ensureDefaultAgencyProducts(...)`. That
  // guard existed only because the call WROTE, and a public showcase visitor
  // must not write. The read cannot write any more (issue #21), so the guard is
  // gone and the stronger property is asserted instead: the page reaches no
  // seeding write at all, for anyone.
  assert.doesNotMatch(code(page), /ensureDefaultAgencyProducts\s*\(/,
    "the Clients list is seeding the product catalogue again, which a public showcase visitor would trigger");
  assert.match(page, /publicShowcase: session\.publicShowcase/);
  assert.match(page, /canManage=\{!session\.publicShowcase\}/);
  assert.match(page, /journeyWorkspace=\{session\.publicShowcase \? null : <JourneyCommercialWorkspace/);
  assert.match(page, /notifications=\{session\.publicShowcase \? null/);
  assert.match(hub, /canManage \? \([\s\S]*Add contact[\s\S]*NewClientButton/);
  assert.match(hub, /Read-only showcase/);
  assert.match(hub, /canManage \? journeyWorkspace : <JourneySection rows=\{journeyRows\} canManage=\{false\}/);
  assert.match(hub, /canManage && addingContact/);
  assert.match(hub, /canManage && reviewing/);
});

test("public showcase client detail keeps every workspace read-only", () => {
  const page = read("src/app/portal/clients/[clientId]/page.tsx");
  // Whitespace-insensitive, and it now has a THIRD conjunct. `canManageClient`
  // went multi-line when the client-element gate was added on top of the role
  // and showcase checks — strictly stricter, which the old single-line regex
  // reported as the condition disappearing. What must hold is that an agency
  // role, a non-showcase session AND the element level all gate management.
  assert.match(
    page,
    /const canManageClient = isAgencyRole\(session\.role\)\s*&&\s*!session\.publicShowcase/,
    "canManageClient stopped requiring an agency role outside public showcase",
  );
  assert.match(
    page,
    /const canManageClient = isAgencyRole\(session\.role\)[\s\S]{0,160}?clientWorkspaceElementAtLeast\(activeElementLevel, "use"\)/,
    "canManageClient stopped consulting the client workspace element level",
  );
  // This pinned the showcase BRANCH that avoided the seeding write:
  // `session.publicShowcase ? listAgencyProducts(...) : ensureDefault...`.
  // Both sides are reads now, so the branch is gone — and its only other effect
  // was handing a showcase visitor an UNREPAIRED catalogue, a worse view of the
  // same data. The stronger property replaces it: one read, no write, for
  // everybody.
  assert.doesNotMatch(code(page), /ensureDefaultAgencyProducts\s*\(/,
    "the client record is seeding the product catalogue again");
  assert.match(page, /agencyProductsForRead\(session\.agencyId\)/,
    "the client record no longer repairs the catalogue it renders");
  assert.match(page, /tab === "notes" && !session\.publicShowcase/);
  assert.match(page, /canManage=\{canManageClient\}/);
  assert.match(page, /canManageProductPlans=\{canManageClient\}/);

  for (const path of [
    "src/app/portal/clients/[clientId]/_ClientRequestsPanel.tsx",
    "src/app/portal/clients/[clientId]/_ClientNotesWorkspace.tsx",
    "src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx",
    "src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx",
    "src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx",
    "src/app/portal/clients/[clientId]/_PropertiesTabClient.tsx",
    "src/app/portal/clients/[clientId]/_FinanceTabClient.tsx",
    "src/app/portal/clients/[clientId]/_ContractsPanel.tsx",
    "src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx",
    "src/app/portal/clients/[clientId]/_FulfilmentPortalPreview.tsx",
    "src/app/portal/clients/[clientId]/_FilesTabClient.tsx",
  ]) {
    assert.match(read(path), /canManage/, `${path} must expose a read-only management boundary`);
  }

  const overview = read("src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx");
  assert.match(overview, /canManageProductPlans \? "Add note" : "View notes"/);
});

test("public showcase agency workspaces cannot expose owner mutation controls", () => {
  const agencyPage = read("src/app/portal/agency/page.tsx");
  const command = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const fulfilment = read("src/app/portal/agency/fulfilment/page.tsx");
  const marketing = read("src/app/portal/agency/marketing/page.tsx");
  const company = read("src/app/portal/agency/company/page.tsx");

  // 2026-09-03: the flag is derived from the capped element projection (a showcase or
  // read-only session never reaches "manage"), and it feeds the Radar policy panel and
  // the executive workspace's edit affordance rather than one canManage prop.
  assert.match(agencyPage, /const canManageWorkspace = workspaceElementAtLeast\(workspaceElementLevel\(staffAccess, "workspace\.settings"\), "manage"\)/);
  assert.match(agencyPage, /canManageRadarPolicy=\{canManageWorkspace\}/);
  assert.match(agencyPage, /canEdit: canManageWorkspace/);
  // 2026-09-03: the Day-mode controls are disabled unless the actor may USE the
  // personal command element; `writable` is false for every showcase/read-only
  // session (personalRadarAccess.ts), so a showcase visitor still meets a disabled
  // fieldset — through the element projection rather than a bare flag.
  assert.match(command, /<fieldset disabled=\{dashboardMode === "day" && !canUsePersonalCommand\} className="contents">/);
  assert.match(agencyPage, /canUsePersonalCommand=\{personalCommandAccess\.writable\}/);
  assert.match(command, /canUsePersonalCommand && clockOutReviewOpen/);
  assert.match(fulfilment, /const canManage = !session\.publicShowcase/);
  assert.match(fulfilment, /if \(session\.publicShowcase && \(view === "technical" \|\| view === "tags"\)\) redirect/);
  assert.match(marketing, /if \(session\.publicShowcase && view !== "pulse"\) redirect/);
  // Was `canManage ? ensureAgencyWebsite(...) : readAgencyWebsite(...)`. That
  // branch existed only to keep a non-manager from triggering the WRITE, and its
  // other effect was handing them a null where a manager got an object. Both
  // sides are one read now (issue #21), so the stronger property is asserted:
  // Marketing reaches no website write at all, for anyone.
  assert.doesNotMatch(code(marketing), /ensureAgencyWebsite\s*\(/,
    "the Marketing page creates the agency website record again");
  assert.match(marketing, /agencyWebsiteForRead\(session\.agencyId\)/);
  assert.match(company, /const canEdit = !session\.publicShowcase/);
  // Same story: the discarded `if (canEdit) ensureDefaultAgencyProducts(...)`
  // is gone because reading the catalogue no longer writes it.
  assert.doesNotMatch(code(company), /ensureDefaultAgencyProducts\s*\(/,
    "the Company page is seeding the product catalogue again");
  assert.match(company, /agencyProductsForRead\(session\.agencyId, true\)/,
    "the Company page no longer repairs the catalogue it renders");

  const inboxPage = read("src/app/portal/agency/inbox/page.tsx");
  const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
  // 2026-08-30: the null-for-showcase decision now lives one line up, on the
  // single assembly that feeds both the slot and the badge.
  assert.match(inboxPage, /preparedActions = session\.publicShowcase \? null/);
  // 2026-09-03: read-only now follows the actor's Inbox element level, whose
  // projection is capped to "view" for every showcase/read-only session
  // (capReadOnlySession), so a showcase visitor still gets a read-only inbox.
  assert.match(inboxPage, /readOnly=\{!inboxWritable\}/);
  assert.match(inboxPage, /const inboxWritable = [^\n]*"use"\)/);
  // 2026-09-03: the outer fieldset became per-action guards plus a visible
  // "View only" badge, and every child workspace receives `canMutate={!readOnly}`
  // and disables its own controls behind it.
  assert.match(inbox, /\{readOnly \? <span[^>]*>View only<\/span> : null\}/);
  assert.ok((inbox.match(/canMutate=\{!readOnly\}/g) ?? []).length >= 3, "every inbox workspace must receive canMutate={!readOnly}");
  assert.match(read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx"), /<fieldset disabled=\{!canMutate\} className="contents">/);
  assert.match(read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx"), /<fieldset disabled=\{!canMutate\}/);

  const sopPage = read("src/app/portal/agency/sop-library/page.tsx");
  const sopLibrary = read("src/app/portal/agency/sop-library/_SopLibrary.tsx");
  assert.match(sopPage, /const canManageGuides = !session\.publicShowcase/);
  assert.match(sopLibrary, /canManageGuides && folder\.id !== "uncategorised"/);
  assert.match(sopLibrary, /disabled=\{!canManageGuides \|\| Boolean\(sop\.deleteState\)\}/);
});

test("public showcase cannot read internal development or settings surfaces", () => {
  const token = `${Buffer.from(JSON.stringify({ publicShowcase: true })).toString("base64url")}.test-signature`;
  const request = (path: string) => new NextRequest(`http://localhost:3032${path}`, {
    headers: { cookie: `lk_session_v1=${token}` },
  });

  assert.equal(proxy(request("/portal/dev-team")).status, 307);
  assert.equal(proxy(request("/portal/agency/dev-docs")).status, 307);
  assert.equal(proxy(request("/portal/agency/development/code")).status, 307);
  assert.equal(proxy(request("/portal/agency/settings")).status, 307);
  assert.equal(proxy(request("/portal/agency/actions")).status, 307);
  assert.equal(proxy(request("/portal/agency/email-sender")).status, 307);
  assert.equal(proxy(request("/portal/agency/fulfilment")).status, 200);
  assert.equal(proxy(request("/portal/agency/sop-library")).status, 200);
  assert.equal(proxy(request("/api/portal/dev/projects")).status, 404);
  assert.equal(proxy(request("/api/portal/site-editor/files")).status, 404);

  const role = read("src/lib/server/auth/effectiveRole.ts");
  assert.match(role, /if \(session\.publicShowcase\)/);
  assert.match(role, /roleLabel: "Showcase visitor", permissions: SHOWCASE_READ_PERMISSIONS, isFounder: false/);
  assert.match(role, /SHOWCASE_READ_PERMISSIONS[\s\S]*"clients\.view"[\s\S]*"finance\.view"/);
  assert.doesNotMatch(role, /SHOWCASE_READ_PERMISSIONS[\s\S]{0,500}"clients\.edit"/);
});

test("live client login and public project showcase are separate entry paths", () => {
  const login = read("src/app/login/page.tsx");
  const liveBoundary = read("src/app/login/live/route.ts");
  const projects = read("public/aquacrm-site/projects.js");

  assert.match(login, /session\?\.publicShowcase/);
  assert.match(login, /redirect\(`\/login\/live\?/);
  assert.match(liveBoundary, /clearSessionCookie/);
  assert.match(liveBoundary, /session\?\.publicShowcase/);
  assert.match(liveBoundary, /NextResponse\.redirect\(destination, 303\)/);
  assert.match(projects, /\/login\/live\?brand=aquacrm&next=\/portal/);
  assert.match(projects, /http:\/\/localhost:3032\/showcase/);
  assert.match(projects, /https:\/\/aqua-crm\.com\/showcase/);
});
