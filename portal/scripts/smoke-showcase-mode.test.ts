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
  assert.match(settings, /hash === "showcase" \? "environment"/);
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
  assert.match(agencyLayout, /publicShowcase: session\.publicShowcase/);
  assert.match(agencyLayout, /session\.publicShowcase \? agency\.name : INTERNAL_WORKSPACE_NAME/);
  assert.match(read("src/app/portal/agency/page.tsx"), /session\.publicShowcase \? agency\.name : INTERNAL_WORKSPACE_NAME/);
  const clientLayout = read("src/app/portal/clients/[clientId]/layout.tsx");
  assert.match(clientLayout, /publicShowcase=\{session\.publicShowcase\}/);
  assert.match(clientLayout, /session\.publicShowcase \? "Permissions" : "Client settings"/);
});

test("public showcase client hub hides every management control and heavy mutable workspace", () => {
  const page = read("src/app/portal/clients/page.tsx");
  const hub = read("src/app/portal/clients/_PeopleHub.tsx");

  assert.match(page, /if \(!session\.publicShowcase\) ensureDefaultAgencyProducts/);
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
  assert.match(page, /const canManageClient = isAgencyRole\(session\.role\) && !session\.publicShowcase/);
  assert.match(page, /session\.publicShowcase[\s\S]*listAgencyProducts\(session\.agencyId\)/);
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

  assert.match(agencyPage, /canManage=\{canManageWorkspace\}/);
  assert.match(command, /<fieldset disabled=\{!canManage\} className="contents">/);
  assert.match(command, /canManage && clockOutReviewOpen/);
  assert.match(fulfilment, /const canManage = !session\.publicShowcase/);
  assert.match(fulfilment, /if \(session\.publicShowcase && \(view === "technical" \|\| view === "tags"\)\) redirect/);
  assert.match(marketing, /if \(session\.publicShowcase && view !== "pulse"\) redirect/);
  assert.match(marketing, /canManage \? ensureAgencyWebsite\(session\.agencyId\) : readAgencyWebsite\(session\.agencyId\)/);
  assert.match(company, /const canEdit = !session\.publicShowcase/);
  assert.match(company, /if \(canEdit\) ensureDefaultAgencyProducts/);

  const inboxPage = read("src/app/portal/agency/inbox/page.tsx");
  const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
  assert.match(inboxPage, /actionsSlot=\{session\.publicShowcase \? null/);
  assert.match(inboxPage, /readOnly=\{Boolean\(session\.publicShowcase\)\}/);
  assert.match(inbox, /<fieldset disabled=\{readOnly\} className="contents">/);

  const sopPage = read("src/app/portal/agency/sop-library/page.tsx");
  const sopLibrary = read("src/app/portal/agency/sop-library/_SopLibrary.tsx");
  assert.match(sopPage, /const canManageGuides = !session\.publicShowcase/);
  assert.match(sopLibrary, /canManageGuides && folder\.id !== "uncategorised"/);
  assert.match(sopLibrary, /disabled=\{!canManageGuides\}/);
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
