// Standalone portal nav smoke.
//
// This guards the simplified AquaOasis-Web operating system: one obvious client
// workspace, one merged journey route, one phases/settings route, and no old
// fulfilment client-list UI leaking back into the sidebar.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import agencyHrManifest from "../src/built-ins/modules/agency-hr/index";
import { retiredStaffRedirect, withQuery, CANONICAL_STAFF_HREF } from "../src/app/portal/agency/[...rest]/_retiredStaffRoute";
import type { PluginInstall } from "../src/server/types";

// The suite runs under `--conditions react-server`, where `react` has no
// `createContext` — so `next/navigation`'s client build (the one plain Node
// resolution picks) throws on import and any module importing it is
// unloadable. Next itself ships a react-server build of the same module; swap
// it into the CJS cache before anything pulls `next/navigation` in, so the real
// `redirect()` can be driven here instead of grepped for. Must run before the
// dynamic import of StaffPage below.
const nextRequire = createRequire(import.meta.url);
const NAVIGATION_CLIENT_BUILD = nextRequire.resolve("next/dist/client/components/navigation.js");
(nextRequire as unknown as { cache: Record<string, unknown> }).cache[NAVIGATION_CLIENT_BUILD] = {
  id: NAVIGATION_CLIENT_BUILD,
  filename: NAVIGATION_CLIENT_BUILD,
  path: NAVIGATION_CLIENT_BUILD,
  loaded: true,
  children: [],
  paths: [],
  exports: nextRequire("next/dist/client/components/navigation.react-server.js"),
};

// `redirect()` signals by throwing an error whose digest is
// `NEXT_REDIRECT;<kind>;<url>;<status>;`. Run the real component and read the
// destination back out; returns null when nothing redirected.
async function redirectTargetOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

function agencyHrInstall(): PluginInstall {
  return { pluginId: "agency-hr", enabled: true, features: {}, config: {} } as unknown as PluginInstall;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SIDEBAR_LAYOUT = join(ROOT, "src", "lib", "chrome", "sidebarLayout.ts");
const SIDEBAR = join(ROOT, "src", "components", "chrome", "Sidebar.tsx");
const PROFILE = join(ROOT, "src", "components", "chrome", "ProfileMenu.tsx");
const ARCHIVED_MULTI_AGENCY = join(ROOT, "src", "archive", "multi-agency");
const CATCHALL = join(ROOT, "src", "app", "portal", "agency", "[...rest]", "page.tsx");
const AGENCY_HOME = join(ROOT, "src", "app", "portal", "agency", "page.tsx");
const TOOLS_PAGE = join(ROOT, "src", "app", "portal", "agency", "tools", "page.tsx");
const COMPANY_WORKSPACE = join(ROOT, "src", "app", "portal", "agency", "company", "_CompanyWorkspace.tsx");
const BATTLE_TABLE = join(ROOT, "src", "app", "portal", "agency", "_BattleTableWorkspace.tsx");
const MASTER_INBOX = join(ROOT, "src", "app", "portal", "agency", "inbox", "_MasterInbox.tsx");
const MARKETING_PAGE = join(ROOT, "src", "app", "portal", "agency", "marketing", "page.tsx");
const SEARCH_ROUTE = join(ROOT, "src", "app", "api", "portal", "search", "route.ts");
const CLIENT_SOPS = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "_ClientSopsTab.tsx");
const PLUGIN_WORKSPACE_NAV = join(ROOT, "src", "components", "workspaces", "PluginWorkspaceNav.tsx");
const FINANCE_NAV = join(ROOT, "src", "built-ins", "modules", "agency-finance", "src", "components", "FinanceNav.tsx");
const FINANCE_PLANS = join(ROOT, "src", "built-ins", "modules", "agency-finance", "src", "pages", "PlansPage.tsx");
const FINANCE_LOCK_IN = join(ROOT, "src", "built-ins", "modules", "agency-finance", "src", "pages", "LockInPage.tsx");
const FINANCE_SETTINGS = join(ROOT, "src", "built-ins", "modules", "agency-finance", "src", "pages", "SettingsPage.tsx");
const FINANCE_SECTIONS_FILE = join(ROOT, "src", "built-ins", "modules", "agency-finance", "src", "lib", "sections.ts");
const PIPELINE_PAGE = join(ROOT, "src", "app", "portal", "agency", "pipelines", "[slug]", "page.tsx");
const CLIENTS_PAGE = join(ROOT, "src", "app", "portal", "clients", "page.tsx");
const PEOPLE_HUB = join(ROOT, "src", "app", "portal", "clients", "_PeopleHub.tsx");
const CLIENT_HOME = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "page.tsx");
const WEBSITE_BUILDER_LAUNCHER = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "_WebsiteBuilderLauncher.tsx");
const NEW_CLIENT_BUTTON = join(ROOT, "src", "app", "portal", "agency", "_NewClientButton.tsx");
const LEGACY_FULFILLMENT_CLIENT_LIST = join(ROOT, "src", "built-ins", "modules", "fulfillment", "src", "components", "ClientList.tsx");
const CREATE_CLIENT_ROUTE = join(ROOT, "src", "app", "api", "portal", "fulfillment", "clients", "route.ts");
const LEGACY_APPLY_INCUBATOR_ROUTE = join(ROOT, "src", "app", "api", "tenants", "apply-incubator-variant", "route.ts");
const CLIENT_STATUS_ROUTE = join(ROOT, "src", "app", "api", "tenants", "client-status", "route.ts");
const CLIENT_SETTINGS_PAGE = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "settings", "page.tsx");
const CLIENT_SETTINGS_ACTIONS = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "settings", "_ClientStatusActions.tsx");
const BUILD_PORTAL_WIZARD = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "_BuildPortalWizard.tsx");
const CONTACTS_WORKSPACE = join(ROOT, "src", "app", "portal", "agency", "leads-pipeline", "contacts", "_ContactsWorkspace.tsx");
const LEADS_WORKSPACE = join(ROOT, "src", "app", "portal", "agency", "pipelines", "[slug]", "_LeadsPipelineWorkspace.tsx");
const LEADS_HANDLERS = join(ROOT, "src", "built-ins", "modules", "leads-pipeline", "src", "api", "handlers.ts");
const ACTIVITY_INBOX_PAGE = join(ROOT, "src", "app", "portal", "agency", "activity-inbox", "page.tsx");
const AGENCY_ACTIVITY_FEED = join(ROOT, "src", "app", "portal", "agency", "_AgencyActivityFeed.tsx");
const AGENCY_SETTINGS_PAGE = join(ROOT, "src", "app", "portal", "agency", "settings", "page.tsx");
const AGENCY_SETTINGS_TABS = join(ROOT, "src", "app", "portal", "agency", "settings", "SettingsTabs.tsx");
const DEVELOPMENT_NAV = join(ROOT, "src", "app", "portal", "agency", "development", "_DevelopmentNav.tsx");
const DEVELOPMENT_PERFORMANCE = join(ROOT, "src", "app", "portal", "agency", "development", "performance", "page.tsx");
const PORTAL_NOT_FOUND = join(ROOT, "src", "app", "portal", "not-found.tsx");
const CUSTOMER_HOME = join(ROOT, "src", "app", "portal", "customer", "page.tsx");
const CUSTOMER_SUBROUTE = join(ROOT, "src", "app", "portal", "customer", "_subroute.tsx");
const CUSTOMER_BOOKINGS = join(ROOT, "src", "app", "portal", "customer", "bookings", "page.tsx");
const CUSTOMER_ORDERS = join(ROOT, "src", "app", "portal", "customer", "orders", "page.tsx");
const CUSTOMER_CHROME = join(ROOT, "src", "app", "portal", "customer", "_CustomerPortalChrome.tsx");
const ORDER_DETAIL = join(ROOT, "src", "built-ins", "modules", "ecommerce", "src", "components", "admin", "OrderDetail.tsx");
const ORDER_DETAIL_PAGE = join(ROOT, "src", "built-ins", "modules", "ecommerce", "src", "pages", "OrderDetailPage.tsx");
const TENANTS = join(ROOT, "src", "server", "tenants.ts");
const FINANCE_MANIFEST = join(ROOT, "src", "built-ins", "modules", "agency-finance", "index.ts");
const LEADS_MANIFEST = join(ROOT, "src", "built-ins", "modules", "leads-pipeline", "index.ts");
const FOUNDER_SEED = join(ROOT, "src", "lib", "server", "seeds", "founderSeed.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function agencyMainItemBlock(src: string): string {
  const match = src.match(/AquaOasis-Web canonical sidebar[\s\S]*?if \(input\.scope === "agency"\)/);
  return match?.[0] ?? src;
}

