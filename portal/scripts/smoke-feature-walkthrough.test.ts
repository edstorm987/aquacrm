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

describe("Unified Milesymedia shell", () => {
  it("ships the public front door and portal entry points together", () => {
    assert.ok(has(join(APP, "(website)", "page.tsx")));
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
      join(PORTAL, "account", "preferences", "page.tsx"),
      join(PORTAL, "account", "permissions", "page.tsx"),
    ]) {
      assert.ok(has(path), `${path} missing`);
      assert.ok(read(path).includes('id="main-content"'), `${path} missing main-content`);
    }
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
    assert.ok(modal.includes('product.portalRequirement === "required"'));
    assert.ok(modal.includes('product.portalRequirement === "none"'));
    assert.ok(modal.includes("Create a client portal now"));
    assert.ok(modal.includes("More setup"));
    assert.ok(modal.includes("PORTAL_PRODUCT_CATALOG"));
    assert.ok(modal.includes("productIds: string[]"));
    assert.ok(modal.includes("Choose one or more products or services."));
    assert.ok(modal.includes("agencyProductIds: selectedProducts.map"));
    assert.ok(modal.includes("clientProducts: selectedProducts.map"));
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

    assert.ok(catchAll.includes('redirect("/portal/clients")'));
    assert.ok(catchAll.includes('redirect("/portal/agency/pipelines/fulfilment")'));
    assert.ok(!legacyList.includes("NewClientModal"));
    assert.ok(legacyList.includes('href="/portal/clients"'));
  });
});

describe("Client lifecycle and portal generation", () => {
  it("has client workspace tabs and systems language", () => {
    const clientPage = read(join(PORTAL, "clients", "[clientId]", "page.tsx"));
    const tabs = read(join(PORTAL, "clients", "[clientId]", "_tabs.ts"));
    const picker = read(join(PORTAL, "clients", "[clientId]", "_ToolsPicker.tsx"));

    assert.ok(tabs.includes('id: "systems"'));
    assert.ok(tabs.includes('label: "Systems"'));
    assert.ok(clientPage.includes('rawTabInput === "tools" ? "systems"'));
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

    assert.ok(systems.includes('redirect("/portal/agency")'));
    assert.ok(dashboard.includes("One customer journey"));
    assert.ok(!dashboard.includes('title="Business areas"'));
    assert.ok(!dashboard.includes('title="Work boards"'));
    assert.ok(sopLibrary.includes("SopLibrary"));
  });

  it("gives Milesymedia one marketing workspace for campaigns and owned channels", () => {
    const page = read(join(PORTAL, "agency", "marketing", "page.tsx"));
    const workspace = read(join(PORTAL, "agency", "marketing", "_MarketingChannelsWorkspace.tsx"));
    const routes = read(join(BUILT_INS, "modules", "agency-marketing", "src", "api", "routes.ts"));

    for (const label of ["Campaigns", "Social media", "Website", "Funnels", "Google Ads", "Lead sources"]) {
      assert.ok(page.includes(`>${label}<`), `${label} marketing view missing`);
    }
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
