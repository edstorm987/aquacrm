// Standalone sales pipeline integration smoke.
//
// The old health-check/public-funnel/BOS chain belongs to the separated
// website. This portal owns the operator journey: lead/contact data becomes
// a client workspace and starter portal.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORTAL = join(ROOT, "src", "app", "portal");
const LEADS_HANDLERS = join(ROOT, "src", "built-ins", "modules", "leads-pipeline", "src", "api", "handlers.ts");
const CLIENT_JOURNEY = join(ROOT, "scripts", "smoke-client-journey.test.ts");
const CREATE_CLIENT_ROUTE = join(ROOT, "src", "app", "api", "portal", "fulfillment", "clients", "route.ts");
const PORTAL_SETUP = join(ROOT, "src", "server", "clientPortalSetup.ts");
const MAGIC_VERIFY = join(ROOT, "src", "app", "api", "auth", "magic", "verify", "route.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Sales pipeline → client portal integration", () => {
  it("ships the current sales/contact workspace", () => {
    assert.ok(existsSync(join(PORTAL, "agency", "leads-pipeline", "contacts", "_ContactsWorkspace.tsx")));
    assert.ok(existsSync(join(PORTAL, "agency", "pipelines", "[slug]", "_LeadsPipelineWorkspace.tsx")));
    assert.ok(existsSync(join(PORTAL, "agency", "pipelines", "[slug]", "page.tsx")));
  });

  it("lead and contact conversion create starter client portals transactionally", () => {
    const src = read(LEADS_HANDLERS);
    for (const fn of ["convertLeadToClientHandler", "convertContactToClientHandler"]) {
      const block = src.match(new RegExp(`export async function ${fn}[\\s\\S]*?(?=export async function|$)`))?.[0] ?? "";
      assert.ok(block.includes("structuredClone(getState())"), `${fn} should snapshot state`);
      assert.ok(block.includes("setupClientStarterPortal"), `${fn} should create starter portal`);
      assert.ok(block.includes("restorePortalState(beforeConvert)"), `${fn} should roll back on portal failure`);
    }
  });

  it("canonical create-client route owns portal setup", () => {
    const src = read(CREATE_CLIENT_ROUTE);
    assert.ok(src.includes("setupClientStarterPortal"));
    assert.ok(src.includes("starterPortal"));
    assert.ok(src.includes("client portal setup failed"));
  });

  it("provisions the core portal without a website-editor install or broad password account", () => {
    const setup = read(PORTAL_SETUP);
    const handlers = read(LEADS_HANDLERS);
    const magicVerify = read(MAGIC_VERIFY);

    assert.ok(setup.includes('portalProvisioningSource: "built-in"'));
    assert.ok(setup.includes('portalShellVersion: PORTAL_VERSION'));
    assert.ok(!setup.includes("installPlugin("), "customer portal must not install a website editor");
    assert.ok(!setup.includes("makePluginStorage"), "customer portal must not depend on plugin storage");
    assert.ok(handlers.includes("prepareCustomerPortalAccess"));
    assert.ok(!handlers.includes('role: "client-owner"'), "conversion must not create a broad client-owner account");
    assert.ok(magicVerify.includes('role: "end-customer"'), "single-use invitation should create scoped customer access");
  });

  it("full customer journey smoke covers meetings, invoice, portal data, feedback, and support", () => {
    const src = read(CLIENT_JOURNEY);
    for (const marker of [
      "meeting",
      "invoice",
      "portal",
      "feedback",
      "support",
      "cancel",
      "analytics",
    ]) {
      assert.ok(src.toLowerCase().includes(marker), `journey smoke missing ${marker}`);
    }
  });
});
