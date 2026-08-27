// Opportunity invoice/payment HTTP and UI boundary.
//
// Uses isolated memory only. It proves that a canonical payment-reference
// collision is surfaced as a recoverable 409 and that the mounted manual-entry
// UI requires the idempotency reference before it enables submission.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.PORTAL_BACKEND = "memory";

function memoryStorage() {
  const values = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string) { return values.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async setIfAbsent<T = unknown>(key: string, value: T) {
      if (values.has(key)) return false;
      values.set(key, structuredClone(value));
      return true;
    },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
}

describe("Opportunity ledger boundary", () => {
  it("returns 409 when one canonical payment reference names different money", async () => {
    const [foundation, handlers] = await Promise.all([
      import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter"),
      import("../src/built-ins/modules/leads-pipeline/src/api/handlers"),
    ]);
    const storage = memoryStorage();
    const agencyId = "agency_commercial_ledger_smoke";
    const actor = "user_commercial_ledger_smoke";
    const agency = {
      id: agencyId,
      name: "Commercial Ledger Test",
      slug: "commercial-ledger-test",
      brand: { primaryColor: "#006b7b" },
      status: "active" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const install = {
      id: "install_commercial_ledger_smoke",
      pluginId: "leads-pipeline",
      agencyId,
      enabled: true,
      config: {},
      features: {},
      installedAt: Date.now(),
      installedBy: actor,
    };
    const activity = {
      logActivity: async (input: Record<string, unknown>) => ({
        id: `activity_${Date.now()}`,
        ts: Date.now(),
        ...input,
      }),
      listActivity: async () => [],
    };
    const events = { emit: () => undefined };
    foundation.registerLeadsPipelineFoundation({
      tenant: { getAgency: (id: string) => id === agencyId ? agency : null },
      activity,
      events,
      pluginInstalls: { getInstall: () => install },
    });

    try {
      const container = foundation.containerFor({ agencyId, storage });
      const lead = await container.leads.upsert({
        email: "commercial-ledger@example.com",
        source: "commercial-boundary-smoke",
      }, actor);
      await container.commercial.save({
        partyKind: "lead",
        partyId: lead.lead.id,
        recipientEmail: lead.lead.email,
        lineItems: [{ description: "Website", quantity: 1, unitCents: 10_000 }],
        currency: "gbp",
        dueAt: Date.now() + 86_400_000,
        billingCadence: "one-off",
        serviceLevel: "Website",
        agreementTitle: "Agreement",
        agreementBody: "Terms",
      }, actor);
      await container.commercial.recordPayment("lead", lead.lead.id, {
        amountCents: 3_000,
        method: "bank-transfer",
        reference: "BANK-ROUTE-001",
      }, actor);

      const ctx = {
        agencyId,
        install,
        storage,
        services: {
          clients: {},
          pluginInstalls: {},
          pluginRuntime: {},
          registry: {},
          phases: {},
          activity,
          events,
          variants: {},
          tenant: { getAgency: () => agency },
        },
        actor,
      };
      const response = await handlers.recordCommercialPaymentHandler(new Request(
        "http://localhost/api/portal/leads-pipeline/commercial/payment",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            partyKind: "lead",
            partyId: lead.lead.id,
            amountCents: 4_000,
            method: "bank-transfer",
            reference: "  bank-route-001  ",
          }),
        },
      ), ctx);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "payment_reference_conflict",
        message: "That payment reference is already attached to a different amount or method.",
      });
      const persisted = await container.commercial.get("lead", lead.lead.id);
      assert.equal(persisted?.payments.length, 1);
      assert.equal(persisted?.payments[0]?.amountCents, 3_000);
    } finally {
      foundation.clearLeadsPipelineFoundation();
    }
  });

  it("requires a manual payment reference before enabling submission", () => {
    const source = readFileSync(join(
      process.cwd(),
      "src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx",
    ), "utf8");
    assert.match(source, /aria-label="Payment reference" required/);
    assert.match(source, /!paymentReference\.trim\(\)/);
    assert.match(source, /retry cannot duplicate this payment/);
  });
});
