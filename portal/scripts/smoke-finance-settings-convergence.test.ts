import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { before, beforeEach, test } from "node:test";

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

let storage: StorageModule;
let tenants: TenantsModule;
let settings: SettingsModule;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  settings = await import("../src/server/agencySettings");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

test("workspace terms and seller identity govern the next invoice without rewriting history", async () => {
  const agency = tenants.createAgency({ name: "Settings Ledger Agency", slug: "settings-ledger-agency" });
  const client = tenants.createClient(agency.id, { name: "Settings Client" });
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
  const day = 86_400_000;
  const firstIssuedAt = Date.parse("2026-08-26T12:00:00Z");

  settings.updateAgencyWorkspaceSettings(agency.id, {
    legalName: "Old Identity Ltd",
    businessAddress: "1 Original Road",
    taxNumber: "GB-OLD-100",
    defaultPaymentTermsDays: 10,
  }, "owner");
  const first = await invoices.create({
    clientId: client.id,
    issuedAt: firstIssuedAt,
    lineItems: [{ description: "First configured invoice", quantity: 1, unitCents: 10_000 }],
  }, "owner");
  assert.equal(first.dueAt, firstIssuedAt + 10 * day);
  assert.equal(first.issuerSnapshot?.legalName, "Old Identity Ltd");
  assert.match(first.issuerSnapshot?.businessDetails ?? "", /GB-OLD-100/);

  settings.updateAgencyWorkspaceSettings(agency.id, {
    legalName: "New Identity Ltd",
    businessAddress: "2 Current Road",
    taxNumber: "GB-NEW-200",
    defaultPaymentTermsDays: 45,
  }, "owner");
  const secondIssuedAt = firstIssuedAt + day;
  const second = await invoices.create({
    clientId: client.id,
    issuedAt: secondIssuedAt,
    lineItems: [{ description: "Second configured invoice", quantity: 1, unitCents: 20_000 }],
  }, "owner");
  assert.equal(second.dueAt, secondIssuedAt + 45 * day);
  assert.equal(second.issuerSnapshot?.legalName, "New Identity Ltd");

  const [firstHtml, secondHtml] = await Promise.all([
    invoices.renderInvoiceHtml(first.id),
    invoices.renderInvoiceHtml(second.id),
  ]);
  assert.match(firstHtml ?? "", /Old Identity Ltd/);
  assert.match(firstHtml ?? "", /GB-OLD-100/);
  assert.doesNotMatch(firstHtml ?? "", /New Identity Ltd|GB-NEW-200/);
  assert.match(secondHtml ?? "", /New Identity Ltd/);
  assert.match(secondHtml ?? "", /GB-NEW-200/);
  assert.doesNotMatch(secondHtml ?? "", /Old Identity Ltd|GB-OLD-100/);
  assert.equal((await invoices.get(first.id))?.dueAt, firstIssuedAt + 10 * day);
});

test("Finance exposes one visible owner for terms and tax identity", () => {
  const manifest = readFileSync("src/built-ins/modules/agency-finance/index.ts", "utf8");
  const settingsRoute = readFileSync("src/app/api/portal/settings/route.ts", "utf8");
  const invoicesPage = readFileSync("src/built-ins/modules/agency-finance/src/pages/InvoicesPage.tsx", "utf8");
  const invoiceList = readFileSync("src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx", "utf8");
  const financeSettings = readFileSync("src/built-ins/modules/agency-finance/src/pages/SettingsPage.tsx", "utf8");

  assert.doesNotMatch(manifest, /id: "(?:defaultPaymentTermsDays|agencyTaxId)"/);
  assert.doesNotMatch(settingsRoute, /defaultPaymentTermsDays: settings|defaultTaxRatePercent: settings|invoicePrefix: settings/);
  assert.match(invoicesPage, /getAgencyWorkspaceSettings\(props\.agencyId\)/);
  assert.match(invoicesPage, /defaultPaymentTermsDays=\{workspace\.defaultPaymentTermsDays\}/);
  assert.match(invoicesPage, /defaultTaxRatePercent=\{workspace\.defaultTaxRatePercent\}/);
  // Pin the PROPERTY — the due date defaults from the workspace setting — not
  // the arithmetic that once computed it. `addBusinessCalendarDays` replaced
  // the raw `* 86_400_000` so a `type="date"` input lands on the right day in
  // the business time zone; the setting is still what drives it.
  assert.match(invoiceList, /defaultValue=\{addBusinessCalendarDays\(defaultPaymentTermsDays\)\}/);
  assert.match(invoiceList, /defaultValue=\{defaultTaxRatePercent\}/);
  assert.doesNotMatch(invoiceList, /14 \* 86_400_000|defaultValue="20"/);
  assert.match(financeSettings, /\/portal\/agency\/settings#defaults/);
  assert.match(financeSettings, /\/portal\/agency\/settings#account/);
});

test("workspace payment terms are stored as a bounded whole-day default", () => {
  const agency = tenants.createAgency({ name: "Terms Bounds", slug: "terms-bounds" });
  assert.equal(settings.updateAgencyWorkspaceSettings(agency.id, { defaultPaymentTermsDays: 12.6 }, "owner").defaultPaymentTermsDays, 13);
  assert.equal(settings.updateAgencyWorkspaceSettings(agency.id, { defaultPaymentTermsDays: -20 }, "owner").defaultPaymentTermsDays, 0);
  assert.equal(settings.updateAgencyWorkspaceSettings(agency.id, { defaultPaymentTermsDays: 999 }, "owner").defaultPaymentTermsDays, 365);
});
