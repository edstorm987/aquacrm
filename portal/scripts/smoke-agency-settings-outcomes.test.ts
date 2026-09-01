import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type StorageModule = typeof import("../src/server/storage");
type TenantsModule = typeof import("../src/server/tenants");
type SettingsModule = typeof import("../src/server/agencySettings");
type AlertsModule = typeof import("../src/lib/server/inbox/operationalAlerts");

let storage: StorageModule;
let tenants: TenantsModule;
let settings: SettingsModule;
let alerts: AlertsModule;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  settings = await import("../src/server/agencySettings");
  alerts = await import("../src/lib/server/inbox/operationalAlerts");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

describe("Agency Settings control or honestly describe their outcomes", () => {
  it("uses portalAccessDays for the real unsent-access follow-up", async () => {
    const now = Date.parse("2026-08-25T12:00:00Z");
    const day = 86_400_000;
    const agency = tenants.createAgency({ name: "Settings truth", slug: "settings-truth" });
    const client = tenants.createClient(agency.id, {
      name: "Ready client",
      metadata: {
        portalAccessPreparedAt: now - 4 * day,
        lastContactedAt: now,
      },
    });

    settings.updateAgencyWorkspaceSettings(agency.id, { portalAccessDays: 7 }, "owner");
    assert.equal((await alerts.listOperationalAlerts(agency.id, now)).some(alert => alert.id === `portal-access:${client.id}`), false);

    settings.updateAgencyWorkspaceSettings(agency.id, { portalAccessDays: 3 }, "owner");
    const alert = (await alerts.listOperationalAlerts(agency.id, now)).find(item => item.id === `portal-access:${client.id}`);
    assert.match(alert?.detail ?? "", /3 days or more/);
  });

  it("uses saved business identity as the fallback on a real invoice document", async () => {
    const agency = tenants.createAgency({ name: "Fallback Agency", slug: "invoice-identity" });
    const client = tenants.createClient(agency.id, { name: "Invoice Client" });
    settings.updateAgencyWorkspaceSettings(agency.id, {
      legalName: "Truthful Trading Ltd",
      supportEmail: "Accounts@Truthful.example",
      phone: "+44 20 7000 0000",
      website: "https://truthful.example",
      businessAddress: "1 Honest Street\nLondon",
      companyNumber: "12345678",
      taxNumber: "GB123456789",
    }, "owner");

    const rows = new Map<string, unknown>();
    const pluginStorage = {
      async get<T>(key: string) { return rows.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { rows.set(key, value); },
      async del(key: string) { rows.delete(key); },
      async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
    };
    const tenant = {
      getAgency: (id: string) => tenants.getAgency(id) as never,
      getClient: (id: string) => tenants.getClient(id) as never,
      getClientForAgency: (agencyId: string, clientId: string) => tenants.getClientForAgency(agencyId, clientId) as never,
    };
    const activity = {
      logActivity: (input: Record<string, unknown>) => ({ id: "activity", ts: Date.now(), ...input }) as never,
      listActivity: () => [],
    };
    const events = { emit: () => undefined };
    const { InvoiceService } = await import("../src/built-ins/modules/agency-finance/src/server/invoices");
    const invoices = new InvoiceService(agency.id, pluginStorage, tenant, activity, events);
    const invoice = await invoices.create({
      clientId: client.id,
      // This test exercises document identity, not a historical due date. Keep
      // the fixture valid whenever the suite runs instead of expiring it on
      // the calendar and making an unrelated invoice invariant fail.
      dueAt: Date.now() + 7 * 86_400_000,
      lineItems: [{ description: "Truth review", quantity: 1, unitCents: 12_000 }],
    }, "owner");
    const html = await invoices.renderInvoiceHtml(invoice.id);

    for (const expected of [
      "Truthful Trading Ltd",
      "1 Honest Street<br>London",
      "Company number: 12345678",
      "VAT or tax number: GB123456789",
      "accounts@truthful.example",
      "+44 20 7000 0000",
      "https://truthful.example/",
    ]) assert.match(html ?? "", new RegExp(escapeRegex(expected)));
  });

  it("labels the remaining stored-only settings without promising delivery", () => {
    const source = readFileSync("src/app/portal/agency/settings/SettingsTabs.tsx", "utf8");
    assert.doesNotMatch(source, /label="Access-code expiry"/);
    assert.match(source, /Portal-access follow-up after/);
    assert.match(source, /confirmation codes still expire after 15 minutes/i);
    assert.match(source, /digest emails are not sent today/i);
    assert.match(source, /Timezone \(scheduling support pending\)/);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
