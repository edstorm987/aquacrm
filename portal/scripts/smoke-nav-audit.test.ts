// Standalone portal nav smoke.
//
// This guards the simplified AquaOasis-Web operating system: one obvious client
// workspace, one merged journey route, one phases/settings route, and no old
// fulfilment client-list UI leaking back into the sidebar.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SIDEBAR_LAYOUT = join(ROOT, "src", "lib", "chrome", "sidebarLayout.ts");
const SIDEBAR = join(ROOT, "src", "components", "chrome", "Sidebar.tsx");
const PROFILE = join(ROOT, "src", "components", "chrome", "ProfileMenu.tsx");
const ARCHIVED_MULTI_AGENCY = join(ROOT, "src", "archive", "multi-agency");
const CATCHALL = join(ROOT, "src", "app", "portal", "agency", "[...rest]", "page.tsx");
const AGENCY_HOME = join(ROOT, "src", "app", "portal", "agency", "page.tsx");
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
const TENANTS = join(ROOT, "src", "server", "tenants.ts");
const FINANCE_MANIFEST = join(ROOT, "src", "built-ins", "modules", "agency-finance", "index.ts");
const LEADS_MANIFEST = join(ROOT, "src", "built-ins", "modules", "leads-pipeline", "index.ts");
const FOUNDER_SEED = join(ROOT, "src", "lib", "server", "founderSeed.ts");

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
      ["fulfilment", "/portal/agency/fulfilment"],
      ["pipelines", "/portal/clients?view=journey"],
      ["marketing", "/portal/agency/marketing"],
      ["actions", "/portal/agency/actions"],
      ["calendar", "/portal/agency/calendar"],
      ["notepad", "/portal/agency/notepad"],
      ["development", "/portal/agency/development"],
      ["inbox", "/portal/agency/inbox"],
      ["finance", "/portal/agency/agency-finance"],
      ["sop-library", "/portal/agency/sop-library"],
    ];

    for (const [id, href] of expected) {
      assert.ok(block.includes(`id: "${id}"`), `${id} main nav item missing`);
      assert.ok(block.includes(`href: "${href}"`), `${href} main nav href missing`);
    }
    assert.ok(!block.includes('label: "Clients & contacts"'), "clients and contacts should live inside Journey");
    assert.ok(!block.includes('id: "contacts"'), "contacts should live inside the clients hub");
    assert.ok(!block.includes('id: "sales"'), "sales should live inside Pipelines");
    assert.ok(!block.includes('id: "products"'), "products should live inside Company");
    assert.ok(!block.includes('id: "fulfillment", label: "Fulfilment"'), "duplicate Fulfilment main nav item should stay removed");
    assert.ok(read(PEOPLE_HUB).includes('label="Clients"'), "clients should remain available inside Journey");
    assert.ok(read(PEOPLE_HUB).includes('label="Contacts"'), "contacts should remain available inside Journey");
    assert.ok(read(CLIENTS_PAGE).includes(': "journey";'), "Journey should be the default people-hub view");

    const priorityOrder = ["home", "actions", "calendar", "notepad", "inbox", "fulfilment", "pipelines", "development", "marketing", "finance", "sop-library"];
    const canonical = read(SIDEBAR_LAYOUT).match(/const canonicalMainIds = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
    const positions = priorityOrder.map(id => canonical.indexOf(`"${id}"`));
    assert.ok(positions.every(position => position >= 0), "priority navigation order is incomplete");
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, "agency navigation should remain ordered by daily priority");
  });

  it("allows only the canonical agency main ids through the AquaOasis-Web override", () => {
    const src = read(SIDEBAR_LAYOUT);
    const canonical = src.match(/const canonicalMainIds = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
    for (const id of ["home", "company", "fulfilment", "pipelines", "marketing", "actions", "calendar", "notepad", "development", "inbox", "finance", "sop-library"]) {
      assert.ok(canonical.includes(`"${id}"`), `${id} missing from canonical allow-list`);
    }
    assert.ok(!canonical.includes('"clients"'), "clients should be merged into the Journey sidebar item");
    assert.ok(!canonical.includes('"performance"'), "performance should live inside Development rather than the main sidebar");
    assert.ok(!canonical.includes('"products"'), "products should live inside Company rather than the main sidebar");
    assert.ok(!canonical.includes('"sops"'), "the duplicate systems dashboard should not be a main nav item");
    assert.ok(!canonical.includes('"contacts"'), "contacts should not be a standalone main nav id");
    assert.ok(!canonical.includes('"sales"'), "sales should not be a standalone main nav id");
    assert.ok(!canonical.includes('"fulfillment"'), "legacy fulfillment id should not be allowed into main nav");
    assert.ok(!canonical.includes('"automations"'), "internal automations should live inside Marketing");
  });

  it("keeps performance inside the Development workspace", () => {
    const nav = read(DEVELOPMENT_NAV);
    const page = read(DEVELOPMENT_PERFORMANCE);
    assert.ok(nav.includes('/portal/agency/development/performance'));
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
    assert.ok(clientHome.includes("<FulfilmentPortalPreview"), "customer portal preview should remain mounted in fulfilment");
  });

  it("presents client capabilities as built-in systems", () => {
    const clientHome = read(CLIENT_HOME);
    const clientTabs = read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "_tabs.ts"));
    const clientLayout = read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "layout.tsx"));
    const picker = read(join(ROOT, "src", "app", "portal", "clients", "[clientId]", "_ToolsPicker.tsx"));

    assert.ok(clientTabs.includes('id: "systems"'), "client tab id should be systems");
    assert.ok(clientTabs.includes('label: "Systems"'), "client tab label should be Systems");
    assert.ok(clientLayout.includes('label: "Monitoring"'), "client sidebar should show Monitoring");
    assert.ok(clientLayout.includes("tab=systems"), "client sidebar should use systems tab");
    assert.ok(clientHome.includes('rawTabInput === "tools" ? "systems"'), "legacy tools tab links should resolve to systems");
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
    assert.ok(orders.includes("ordering is ready for your account"), "orders fallback should be customer-friendly");
    for (const [name, src] of [["customer home", home], ["customer subroute", subroute], ["bookings", bookings], ["orders", orders]] as const) {
      assert.ok(!src.includes("not enabled"), `${name} should not say not enabled`);
      assert.ok(!src.includes("enabled but"), `${name} should not say enabled but`);
      assert.ok(!src.includes("exposes the"), `${name} should not use exposed-surface language`);
      assert.ok(!src.includes("portal tools"), `${name} should not say portal tools`);
    }
  });
});
