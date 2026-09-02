// Settings truthfulness (issue #44): Ecommerce's `lowStockThreshold` used to be a
// declared setting that nothing read — the inventory adjustment handler
// hardcoded 5 — while two other declarations promised behaviour that did not
// exist at all (Finance's never-enforced expense approval threshold and
// Ecommerce's never-read Stripe publishable key). This suite pins the repaired
// state: the setting is the inventory default, a malformed saved value cannot
// poison it, and the two dead promises are gone from their manifests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { PluginCtx } from "../src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes";
import {
  defaultLowStockThreshold,
  setInventoryHandler,
} from "../src/built-ins/modules/ecommerce/src/api/handlers";
import {
  buildEcommerceContainer,
  clearEcommerceFoundation,
  registerEcommerceFoundation,
} from "../src/built-ins/modules/ecommerce/src/server/index";
import type { StoragePort } from "../src/built-ins/modules/ecommerce/src/server/ports";
import { UNWIRED_SETTINGS } from "../src/lib/plugins/unwiredSettings";

const AGENCY_ID = "agency_low_stock";
const CLIENT_ID = "client_low_stock";

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  private readonly tails = new Map<string, Promise<void>>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.data.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.data.set(key, structuredClone(value)); }
  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> { return [...this.data.keys()].filter(key => key.startsWith(prefix)); }
  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

function world(config: Record<string, unknown>) {
  const storage = new MemoryStorage();
  clearEcommerceFoundation();
  const ports = {
    storage,
    activity: { logActivity: (input: Record<string, unknown>) => ({ id: "activity", ts: Date.now(), ...input }), listActivity: () => [] },
    events: { emit() {} },
    tenant: { getClient: () => null, getClientForAgency: () => null },
    pluginInstalls: { getInstall: () => null },
  };
  registerEcommerceFoundation(ports as never);
  const services = buildEcommerceContainer(ports as never);
  const ctx = {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    install: { id: "install_low_stock", pluginId: "ecommerce", agencyId: AGENCY_ID, clientId: CLIENT_ID, enabled: true, config },
    storage,
  } as unknown as PluginCtx;
  return { storage, services, ctx };
}

function adjust(ctx: PluginCtx, body: Record<string, unknown>) {
  return setInventoryHandler(new Request("http://localhost/api/portal/ecommerce/inventory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), ctx);
}

describe("Ecommerce low-stock default is the saved setting", () => {
  it("normalises the setting exactly: whole non-negative numbers only, otherwise the manifest default", () => {
    assert.equal(defaultLowStockThreshold({ lowStockThreshold: 12 }), 12);
    assert.equal(defaultLowStockThreshold({ lowStockThreshold: 0 }), 0);
    assert.equal(defaultLowStockThreshold({}), 5);
    assert.equal(defaultLowStockThreshold(undefined), 5);
    assert.equal(defaultLowStockThreshold({ lowStockThreshold: "12" }), 5);
    assert.equal(defaultLowStockThreshold({ lowStockThreshold: 1.5 }), 5);
    assert.equal(defaultLowStockThreshold({ lowStockThreshold: -1 }), 5);
    assert.equal(defaultLowStockThreshold({ lowStockThreshold: Number.NaN }), 5);
  });

  it("applies the configured default to a new row, keeps an explicit or existing level, and survives a malformed value", async () => {
    const configured = world({ lowStockThreshold: 12 });
    assert.equal((await adjust(configured.ctx, { sku: "SKU-A", onHand: 20 })).status, 200);
    assert.equal((await configured.services.products.getInventory("SKU-A"))?.lowAt, 12, "a new row takes the configured default");
    const first = await configured.services.products.getInventory("SKU-A");
    assert.equal((await adjust(configured.ctx, { sku: "SKU-A", onHand: 18, expectedVersion: first?.version })).status, 200);
    assert.equal((await configured.services.products.getInventory("SKU-A"))?.lowAt, 12, "an adjustment without lowAt keeps the row's level");
    assert.equal((await adjust(configured.ctx, { sku: "SKU-B", onHand: 4, lowAt: 3 })).status, 200);
    assert.equal((await configured.services.products.getInventory("SKU-B"))?.lowAt, 3, "an explicit level wins over the default");

    const malformed = world({ lowStockThreshold: "lots" });
    assert.equal((await adjust(malformed.ctx, { sku: "SKU-C", onHand: 9 })).status, 200);
    assert.equal((await malformed.services.products.getInventory("SKU-C"))?.lowAt, 5, "a malformed saved value falls back to the manifest default");

    const unset = world({});
    assert.equal((await adjust(unset.ctx, { sku: "SKU-D", onHand: 9 })).status, 200);
    assert.equal((await unset.services.products.getInventory("SKU-D"))?.lowAt, 5);
    clearEcommerceFoundation();
  });

  it("removes the two dead declarations and takes the three fields off the unwired inventory", () => {
    const ecommerce = readFileSync("src/built-ins/modules/ecommerce/index.ts", "utf8");
    const finance = readFileSync("src/built-ins/modules/agency-finance/index.ts", "utf8");
    assert.doesNotMatch(ecommerce, /stripePublishableKey/, "the never-read publishable key must not be promised in setup or settings");
    assert.doesNotMatch(finance, /expenseApprovalThresholdCents/, "the never-enforced approval threshold must not be promised");
    assert.match(ecommerce, /id: "lowStockThreshold"[^\n]*helpText: "Used when an inventory adjustment does not set its own low-stock level\."/);
    assert.match(readFileSync("src/built-ins/modules/ecommerce/src/api/handlers.ts", "utf8"), /lowAt: body\.lowAt \?\? existing\?\.lowAt \?\? defaultLowStockThreshold\(ctx\.install\.config\)/);
    for (const removed of [
      ["agency-finance", "expenseApprovalThresholdCents"],
      ["ecommerce", "stripePublishableKey"],
      ["ecommerce", "lowStockThreshold"],
    ]) {
      assert.equal(UNWIRED_SETTINGS.some(entry => entry.pluginId === removed[0] && entry.fieldId === removed[1]), false, `${removed.join("/")} must no longer be listed as unwired`);
    }
    // The total is pinned by the newest settings-consumer suite; this one only
    // owns the three fields above.
    assert.ok(UNWIRED_SETTINGS.length <= 13);
  });
});
