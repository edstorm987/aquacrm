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

    // The transaction model changed, and to something STRONGER — but the two
    // handlers did not land on the SAME stronger thing, so pin each to what it
    // actually does rather than forcing one shape onto both.
    //
    // Both used to snapshot with `structuredClone(getState())` and undo with
    // `restorePortalState(beforeConvert)`. That cannot survive the process dying
    // mid-convert and it races a second worker doing the same conversion.
    //
    //   • LEAD    → a durable claim/lease coordinator: claimed before any write,
    //               a conflicting caller told to retry after the lease, a
    //               finished conversion REPLAYED rather than run twice, and a
    //               failure recorded durably so the operation stays resumable.
    //   • CONTACT → a fingerprinted idempotent lifecycle operation: the same
    //               request shape resolves to the same `operationId`, so a retry
    //               converges instead of creating a second client.
    //
    // (Two models for one class of operation is worth knowing about; neither is
    // the old snapshot, and both are safe under a crash, which is what matters
    // here.)
    const leadBlock = src.match(/export async function convertLeadToClientHandler[\s\S]*?(?=export async function|$)/)?.[0] ?? "";
    assert.ok(leadBlock.length > 0, "convertLeadToClientHandler is gone");
    assert.ok(/acquireLeadConversion\(coordinator, operation\)/.test(leadBlock),
      "the lead conversion no longer claims before writing anything");
    assert.ok(leadBlock.includes("setupClientStarterPortal"), "the lead conversion stopped creating a starter portal");
    assert.ok(/claim\.state === "conflict"/.test(leadBlock),
      "a second worker mid-conversion is no longer refused");
    assert.ok(/claim\.state === "complete"/.test(leadBlock),
      "a finished conversion is no longer replayed — it would convert twice");
    assert.ok(/failLeadConversion\(coordinator, operation/.test(leadBlock),
      "a failed lead conversion no longer records itself durably");

    const contactBlock = src.match(/export async function convertContactToClientHandler[\s\S]*?(?=export async function|$)/)?.[0] ?? "";
    assert.ok(contactBlock.length > 0, "convertContactToClientHandler is gone");
    assert.ok(/ensureClientLifecycleOperation\(\{/.test(contactBlock),
      "the contact conversion no longer runs inside an idempotent lifecycle operation");
    assert.ok(/operationId: `contact-lifecycle:\$\{lifecycleFingerprint\}`/.test(contactBlock),
      "the contact operation id is no longer derived from the request fingerprint — a retry could convert twice");
    assert.ok(contactBlock.includes("setupClientStarterPortal"), "the contact conversion stopped creating a starter portal");
    assert.ok(/error: "client_lifecycle_incomplete"/.test(contactBlock),
      "a half-finished contact conversion no longer reports itself as incomplete");

    // …and the lead failure path flushes BEFORE it records, so a resumable
    // operation never points at side effects that were never persisted.
    const failure = src.match(/async function failLeadConversion[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(failure.includes("await flushPendingWrites()"),
      "the failure path stopped flushing partial side effects before recording itself");
    assert.ok(failure.indexOf("await flushPendingWrites()") < failure.indexOf("coordinator.fail"),
      "the failure is recorded before the partial writes are durable — a resume would race a stale snapshot");
  });

  it("canonical create-client route owns portal setup", () => {
    const src = read(CREATE_CLIENT_ROUTE);
    assert.ok(src.includes("setupClientStarterPortal"));
    assert.ok(src.includes("starterPortal"));
    // The failure is no longer a bare "client portal setup failed" string. It is
    // now a structured, resumable answer, which is what a caller left holding a
    // half-provisioned client actually needs: a machine-readable code, the id of
    // the client that WAS created, an explicit retryable flag, and a 503 rather
    // than a status that reads as "your request was wrong".
    assert.ok(src.includes('code: "client_portal_setup_incomplete"'),
      "the route stopped reporting an incomplete portal with a machine-readable code");
    assert.ok(src.includes("Client created, but customer portal setup is incomplete"),
      "the route stopped telling the caller the client itself was created");
    assert.ok(/client: \{ id: client\.id/.test(src),
      "the route stopped naming the created client — the caller cannot resume without it");
    assert.ok(/retryable: true,\s*\n\s*\},\s*\n\s*\{ status: 503 \}/.test(src),
      "an incomplete portal is no longer a retryable 503");
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
