// Standalone Milesymedia Portal feature walkthrough.
//
// This repo is now the separated portal app. The public Milesymedia website,
// old marketing pages, and old demo/business-os surfaces are intentionally
// outside this smoke.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");
const API = join(APP, "api");
const PORTAL = join(APP, "portal");
const BUILT_INS = join(SRC, "built-ins");
const SERVER = join(SRC, "server");
const LIB_SERVER = join(SRC, "lib", "server");

function has(p: string): boolean {
  return existsSync(p);
}

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("Unified AquaCRM shell", () => {
  it("ships the public front door and portal entry points together", () => {
    assert.ok(has(join(APP, "page.tsx")));
    assert.ok(has(join(APP, "login", "page.tsx")));
    assert.ok(!has(join(APP, "(demo)", "dev", "pov", "page.tsx")), "demo POV should stay out of the real portal app");
    assert.ok(!has(join(APP, "demo")), "old public /demo surface should stay out of the portal app");
    assert.ok(!has(join(APP, "business-os")), "old public business-os surface should stay out of the portal app");
    assert.ok(!has(join(APP, "resources")), "old public resources surface should stay out of the portal app");
  });

  it("protects portal routes and exposes health checks", () => {
    assert.ok(has(join(SRC, "proxy.ts")));
    assert.ok(has(join(APP, "healthz", "route.ts")));
    assert.ok(has(join(APP, "healthz", "full", "route.ts")));
    assert.ok(has(join(PORTAL, "layout.tsx")));
  });
});

describe("Auth and account", () => {
  it("has current auth and profile routes without a dev bypass", () => {
    for (const path of [
      join(API, "auth", "login", "route.ts"),
      join(API, "auth", "logout", "route.ts"),
      join(API, "auth", "me", "route.ts"),
      join(API, "auth", "magic", "request", "route.ts"),
      join(API, "auth", "magic", "verify", "route.ts"),
      join(API, "auth", "password", "request-reset", "route.ts"),
      join(API, "auth", "password", "reset", "route.ts"),
    ]) {
      assert.ok(has(path), `${path} missing`);
    }
    assert.ok(!has(join(API, "dev", "login-as", "route.ts")), "dev login bypass should stay out of the real portal app");
  });

  it("account pages expose skip-link landing landmarks", () => {
    for (const path of [
      join(PORTAL, "account", "page.tsx"),
      join(PORTAL, "account", "permissions", "page.tsx"),
    ]) {
      assert.ok(has(path), `${path} missing`);
      assert.ok(read(path).includes('id="main-content"'), `${path} missing main-content`);
    }
    const preferences = read(join(PORTAL, "account", "preferences", "page.tsx"));
    assert.ok(preferences.includes('redirect("/portal/agency/settings#notifications")'), "agency preferences compatibility route should open Settings");
    assert.ok(preferences.includes('redirect("/portal/account")'), "non-agency preferences compatibility route should return to Account");
  });
});

describe("Agency OS navigation", () => {
  it("keeps the simplified agency routes", () => {
    for (const path of [
      join(PORTAL, "agency", "page.tsx"),
      join(PORTAL, "clients", "page.tsx"),
      join(PORTAL, "agency", "leads-pipeline", "contacts", "_ContactsWorkspace.tsx"),
      join(PORTAL, "agency", "pipelines", "[slug]", "page.tsx"),
      join(PORTAL, "agency", "activity-inbox", "page.tsx"),
      join(PORTAL, "agency", "performance", "page.tsx"),
      join(PORTAL, "agency", "development", "performance", "page.tsx"),
      join(PORTAL, "agency", "products", "page.tsx"),
      join(PORTAL, "agency", "sops", "page.tsx"),
      join(PORTAL, "agency", "settings", "page.tsx"),
    ]) {
      assert.ok(has(path), `${path} missing`);
    }
  });

  it("uses one canonical create-client surface", () => {
    const peopleHub = read(join(PORTAL, "clients", "_PeopleHub.tsx"));
    const modal = read(join(PORTAL, "agency", "_NewClientButton.tsx"));
    const createRoute = read(join(API, "portal", "fulfillment", "clients", "route.ts"));

    assert.equal((peopleHub.match(/<NewClientButton/g) ?? []).length, 1);
    assert.ok(modal.includes("What are we helping with?"));
    assert.ok(modal.includes('helpingWith: ""'));
    assert.ok(modal.includes("serviceBrief: helpingWith || undefined"));
    assert.ok(modal.includes("Client-facing brand"));
    assert.ok(modal.includes("Create a client portal now"));
    assert.ok(modal.includes("More setup"));
    assert.ok(modal.includes("set up their portal later from the client record"));
    assert.ok(!modal.includes("PORTAL_PRODUCT_CATALOG"));
    assert.ok(!modal.includes("selectedProducts.map"));
    assert.ok(!modal.includes("lockInPaid"));
    assert.ok(modal.includes("starterPortal:"));
    assert.ok(createRoute.includes("const createPortal = body.createPortal === true"));
    assert.ok(createRoute.includes("if (createPortal)"));
    assert.ok(createRoute.includes("setupClientStarterPortal"));
    assert.ok(!has(join(API, "tenants", "apply-incubator-variant", "route.ts")));
  });

  it("keeps legacy fulfilment detours redirected away from old duplicate UI", () => {
    const catchAll = read(join(PORTAL, "agency", "[...rest]", "page.tsx"));
    const legacyList = read(join(BUILT_INS, "modules", "fulfillment", "src", "components", "ClientList.tsx"));

    assert.ok(catchAll.includes('redirect("/portal/agency/fulfilment?view=clients")'));
    assert.ok(catchAll.includes('redirect("/portal/agency/fulfilment")'));
    assert.ok(!legacyList.includes("NewClientModal"));
    assert.ok(legacyList.includes('href="/portal/clients"'));
  });
});