describe("standalone portal nav audit", () => {
  it("keeps one clean agency main nav", () => {
    const src = read(SIDEBAR_LAYOUT);
    const block = agencyMainItemBlock(src);
    const expected = [
      // Inbox + Actions merged into one row (view=actions is a tab inside the
      // Master Inbox). There is no longer a standalone Actions nav item.
      ["fulfilment", "/portal/agency/fulfilment"],
      ["pipelines", "/portal/clients?view=journey"],
      ["marketing", "/portal/agency/marketing"],
      ["inbox", "/portal/agency/inbox"],
      ["finance", "/portal/agency/agency-finance"],
      ["sop-library", "/portal/agency/sop-library"],
      ["tools", "/portal/agency/tools"],
    ];

    for (const [id, href] of expected) {
      assert.ok(block.includes(`id: "${id}"`), `${id} main nav item missing`);
      assert.ok(block.includes(`href: "${href}"`), `${href} main nav href missing`);
    }
    assert.ok(!block.includes('label: "Clients & contacts"'), "clients and contacts should live inside Journey");
    assert.ok(!block.includes('id: "contacts"'), "contacts should live inside the clients hub");
    assert.ok(src.includes('label: "Command Centre"'), "the dashboard should be named Command Centre");
    assert.ok(src.includes('id: "people",      label: "Staff"'), "the primary People workspace should be labelled Staff");
    assert.ok(!block.includes('id: "command-center"'), "Day Command should live in the Command Centre station strip");
    assert.ok(!block.includes('id: "company"'), "executive Company work should live in Battle Table rather than the sidebar");
    assert.ok(!block.includes('id: "development"'), "technical delivery should live inside Fulfilment rather than the sidebar");
    assert.ok(!block.includes('href: "/portal/agency/actions"'), "Actions merged into the inbox row; no standalone Actions nav item");
    assert.ok(block.includes('label: "Inbox & actions"'), "the inbox row now covers inbox and actions");
    assert.ok(!block.includes('id: "sales"'), "sales should live inside Pipelines");
    assert.ok(!block.includes('id: "products"'), "products should live in Battle Table's executive systems map");
    assert.ok(!block.includes('id: "fulfillment", label: "Fulfilment"'), "duplicate Fulfilment main nav item should stay removed");
    assert.ok(read(PEOPLE_HUB).includes('label="Clients"'), "clients should remain available inside Journey");
    assert.ok(read(PEOPLE_HUB).includes('label="Contacts"'), "contacts should remain available inside Journey");
    assert.ok(read(CLIENTS_PAGE).includes(': "journey";'), "Journey should be the default people-hub view");

    // IA v2 — Command Centre (home) and Inbox & actions stay on "main"; every
    // business function groups under the labelled "Operations" panel. Routes
    // are unchanged; this is a sidebar re-grouping.
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const mainPanel = panels.find(panel => panel.id === "main");
    const opsPanel = panels.find(panel => panel.id === "ops");
    assert.ok(mainPanel, "a Command Centre (main) panel assembles");
    assert.ok(opsPanel, "an Operations (ops) panel assembles");
    assert.equal(opsPanel!.label, "Operations", "the Operations surface carries its label");
    assert.deepEqual(
      mainPanel!.items.map(item => item.id),
      ["home", "inbox"],
      "only Command Centre + Inbox & actions stay on the main panel",
    );
    assert.deepEqual(
      opsPanel!.items.map(item => item.id),
      ["pipelines", "fulfilment", "aqua-tags", "marketing", "finance", "people", "freelancers", "sop-library", "governance", "you-deserve-it"],
      "the business functions group under Operations in delegation order",
    );
  });

  it("allows only the canonical agency ids through the AquaOasis-Web override", () => {
    const src = read(SIDEBAR_LAYOUT);
    // The override's allow-list now spans two grouped surfaces plus Tools.
    const command = src.match(/const commandCentreIds = \[([\s\S]*?)\];/)?.[1] ?? "";
    const operations = src.match(/const operationsIds = \[([\s\S]*?)\];/)?.[1] ?? "";
    const canonical = `${command}${operations}`;
    for (const id of ["home", "inbox"]) {
      assert.ok(command.includes(`"${id}"`), `${id} missing from the Command Centre allow-list`);
    }
    for (const id of ["fulfilment", "you-deserve-it", "pipelines", "marketing", "finance", "people", "freelancers", "sop-library", "governance", "aqua-tags"]) {
      assert.ok(operations.includes(`"${id}"`), `${id} missing from the Operations allow-list`);
    }
    assert.ok(!canonical.includes('"actions"'), "Actions merged into the inbox row; not a standalone canonical id");
    assert.ok(!canonical.includes('"command-center"'), "Day Command should not be a standalone sidebar item");
    assert.ok(!canonical.includes('"clients"'), "clients should be merged into the Journey sidebar item");
    assert.ok(!canonical.includes('"development"'), "technical delivery should live inside Fulfilment rather than the main sidebar");
    assert.ok(!canonical.includes('"performance"'), "performance should live inside Fulfilment rather than the main sidebar");
    assert.ok(!canonical.includes('"company"'), "Company should be consolidated into Battle Table");
    assert.ok(!canonical.includes('"products"'), "products should live inside Battle Table rather than the main sidebar");
    assert.ok(!canonical.includes('"calendar"'), "calendar should live on the main dashboard rather than the sidebar");
    assert.ok(!canonical.includes('"notepad"'), "notepad should live on the main dashboard rather than the sidebar");
    assert.ok(!canonical.includes('"sops"'), "the duplicate systems dashboard should not be a main nav item");
    assert.ok(!canonical.includes('"contacts"'), "contacts should not be a standalone main nav id");
    assert.ok(!canonical.includes('"sales"'), "sales should not be a standalone main nav id");
    assert.ok(!canonical.includes('"fulfillment"'), "legacy fulfillment id should not be allowed into main nav");
    assert.ok(!canonical.includes('"automations"'), "internal automations should live inside Marketing");
  });

  it("gives Aqua Tags a sidebar entry, placed with Fulfilment's items", () => {
    // The Aqua Tags control tower lives at /portal/agency/fulfilment?view=tags.
    // Before 2026-08-20 no sidebar or menu entry pointed at it — the workspace
    // was reachable only through the in-page Fulfilment tab strip.
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    // IA v2 — Fulfilment and Aqua tags now group under the "Operations" panel.
    const ops = panels.find(panel => panel.id === "ops");
    assert.ok(ops, "agency scope should assemble an Operations panel");
    const items = ops!.items;
    const aquaTags = items.filter(item => item.id === "aqua-tags");
    assert.equal(aquaTags.length, 1, "exactly one Aqua tags sidebar row");
    assert.equal(aquaTags[0]!.label, "Aqua tags");
    assert.equal(aquaTags[0]!.href, "/portal/agency/fulfilment?view=tags");
    // It rides directly behind Fulfilment in the Operations order.
    const fulfilmentIndex = items.findIndex(item => item.id === "fulfilment");
    assert.ok(fulfilmentIndex >= 0, "Fulfilment must stay in the Operations nav");
    assert.equal(items[fulfilmentIndex + 1]?.id, "aqua-tags", "Aqua tags sits immediately after Fulfilment");
  });

  it("keeps Calendar and Notepad together in the Tools quick-action hub", () => {
    assert.ok(existsSync(TOOLS_PAGE), "Tools page should be mounted");
    const page = read(TOOLS_PAGE);
    assert.ok(page.includes('href: "/portal/agency/calendar"'));
    assert.ok(page.includes('href: "/portal/agency/notepad"'));
    assert.ok(page.includes("Quick actions"));
  });

  it("keeps every specialist workspace visibly reachable", () => {
    const tools = read(TOOLS_PAGE);
    const company = read(COMPANY_WORKSPACE);
    const battleTable = read(BATTLE_TABLE);
    const inbox = read(MASTER_INBOX);
    const marketing = read(MARKETING_PAGE);
    const workspaceNav = read(PLUGIN_WORKSPACE_NAV);

    // P5 (2026-08-20) — deliberate contract update. Tools and Battle Table used
    // to launch the agency-hr copy of the staff directory; both now launch the
    // one canonical surface at /portal/agency/people.
    for (const href of [
      "/portal/agency/activity-inbox",
      "/portal/agency/people",
      "/portal/agency/email-sender",
      "/portal/agency/agency-marketing",
    ]) assert.ok(tools.includes(href), `${href} missing from Tools`);
    assert.ok(tools.includes('href: "/portal/agency/people"'), "Tools should launch People operations at the canonical staff surface");
    assert.ok(battleTable.includes('href: "/portal/agency/people"'), "Battle Table should launch People operations");
    assert.ok(company.includes('href="/portal/agency/people"'), "Company workspace should launch People operations at the canonical staff surface");
    assert.ok(inbox.includes('href="/portal/agency/email-sender"'), "Master Inbox should launch Email operations");
    assert.ok(inbox.includes('href="/portal/agency/activity-inbox"'), "Master Inbox should launch Activity log");
    assert.ok(marketing.includes('href="/portal/agency/agency-marketing"'), "Marketing should launch templates and reporting");
    for (const destination of ["departments", "leave", "employees", "roles", "email-sender/logs", "agency-marketing/templates", "agency-marketing/reports", "agency-marketing/calendar", "agency-marketing/touchpoints", "agency-marketing/performance"]) {
      assert.ok(workspaceNav.includes(destination), `${destination} missing from contextual workspace navigation`);
    }
    // agency-hr stays in the provisioning list: its Departments / Leave /
    // Employees / Roles / Settings pages are still reached through the
    // catch-all and must activate on first open. Asserted per-id rather than as
    // one literal so a formatting change cannot silently drop a workspace.
    const catchAll = read(CATCHALL);
    const provisioning = /\[([^\]]*)\]\.includes\(workspacePluginId\)/.exec(catchAll);
    assert.ok(provisioning, "catch-all should gate provisioning on an explicit workspace list");
    for (const pluginId of ["agency-hr", "email-sender", "agency-marketing"]) {
      assert.ok(provisioning![1].includes(`"${pluginId}"`), `${pluginId} missing from the catch-all provisioning list`);
    }
    assert.ok(read(CATCHALL).includes("mayProvisionWorkspace"), "only agency administrators should activate optional workspaces");
    assert.ok(workspaceNav.includes("item.adminOnly"), "administrative workspace links should stay role-gated");
  });

  it("keeps Finance links valid and exposes all specialist finance sections", () => {
    const company = read(COMPANY_WORKSPACE);
    const search = read(SEARCH_ROUTE);
    const nav = read(FINANCE_NAV);
    const sections = read(FINANCE_SECTIONS_FILE);
    assert.ok(company.includes("/portal/agency/agency-finance/payments"));
    assert.ok(search.includes("/portal/agency/agency-finance/payments?entry="));
    assert.ok(!company.includes("/portal/agency/agency-finance/income"));
    assert.ok(!search.includes("/portal/agency/agency-finance/income"));
    // The finance sub-nav derives from one canonical section list, so the
    // in-page tabs and the plugin manifest cannot drift apart.
    assert.ok(nav.includes("FINANCE_SECTIONS"), "FinanceNav should derive from the canonical section list");
    for (const href of ["/plans", "/lock-in", "/settings"]) assert.ok(sections.includes(href), `${href} missing from Finance sections`);
    assert.ok(read(FINANCE_PLANS).includes('<FinanceNav active="plans" />'));
    assert.ok(read(FINANCE_LOCK_IN).includes('<FinanceNav active="deposits" />'));
    assert.ok(read(FINANCE_SETTINGS).includes('<FinanceNav active="settings" />'));
  });

  it("keeps client SOP management inside the client workspace", () => {
    const src = read(CLIENT_SOPS);
    assert.ok(src.includes('clientWorkspaceHref(clientId, "delivery"'));
    assert.ok(src.includes("#service-assignment"));
    assert.ok(!src.includes('href="/portal/agency/sop-library"'));
  });

  it("keeps performance inside the Fulfilment technical workspace", () => {
    const nav = read(DEVELOPMENT_NAV);
    const page = read(DEVELOPMENT_PERFORMANCE);
    assert.ok(nav.includes('/portal/agency/fulfilment/technical/performance'));
    assert.ok(nav.includes('label: "Performance"'));
    assert.ok(page.includes('<DevelopmentNav active="performance" />'));
    assert.ok(page.includes('PerformancePage'));
  });

  it("keeps a single agency phases/settings path", () => {
    const src = read(SIDEBAR_LAYOUT);
    assert.ok(src.includes('id: "agency-phases"'));
    assert.ok(src.includes('href: "/portal/agency/phases"'));
    assert.ok(src.includes('id: "agency-settings"'));
    assert.ok(src.includes('href: "/portal/agency/settings"'));
    assert.ok(src.includes('item.id !== "fulfillment-phases"'), "legacy phases nav item must be filtered");
    assert.ok(src.includes('item.href !== "/portal/agency/fulfillment/phases"'), "legacy phases href must be filtered");
  });

  it("redirects old fulfilment URLs to the current product routes", () => {
    const src = read(CATCHALL);
    assert.ok(src.includes('if (rest.length === 1) redirect("/portal/agency/fulfilment")'));
    assert.ok(src.includes('if (rest[1] === "clients") redirect("/portal/agency/fulfilment?view=clients")'));
    assert.ok(src.includes('if (rest[1] === "marketplace") redirect("/portal/agency/fulfilment?view=services")'));
    assert.ok(src.includes('if (rest[1] === "phases") redirect("/portal/agency/phases")'));
    assert.ok(src.includes('redirect(`/portal/clients/${encodeURIComponent(rest[1])}?tab=delivery`)'), "old client fulfilment routes should open the canonical delivery lens");
    assert.ok(src.includes('if (rest.length === 1) redirect("/portal/agency/leads-pipeline/contacts")'), "old leads root should open contacts");
    assert.ok(src.includes('if (rest[1] === "board") redirect("/portal/agency/pipelines/leads")'), "old lead board should open the current board");
    assert.ok(src.includes('if (rest[0] === "agency-finance" && rest[1] === "founder")'), "duplicate founder finance route should redirect");
  });

  it("keeps the current clients page as the only visible create-client surface", () => {
    const src = read(CLIENTS_PAGE);
    const hub = read(PEOPLE_HUB);
    const legacyList = read(LEGACY_FULFILLMENT_CLIENT_LIST);
    assert.ok(src.includes("PeopleHub"), "clients page should expose the shared people hub");
    assert.ok(hub.includes("NewClientButton"), "people hub should expose the shared new-client modal");
    assert.ok(hub.includes("No clients yet"), "empty state should invite creating a client");
    assert.equal((hub.match(/<NewClientButton/g) ?? []).length, 1, "people hub should render only one NewClientButton");
    assert.ok(!src.includes("Go to agency home"), "old empty-state detour should stay removed");
    assert.ok(!legacyList.includes("NewClientModal"), "legacy fulfilment list should not mount a second create-client modal");
    assert.ok(!legacyList.includes("+ New client"), "legacy fulfilment list should not show a second New client button");
    assert.ok(!legacyList.includes("Create client"), "legacy fulfilment list should not show a second Create client action");
    assert.ok(legacyList.includes('href="/portal/clients"'), "legacy fulfilment list should point back to the canonical Clients page");
  });

  it("keeps dashboard and client CTAs pointed at real mounted routes", () => {
    const agencyHome = read(AGENCY_HOME);
    const pipelinePage = read(PIPELINE_PAGE);
    const clientHome = read(CLIENT_HOME);
    const websiteLauncher = read(WEBSITE_BUILDER_LAUNCHER);

    assert.ok(!agencyHome.includes('href="/portal/agency/pipelines/new"'), "new pipeline CTA should not point at a missing route");
    assert.ok(!pipelinePage.includes('href="/portal/agency/pipelines/new"'), "pipeline header should not point at a missing route");
    assert.ok(pipelinePage.includes('aria-label="Work boards"'), "pipeline header should offer direct links to each work board");
    assert.ok(!clientHome.includes("/website-editor/pages"), "website CTA should use the mounted pages route");
    assert.ok(!clientHome.includes("/website-editor/assets"), "assets CTA should use the mounted assets route");
    assert.ok(clientHome.includes("<WebsiteBuilderLauncher"), "website CTA should mount the visual builder launcher");
    assert.ok(websiteLauncher.includes("/edit-website`"), "website CTA route missing");
    assert.ok(websiteLauncher.includes("marketplace/install"), "website CTA should activate the builder when needed");
    assert.ok(clientHome.includes("`/portal/clients/${client.id}/assets`"), "assets CTA route missing");
    assert.ok(clientHome.includes("<FulfilmentPortalPreview"), "customer portal preview should remain mounted in the client workspace");
  });

  it("presents client capabilities as built-in systems", () => {
    const clientHome = read(CLIENT_HOME);
    const clientTabs = read(join(ROOT, "src", "lib", "clients", "clientWorkspace.ts"));
    const clientLayout = read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "layout.tsx"));
    const picker = read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "_ToolsPicker.tsx"));

    assert.ok(clientTabs.includes('id: "systems"'), "client tab id should be systems");
    assert.ok(clientTabs.includes('label: "Systems"'), "client tab label should be Systems");
    assert.ok(!clientLayout.includes('label: "Systems and development"'), "technical detail should not permanently crowd the client sidebar");
    assert.ok(clientHome.includes('serviceCapabilities.systems ? ["systems" as const]'), "Delivery should expose the technical lens contextually");
    assert.ok(clientTabs.includes('tools: "systems"'), "legacy tools tab links should resolve to systems");
    assert.ok(clientHome.includes('tab === "systems"'), "client systems tab branch missing");
    assert.ok(clientHome.includes("+ Add system"), "quick action should say Add system");
    assert.ok(picker.includes("Typical live-stage system set"), "live recommendation copy should say system set");
    assert.ok(picker.includes("All recommended systems are already active."), "picker should say recommended systems");
    assert.ok(picker.includes("stage system"), "picker preset badge should say stage system");
    assert.ok(read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "toolCopy.ts")).includes("Built-in workspace system"), "fallback copy should say system");
    assert.ok(!clientHome.includes('tab === "tools"'), "visible client workspace should not use tools tab branch");
    assert.ok(!clientHome.includes("+ Add capability"), "visible client workspace should not say Add capability");
    assert.ok(!clientHome.includes(">Capabilities<"), "visible client workspace should not say Capabilities");
    assert.ok(!picker.includes("recommended tools"), "picker should not say recommended tools");
    assert.ok(!picker.includes("stage tool"), "picker should not say stage tool");
  });

  it("keeps Sales and Finance available without optional setup", () => {
    assert.ok(read(FINANCE_MANIFEST).includes("core: true"), "Finance must remain an always-on built-in");
    assert.ok(read(LEADS_MANIFEST).includes("core: true"), "Sales must remain an always-on built-in");
    const founderSeed = read(FOUNDER_SEED);
    assert.ok(founderSeed.includes("installCorePluginsForScope"), "existing owner accounts must receive newly added built-ins");
    assert.ok(founderSeed.includes("await installCorePluginsForScope({ agencyId: agency.id }, existing.id)"));
  });

  it("makes a client portal optional and keeps later creation available", () => {
    const route = read(CREATE_CLIENT_ROUTE);
    const modal = read(NEW_CLIENT_BUTTON);
    assert.ok(!existsSync(LEGACY_APPLY_INCUBATOR_ROUTE), "legacy separate starter-portal endpoint should stay removed");
    assert.ok(route.includes("setupClientStarterPortal"), "create route should own starter portal setup");
    assert.ok(route.includes("starterPortal"), "create route should accept a starterPortal request");
    assert.ok(route.includes("const createPortal = body.createPortal === true"), "portal creation should require an explicit choice");
    assert.ok(route.includes("if (createPortal)"), "portal setup should only run when selected");
    assert.ok(route.includes("portalRequired: createPortal"), "client metadata should remember whether a portal is needed");
    assert.ok(route.includes("structuredClone(getState())"), "create route should snapshot state before portal setup");
    assert.ok(route.includes("client portal setup failed"), "create route should report portal setup failures clearly");
    assert.ok(modal.includes("What are we helping with?"), "new-client modal should capture a flexible service brief");
    assert.ok(modal.includes("serviceBrief: helpingWith || undefined"), "service brief should be saved with the client");
    assert.ok(!modal.includes("selectedProducts.map"), "product setup should stay out of the initial client form");
    assert.ok(modal.includes("Create a client portal now"), "new-client modal should offer portal creation");
    assert.ok(modal.includes("set up their portal later from the client record"), "modal should explain the later option");
    assert.ok(modal.includes("? {") && modal.includes("starterPortal:"), "starter portal details should only be sent when selected");
    assert.ok(read(CLIENT_HOME).includes('meta.portalBuiltAt ? "Portal preview" : "Create client portal"'), "client record should expose later portal creation");
    assert.ok(!modal.includes('fetch("/api/tenants/apply-incubator-variant"'), "modal should not fire a second portal setup request");
  });

  it("keeps lead/contact conversion transactional with starter portal setup", () => {
    const src = read(LEADS_HANDLERS);
    const leadBlock = src.match(/export async function convertLeadToClientHandler[\s\S]*?export async function archiveLeadHandler/)?.[0] ?? "";
    const contactBlock = src.match(/export async function convertContactToClientHandler[\s\S]*?export async function addContactToBoardHandler/)?.[0] ?? "";

    for (const [name, block] of [["lead", leadBlock], ["contact", contactBlock]] as const) {
      assert.ok(block.includes("structuredClone(getState())"), `${name} conversion should snapshot state before mutating`);
      assert.ok(block.includes("setupClientStarterPortal"), `${name} conversion should create the starter portal`);
      assert.ok(block.includes("restorePortalState(beforeConvert)"), `${name} conversion should roll back on portal setup failure`);
      assert.ok(block.includes("client portal setup failed"), `${name} conversion should fail loudly when portal setup fails`);
    }
  });

  it("keeps lead/contact conversion notices simple and client-workspace focused", () => {
    for (const path of [CONTACTS_WORKSPACE, LEADS_WORKSPACE]) {
      const src = read(path);
      assert.ok(src.includes("clientWorkspaceNotice"), `${path} should use the shared conversion notice helper`);
      assert.ok(src.includes("Client workspace created."), `${path} should describe the created workspace`);
      assert.ok(src.includes("Portal ready."), `${path} should confirm the portal plainly`);
      assert.ok(!src.includes("Temporary password:"), `${path} should not expose temporary passwords in the main success notice`);
      assert.ok(!src.includes("Starter portal set up."), `${path} should not use starter/setup language in the main success notice`);
      assert.ok(!src.includes("linked to existing client"), `${path} should avoid technical linked-client wording`);
    }
  });

  it("backs the client settings link with pause, resume, archive, and reactivate controls", () => {
    const layout = read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "layout.tsx"));
    const route = read(CLIENT_STATUS_ROUTE);
    const settings = read(CLIENT_SETTINGS_PAGE);
    const actions = read(CLIENT_SETTINGS_ACTIONS);
    const tenants = read(TENANTS);

    assert.ok(layout.includes('label: "Client settings"'), "client settings link missing from sidebar");
    assert.ok(existsSync(CLIENT_SETTINGS_PAGE), "client settings page missing");
    assert.ok(route.includes("updateClient"), "client-status route should update clients");
    assert.ok(route.includes('"client.archived"'), "client-status route should log archive actions");
    assert.ok(route.includes('"client.paused"'), "client-status route should log pause actions");
    assert.ok(route.includes('"client.resumed"'), "client-status route should log resume actions");
    assert.ok(route.includes('"client.reactivated"'), "client-status route should log reactivate actions");
    assert.ok(settings.includes("ClientStatusActions"), "settings page should render lifecycle controls");
    assert.ok(actions.includes('fetch("/api/tenants/client-status"'), "settings action should call status route");
    assert.ok(actions.includes("Pause client"), "settings action should expose pause");
    assert.ok(actions.includes("Resume client"), "settings action should expose resume");
    assert.ok(tenants.includes("includeArchived"), "listClients should support archive filtering");
    assert.ok(tenants.includes('c.status !== "archived"'), "archived clients should be hidden by default");
  });

  it("keeps the build-portal wizard in operator-friendly language", () => {
    const src = read(BUILD_PORTAL_WIZARD);
    assert.ok(src.includes("Creates a separate client portal workspace"), "wizard should explain the outcome plainly");
    assert.ok(src.includes("This becomes the client&apos;s separate production workspace."), "wizard should avoid local path jargon");
    assert.ok(!src.includes("Materialises <span"), "wizard should not expose materialise wording in visible copy");
    assert.ok(!src.includes("04-the-final-portal/clients/{confirmedSlug}/</span>"), "wizard should not expose repo paths in visible copy");
  });

  it("keeps account menu targets backed by real pages", () => {
    const src = read(PROFILE);
    const targets = [
      ['"/portal/account"', join(ROOT, "src", "app", "portal", "account", "page.tsx")],
      ['"/portal/account/permissions"', join(ROOT, "src", "app", "portal", "account", "permissions", "page.tsx")],
    ];
    for (const [marker, path] of targets) {
      assert.ok(src.includes(marker), `${marker} missing from ProfileMenu`);
      assert.ok(existsSync(path), `${path} missing`);
    }
  });

  it("keeps AquaOasis-Web single-agency and parks the old multi-agency controls", () => {
    const src = read(SIDEBAR);
    assert.ok(src.includes('data-testid="tenant-identity"'));
    assert.ok(!src.includes("TenantSwitcher"));
    assert.ok(!existsSync(join(ROOT, "src", "app", "api", "auth", "agency-add", "route.ts")));
    assert.ok(!existsSync(join(ROOT, "src", "app", "api", "auth", "agency-switch", "route.ts")));
    assert.ok(existsSync(join(ARCHIVED_MULTI_AGENCY, "components", "AgencySwitcher.tsx")));
    assert.ok(existsSync(join(ARCHIVED_MULTI_AGENCY, "api", "agency-add.ts")));
  });

  it("keeps sidebar empty states and footer settings plumbing", () => {
    const src = read(SIDEBAR);
    assert.ok(src.includes('data-testid="sidebar-empty-state"'));
    assert.ok(src.includes("No tools are available"));
    assert.ok(!src.includes("No tools enabled"));
    assert.ok(!src.includes("No tools active for this workspace yet."));
    assert.ok(!src.includes("No tools installed for this workspace yet."));
    assert.ok(src.includes("SidebarFooter settingsItems={settingsItems}"));
  });

  it("still hard-404s genuinely unknown agency paths after friendly known-tool handling", () => {
    const src = read(CATCHALL);
    assert.ok(src.includes("listPlugins"), "catch-all should detect known built-in tools");
    assert.ok(src.includes('data-testid="workspace-tool-unavailable"'), "friendly known-section fallback missing");
    assert.ok(src.includes("Workspace section"), "known inactive sections should use workspace-section language");
    assert.ok(src.includes("workspace systems"), "known inactive sections should point at workspace systems");
    assert.ok(src.includes('"not active"'), "known inactive sections should use product language");
    assert.ok(!src.includes('"not installed"'), "known inactive sections should not expose install language");
    assert.ok(!src.includes("hasn’t been installed"), "known inactive sections should not expose install language");
    assert.ok(src.includes("notFound();"), "unknown paths should still 404");
    assert.ok(read(PORTAL_NOT_FOUND).includes("workspace section is not active"), "portal 404 should say workspace section");
  });

  it("keeps agency settings in systems language", () => {
    const page = read(AGENCY_SETTINGS_PAGE);
    const tabs = read(AGENCY_SETTINGS_TABS);

    assert.ok(page.includes("Manage the workspace, your team"), "settings header should explain its purpose");
    assert.ok(page.includes("systemCount"), "settings context should use systemCount");
    assert.ok(tabs.includes('Stat label="Systems"'), "workspace stats should label built-ins as Systems");
    assert.ok(tabs.includes("recommended systems"), "phase help copy should say recommended systems");
    assert.ok(!page.includes("stages and tools"), "settings header should not say tools");
    assert.ok(!tabs.includes('Stat label="Tools"'), "workspace stats should not say Tools");
    assert.ok(!tabs.includes("recommended tools"), "phase help copy should not say recommended tools");
  });

  it("sanitises historical activity actions into product language", () => {
    const src = read(ACTIVITY_INBOX_PAGE);
    const feed = read(AGENCY_ACTIVITY_FEED);
    assert.ok(src.includes('.replace(/\\binstalled\\b/gi, "activated")'), "installed action copy should render as activated");
    assert.ok(src.includes('.replace(/\\bdisabled\\b/gi, "turned off")'), "disabled action copy should render as turned off");
    assert.ok(src.includes('.replace(/\\benabled\\b/gi, "turned on")'), "enabled action copy should render as turned on");
    assert.ok(src.includes('.replace(/[._-]/g, " ")'), "dotted internal activity actions should render as readable words");
    assert.ok(src.includes('.replace(/\\bWill install\\b/gi, "Will activate")'), "future install wording should render as activation wording");
    assert.ok(src.includes('"systems activated"'), "activity inbox should use systems language");
    assert.ok(src.includes('if (category === "plugin") return "systems"'), "plugin activity category should render as systems");
    assert.ok(feed.includes('"systems activated"'), "dashboard activity feed should use systems language");
    assert.ok(!src.includes('"tools activated"'), "activity inbox should not use tools language");
    assert.ok(!feed.includes('"tools activated"'), "dashboard activity feed should not use tools language");
  });

  it("keeps customer portal fallback copy account-ready, not internal", () => {
    const home = read(CUSTOMER_HOME);
    const subroute = read(CUSTOMER_SUBROUTE);
    const bookings = read(CUSTOMER_BOOKINGS);
    const orders = read(CUSTOMER_ORDERS);

    assert.ok(home.includes('<CustomerPortalView section="home"'), "customer home should render the full customer portal");
    assert.ok(subroute.includes("not available yet"), "customer subroutes should use available/not available language");
    assert.ok(subroute.includes("is being prepared for your account"), "active-but-unexposed systems should read as prepared");
    assert.ok(bookings.includes("scheduling is ready for your account"), "bookings fallback should be customer-friendly");
    assert.ok(orders.includes('requireRole("end-customer")'), "orders must require a customer session");
    assert.ok(orders.includes('getInstall({ agencyId: session.agencyId, clientId: session.clientId }, "ecommerce")'), "orders must use the client-scoped commerce install");
    assert.ok(orders.includes("order.endCustomerUserId === session.userId"), "orders must filter by the signed-in customer");
    assert.ok(orders.includes("order.customerEmail?.toLowerCase() === session.email.toLowerCase()"), "guest purchases should match the signed-in email");
    for (const [name, src] of [["customer home", home], ["customer subroute", subroute], ["bookings", bookings], ["orders", orders]] as const) {
      assert.ok(!src.includes("not enabled"), `${name} should not say not enabled`);
      assert.ok(!src.includes("enabled but"), `${name} should not say enabled but`);
      assert.ok(!src.includes("exposes the"), `${name} should not use exposed-surface language`);
      assert.ok(!src.includes("portal tools"), `${name} should not say portal tools`);
    }
  });

  it("exposes customer Orders, Bookings, and admin receipts from visible controls", () => {
    const chrome = read(CUSTOMER_CHROME);
    assert.ok(chrome.includes('href: "/portal/customer/orders"'));
    assert.ok(chrome.includes('href: "/portal/customer/bookings"'));
    assert.ok(read(ORDER_DETAIL).includes("receiptHref"), "order toolbar should expose the receipt");
    assert.ok(read(ORDER_DETAIL_PAGE).includes("/receipt`"), "order detail should build the mounted receipt URL");
  });

  // --- P5: the duplicate Staff surface is retired -----------------------------
  //
  // Behavioural, not shape: these drive the real manifest, the real
  // `buildSidebar`, the real redirect map, and the real StaffPage component.

  it("the agency-hr plugin exposes no nav item labelled Staff", () => {
    // 1. The manifest itself no longer contributes a Staff row.
    const labels = agencyHrManifest.navItems.map(item => item.label);
    assert.ok(
      !labels.some(label => label.trim().toLocaleLowerCase() === "staff"),
      `agency-hr should contribute no "Staff" nav item, got: ${labels.join(", ")}`,
    );
    assert.ok(
      !agencyHrManifest.navItems.some(item => item.id === "agency-hr.staff"),
      "the agency-hr.staff nav item should be gone",
    );
    assert.ok(
      !agencyHrManifest.navItems.some(item => item.href === "/portal/agency/agency-hr" || item.href === "/portal/agency/agency-hr/staff"),
      "no agency-hr nav item should point at the retired staff paths",
    );

    // 2. The pages that have no core equivalent survive — this must retire one
    //    surface, not gut the plugin.
    for (const id of ["agency-hr.departments", "agency-hr.leave", "agency-hr.employees", "agency-hr.roles", "agency-hr.settings"]) {
      assert.ok(agencyHrManifest.navItems.some(item => item.id === id), `${id} should still be in the agency-hr manifest`);
    }
    // 3. And the plugin is still installed/intact: the permission model that
    //    effectiveRole.ts and sopsAccess.ts import lives here.
    assert.equal(agencyHrManifest.id, "agency-hr");
    assert.ok(agencyHrManifest.pages.some(page => page.path === "departments"), "agency-hr should still mount its Departments page");

    // 4. End state: assembling the real sidebar with agency-hr installed AND
    //    enabled yields exactly one item labelled "Staff", and it is the core
    //    /portal/agency/people row.
    const panels = buildSidebar({
      role: "agency-owner",
      scope: "agency",
      installedPlugins: [agencyHrInstall()],
    });
    const allItems = panels.flatMap(panel => panel.items);
    const staffItems = allItems.filter(item => item.label.trim().toLocaleLowerCase() === "staff");
    assert.equal(staffItems.length, 1, `expected exactly one Staff sidebar item, got ${staffItems.map(i => `${i.id}→${i.href}`).join(", ")}`);
    assert.equal(staffItems[0].href, CANONICAL_STAFF_HREF);
    assert.ok(
      allItems.every(item => !item.href.startsWith("/portal/agency/agency-hr")),
      "no sidebar row should point into the agency-hr workspace",
    );

    // 5. Because the AquaOasis agency override in sidebarLayout.ts filters the
    //    agency sidebar down to a fixed list of core ids, agency-hr contributes
    //    no sidebar row at all — so its surviving pages need an explicit entry
    //    point or they are orphaned. Tools carries it.
    const tools = read(TOOLS_PAGE);
    assert.ok(
      tools.includes('href: "/portal/agency/agency-hr/departments"'),
      "Tools must keep an entry point into the surviving agency-hr pages, or Departments/Leave/Employees/Roles/Settings become unreachable",
    );
  });

  it("/portal/agency/agency-hr and /portal/agency/agency-hr/staff both redirect to /portal/agency/people", async () => {
    // Layer 1 — the catch-all's redirect map, executed. The page module itself
    // pulls next/link and client components and cannot be imported here, so the
    // decision it delegates to is imported and driven directly.
    assert.equal(retiredStaffRedirect(["agency-hr"]), "/portal/agency/people");
    assert.equal(retiredStaffRedirect(["agency-hr", "staff"]), "/portal/agency/people");
    // …and the query string survives, including repeated keys. A redirect that
    // drops ?dept=… silently discards the operator's filter.
    assert.equal(
      retiredStaffRedirect(["agency-hr"], { dept: "design", status: ["active", "leave"] }),
      "/portal/agency/people?dept=design&status=active&status=leave",
    );
    assert.equal(
      retiredStaffRedirect(["agency-hr", "staff"], { q: "sam smith" }),
      "/portal/agency/people?q=sam+smith",
    );
    assert.equal(withQuery("/x", { a: undefined }), "/x", "absent params should not produce a bare ?");
    // Everything else falls through untouched — the surviving plugin pages must
    // not be swallowed by the retirement.
    for (const rest of [["agency-hr", "departments"], ["agency-hr", "leave"], ["agency-hr", "employees"], ["agency-hr", "roles"], ["agency-hr", "settings"], ["agency-hr", "staff", "extra"], ["agency-finance"], ["email-sender"]]) {
      assert.equal(retiredStaffRedirect(rest), null, `/${rest.join("/")} should not be redirected`);
    }

    // …and the catch-all actually performs that redirect, before it resolves a
    // plugin page.
    const catchAll = read(CATCHALL);
    assert.ok(catchAll.includes("retiredStaffRedirect(rest, sp)"), "catch-all should consult the retirement map with the live segments and query");
    assert.ok(catchAll.includes("if (retiredStaff) redirect(retiredStaff)"), "catch-all should redirect when the retirement map matches");
    assert.ok(
      catchAll.indexOf("retiredStaffRedirect(rest, sp)") < catchAll.indexOf("resolveAgencyPluginPage({"),
      "the retirement redirect must run before plugin page resolution",
    );

    // Layer 2 — the plugin page itself, executed. Even reached directly it
    // redirects, and it too keeps the query string.
    const { default: StaffPage } = await import("../src/built-ins/modules/agency-hr/src/pages/StaffPage");
    assert.equal(
      await redirectTargetOf(() => StaffPage({ agencyId: "ag_1", searchParams: {} } as never)),
      "/portal/agency/people",
    );
    assert.equal(
      await redirectTargetOf(() => StaffPage({ agencyId: "ag_1", searchParams: { dept: "design", status: ["active", "leave"] } } as never)),
      "/portal/agency/people?dept=design&status=active&status=leave",
    );
    // Both retired manifest paths resolve to that same component.
    const staffPaths = agencyHrManifest.pages.filter(page => page.path === "" || page.path === "staff");
    assert.equal(staffPaths.length, 2, "both retired paths should still resolve (redirect) rather than 404");
    for (const page of staffPaths) {
      const mod = await page.component();
      assert.equal(
        await redirectTargetOf(() => (mod.default as (props: never) => Promise<unknown>)({ agencyId: "ag_1", searchParams: {} } as never)),
        "/portal/agency/people",
      );
    }
  });
});
