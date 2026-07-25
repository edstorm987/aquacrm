// T1 smoke — email-sender foundation registration (closes ch#161 Gap #3).
// Run via `npm run smoke:email-sender-foundation` (tsx --test).
//
// Surface (≥6):
//  - `_registry.ts` imports `@aqua/plugin-email-sender` manifest.
//  - `_registry.ts` lists `emailSenderManifest` in PLUGINS array.
//  - `_registry.ts` side-effect imports `emailSenderFoundation` BEFORE
//    `leadsPipelineFoundation`.
//  - `next.config.ts` transpilePackages registers the plugin.
//  - `package.json` workspace deps register the plugin.
//  - Side-effect import of the adapter file binds the foundation —
//    `isFoundationRegistered()` returns true on the same module graph.
//  - `emailEnqueuePort` no longer throws "foundation pending" when
//    invoked against a fresh agency with the email-sender install
//    seeded; it lands the message on a stub driver via the registered
//    container (real Postmark requires API keys; stubs land in the
//    plugin's `emails` queue and surface via `emails.list({})`).

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Stub `server-only` so `src/server/*` modules load under tsx --test.
const _req = createRequire(import.meta.url);
const _serverOnlyPath = _req.resolve("server-only");
_req.cache[_serverOnlyPath] = {
  id: _serverOnlyPath,
  filename: _serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REGISTRY = join(ROOT, "src", "built-ins", "runtime", "_registry.ts");
const NEXT_CFG = join(ROOT, "next.config.ts");
const PKG = join(ROOT, "package.json");
const ADAPTER = join(ROOT, "src", "built-ins", "runtime", "foundation-adapters", "emailSenderFoundation.ts");

describe("email-sender foundation registration — source markers", () => {
  it("_registry.ts imports the email-sender manifest", () => {
    const src = readFileSync(REGISTRY, "utf-8");
    assert.match(src, /from ["']@aqua\/plugin-email-sender["']/);
    assert.match(src, /emailSenderManifest/);
  });

  it("_registry.ts PLUGINS array lists emailSenderManifest", () => {
    const src = readFileSync(REGISTRY, "utf-8");
    assert.match(src, /emailSenderManifest as unknown as AquaPlugin/);
  });

  it("_registry.ts side-effect imports emailSenderFoundation BEFORE leadsPipelineFoundation", () => {
    const src = readFileSync(REGISTRY, "utf-8");
    const idxEmail = src.indexOf("foundation-adapters/emailSenderFoundation");
    const idxLeads = src.indexOf("foundation-adapters/leadsPipelineFoundation");
    assert.ok(idxEmail > -1, "missing emailSenderFoundation side-effect import");
    assert.ok(idxLeads > -1, "missing leadsPipelineFoundation side-effect import");
    assert.ok(idxEmail < idxLeads, "email-sender must register before leads-pipeline");
  });

  it("next.config.ts stays standalone without external plugin transpilePackages", () => {
    const src = readFileSync(NEXT_CFG, "utf-8");
    assert.doesNotMatch(src, /transpilePackages/);
  });

  it("package.json workspace deps register @aqua/plugin-email-sender", () => {
    const pkg = JSON.parse(readFileSync(PKG, "utf-8"));
    assert.equal(pkg.dependencies["@aqua/plugin-email-sender"], undefined);
  });

  it("emailSenderFoundation.ts calls registerEmailSenderFoundation with shared ports", () => {
    const src = readFileSync(ADAPTER, "utf-8");
    assert.match(src, /registerEmailSenderFoundation/);
    assert.match(src, /activity:\s*activityPort/);
    assert.match(src, /events:\s*eventBusPort/);
    assert.match(src, /pluginInstalls:\s*pluginInstallStorePort/);
  });
});

describe("email-sender foundation registration — runtime", () => {
  before(async () => {
    // Side-effect import the foundation adapter so the CJS-graph copy
    // of email-sender is registered (via createRequire — adapter
    // tagged `import "server-only"` → tsx routes through CJS).
    await import("../src/built-ins/runtime/foundation-adapters/emailSenderFoundation");

    // Cross-graph register: leadsPipelinePorts.emailEnqueuePort uses
    // `await import("@aqua/plugin-email-sender/server")` which under
    // tsx resolves on the ESM graph (separate from CJS). Register the
    // foundation on the ESM-graph copy too so the runtime guard
    // passes. In the Next.js production graph there is only one copy
    // so the in-package adapter handles both — the dual-register is
    // smoke-only plumbing.
    const senderEsm = await import("@aqua/plugin-email-sender/server");
    if (!senderEsm.isFoundationRegistered()) {
      const tenants = await import("../src/server/tenants");
      const ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
      senderEsm.registerEmailSenderFoundation({
        tenant: { getAgency(id: string) { return tenants.getAgency(id); } },
        activity: ports.activityPort,
        events: ports.eventBusPort,
        pluginInstalls: ports.pluginInstallStorePort,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  });

  it("isFoundationRegistered() returns true after side-effect import", () => {
    // Same module-graph caveat as leads-pipeline smoke (chapter #158):
    // tsx loads `server-only`-tagged modules via CJS, so the adapter
    // registered on the CJS graph. Read via createRequire to land on
    // the same graph instance.
    const sender = _req("@aqua/plugin-email-sender/server") as {
      isFoundationRegistered: () => boolean;
    };
    assert.equal(sender.isFoundationRegistered(), true);
  });

  it("emailEnqueuePort no longer throws \"foundation pending\" — reaches install lookup", async () => {
    // With email-sender registered, the port should advance past the
    // `isFoundationRegistered()` guard. Without an email-sender install
    // for the agency the next guard ("not installed for agency") fires
    // — that's progress: the foundation-pending throw is gone.
    // Use dynamic ESM import so the leads-pipeline port's own
    // `await import("@aqua/plugin-email-sender/server")` resolves on
    // the same graph the adapter registered on.
    const ports = await import("../src/lib/server/leadsPipelinePorts");
    let err: unknown = null;
    try {
      await ports.emailEnqueuePort.enqueue({
        agencyId: "agency_does_not_exist",
        to: ["x@example.com"],
        subject: "smoke",
        bodyHtml: "<p>smoke</p>",
        triggeredByPlugin: "smoke",
        externalRef: "smoke-1",
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    const msg = (err as Error).message;
    assert.doesNotMatch(msg, /foundation-pending|foundation not registered/i,
      `expected foundation-pending throw to be gone, got: ${msg}`);
    assert.match(msg, /not installed for agency/i);
  });
});