describe("Client lifecycle and portal generation", () => {
  it("has client workspace tabs and systems language", () => {
    const clientPage = read(join(PORTAL, "clients", "[clientId]", "page.tsx"));
    const tabs = read(join(PORTAL, "clients", "[clientId]", "_tabs.ts"));
    const workspaceTabs = read(join(SRC, "lib", "clients", "clientWorkspace.ts"));
    const picker = read(join(PORTAL, "clients", "[clientId]", "_ToolsPicker.tsx"));

    assert.ok(tabs.includes("CLIENT_WORKSPACE_TABS"));
    assert.ok(workspaceTabs.includes('id: "systems"'));
    assert.ok(workspaceTabs.includes('label: "Systems"'));
    assert.ok(workspaceTabs.includes('tools: "systems"'));
    assert.ok(clientPage.includes("resolveClientWorkspaceTab(rawTabInput)"));
    assert.ok(clientPage.includes("+ Add system"));
    assert.ok(picker.includes("Typical live-stage system set"));
    assert.ok(!clientPage.includes(">Capabilities<"));
  });

  it("supports pause/resume and archive/reactivate lifecycle controls", () => {
    assert.ok(has(join(API, "tenants", "client-status", "route.ts")));
    assert.ok(has(join(PORTAL, "clients", "[clientId]", "settings", "page.tsx")));
    assert.ok(read(join(SERVER, "tenants.ts")).includes("includeArchived"));
    const actions = read(join(PORTAL, "clients", "[clientId]", "settings", "_ClientStatusActions.tsx"));
    assert.ok(actions.includes("Pause client"));
    assert.ok(actions.includes("Resume client"));
  });

  it("opens CSV import as an upload then field-mapping flow", () => {
    const board = read(join(PORTAL, "agency", "pipelines", "[slug]", "_LeadsPipelineWorkspace.tsx"));
    const contacts = read(join(PORTAL, "agency", "leads-pipeline", "contacts", "_ContactsWorkspace.tsx"));
    const contactsPage = read(join(BUILT_INS, "modules", "leads-pipeline", "src", "pages", "ContactsPage.tsx"));

    assert.ok(board.includes("?import=1#upload"), "CSV shortcut should open the importer directly");
    assert.ok(contactsPage.includes('props.searchParams.import === "1"'), "contacts page should pass import mode through");
    assert.ok(contacts.includes("Step 1"));
    assert.ok(contacts.includes("Upload spreadsheet"));
    assert.ok(contacts.includes("Step 2"));
    assert.ok(contacts.includes("Align contact fields"));
    assert.ok(contacts.includes("setColumnMapping"));
    assert.ok(contacts.includes("Do not import"));
    assert.ok(contacts.includes("Approve mapping and import"));
  });

  it("can create and review a customer portal when the client needs one", () => {
    const createRoute = read(join(API, "portal", "fulfillment", "clients", "route.ts"));
    const previewPage = join(APP, "client-preview", "[clientId]", "page.tsx");
    const fulfilmentEditor = read(join(PORTAL, "clients", "[clientId]", "_FulfilmentPortalPreview.tsx"));

    assert.ok(createRoute.includes("customerPortalProvisioningMetadata"));
    assert.ok(createRoute.includes("if (createPortal)"));
    assert.ok(has(previewPage), "agency-only customer preview route missing");
    assert.ok(fulfilmentEditor.includes("/client-preview/${clientId}"));
    assert.ok(fulfilmentEditor.includes("No client portal yet"));
    assert.ok(fulfilmentEditor.includes("Create"));
    assert.ok(fulfilmentEditor.includes("Review"));
    assert.ok(fulfilmentEditor.includes("Invite"));
  });
});

describe("Sales, pipelines, finance, inbox, and systems", () => {
  it("has the working data routes and adapters these pages depend on", () => {
    for (const path of [
      join(API, "portal", "activity-inbox", "list", "route.ts"),
      join(API, "portal", "phases", "apply", "route.ts"),
      join(API, "portal", "phases", "upsert", "route.ts"),
      join(API, "portal", "phases", "delete", "route.ts"),
      join(API, "tenants", "client-comms", "route.ts"),
      join(API, "tenants", "client-files", "route.ts"),
      join(API, "tenants", "client-requests", "route.ts"),
      join(LIB_SERVER, "leadsPipelinePorts.ts"),
    ]) {
      assert.ok(has(path), `${path} missing`);
    }
  });

  it("loads built-in modules from the current built-ins tree", () => {
    assert.ok(has(join(BUILT_INS, "runtime", "_registry.ts")));
    for (const id of [
      "fulfillment",
      "website-editor",
      "agency-finance",
      "agency-marketing",
      "client-crm",
      "leads-pipeline",
    ]) {
      assert.ok(has(join(BUILT_INS, "modules", id)), `${id} built-in missing`);
    }
  });

  it("keeps one dashboard and one dedicated SOP library", () => {
    const systems = read(join(PORTAL, "agency", "sops", "page.tsx"));
    const dashboard = read(join(PORTAL, "agency", "page.tsx"));
    const sopLibrary = read(join(PORTAL, "agency", "sop-library", "page.tsx"));

    assert.ok(systems.includes('redirect("/portal/agency/sop-library")'));
    assert.ok(dashboard.includes("DashboardCommandCenter"));
    assert.ok(dashboard.includes("dashboardPlanningSnapshot"));
    assert.ok(!dashboard.includes('title="Business areas"'));
    assert.ok(!dashboard.includes('title="Work boards"'));
    assert.ok(sopLibrary.includes("SopLibrary"));
  });

  it("gives the internal team one cross-brand marketing workspace", () => {
    const page = read(join(PORTAL, "agency", "marketing", "page.tsx"));
    const workspace = read(join(PORTAL, "agency", "marketing", "_MarketingChannelsWorkspace.tsx"));
    const routes = read(join(BUILT_INS, "modules", "agency-marketing", "src", "api", "routes.ts"));

    // The five channel tabs were consolidated into one "Channels" view
    // (2026-08-19, Ed's call) — they were always the same component with a
    // different `kind`. The contract is unchanged in substance: every channel is
    // still reachable and individually addressable, now via an in-view switcher
    // (`CHANNEL_TABS`) rather than its own top-level tab. Old `?view=<channel>`
    // links still resolve — pinned in smoke-marketing-intelligence.
    for (const label of ["Campaigns", "Channels", "Lead sources", "Automations"]) {
      assert.ok(page.includes(`>${label}<`), `${label} marketing view missing`);
    }
    for (const channel of ["Social media", "Websites", "Google Ads", "Google Business Profile", "Reputation"]) {
      assert.ok(page.includes(`label: "${channel}"`), `${channel} channel missing from the Channels switcher`);
    }
    assert.ok(page.includes(">Funnels &amp; booking<"), "Funnels and booking marketing view missing");
    assert.ok(page.includes("Internal workspace"));
    assert.ok(page.includes("Marketing across the business"));
    assert.ok(page.includes("Brand scope"));
    assert.ok(page.includes("listTradingCompanies"));
    assert.ok(workspace.includes("BrandAssignment"));
    assert.ok(workspace.includes("Add social profile"));
    assert.ok(workspace.includes("Add website property"));
    assert.ok(workspace.includes("Add funnel"));
    assert.ok(workspace.includes("Add Google Ads campaign"));
    assert.ok(workspace.includes("budgetCents"));
    assert.ok(workspace.includes("spendCents"));
    assert.ok(workspace.includes("conversions"));
    assert.ok(routes.includes('path: "assets"'));
  });
});
