// Finance runtime validation — invalid API/import-shaped values must fail at
// the service boundary and leave the plugin store byte-for-byte unchanged.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [] } as never;

import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type { ActivityEntry, Agency, AgencyId, Client, ClientId, PluginInstall, PluginInstallScope, UserId } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import { createInvoiceHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers";
import { compensationPaymentsHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers-operations";
import { containerWithDeps, registerAgencyFinanceFoundation } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, TenantPort, UserPort } from "../src/built-ins/modules/agency-finance/src/server/ports";

const AGENCY_ID = "agency_finance_validation" as AgencyId;
const CLIENT_ID = "client_finance_validation" as ClientId;
const ACTOR = "owner_finance_validation" as UserId;
const ISSUED_AT = Date.parse("2026-08-26T09:00:00Z");
const DUE_AT = Date.parse("2026-09-26T09:00:00Z");

function buildWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Validation Agency", slug: "validation-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const client: Client = { id: CLIENT_ID, agencyId: AGENCY_ID, name: "Validation Client", slug: "validation-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix = ""): Promise<string[]> { return [...data.keys()].filter(key => key.startsWith(prefix)); },
  };
  const tenant: TenantPort = {
    getAgency: id => id === AGENCY_ID ? agency : null,
    getClient: id => id === CLIENT_ID ? client : null,
    getClientForAgency: (agencyId, id) => agencyId === AGENCY_ID && id === CLIENT_ID ? client : null,
  };
  const user: UserPort = { getUser: () => null };
  const activity: ActivityLogPort = {
    logActivity: input => ({ id: "activity", ts: 0, ...input }) as ActivityEntry,
    listActivity: () => [],
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; } };
  const services = containerWithDeps({ agencyId: AGENCY_ID, storage, tenant, user, activity, events, pluginInstalls });
  const snapshot = (): string => JSON.stringify([...data.entries()].sort(([left], [right]) => left.localeCompare(right)));
  return { storage, tenant, user, activity, events, pluginInstalls, services, snapshot };
}

async function rejectsWithoutWrite(
  snapshot: () => string,
  operation: () => Promise<unknown>,
  pattern: RegExp = /agency-finance:/,
): Promise<void> {
  const before = snapshot();
  await assert.rejects(operation, pattern);
  assert.equal(snapshot(), before, "a rejected value must not alter any stored byte");
}

const validInvoice = () => ({
  clientId: CLIENT_ID,
  issuedAt: ISSUED_AT,
  dueAt: DUE_AT,
  lineItems: [{ description: "Runtime validation", quantity: 1, unitCents: 10_000 }],
  taxCents: 2_000,
  currency: "gbp",
});

test("invoice, plan, budget and category schemas reject invalid create and post-patch rows unchanged", async t => {
  const world = buildWorld();
  const { services, snapshot } = world;

  const invoiceCreates: Array<[string, Record<string, unknown>]> = [
    ["unknown invoice field", { ...validInvoice(), invented: true }],
    ["unsupported invoice currency", { ...validInvoice(), currency: "zzz" }],
    ["reversed invoice dates", { ...validInvoice(), issuedAt: DUE_AT, dueAt: ISSUED_AT }],
    ["blank line description", { ...validInvoice(), lineItems: [{ description: " ", quantity: 1, unitCents: 100 }] }],
    ["negative line quantity", { ...validInvoice(), lineItems: [{ description: "Bad", quantity: -1, unitCents: 100 }] }],
    ["fractional line cents", { ...validInvoice(), lineItems: [{ description: "Bad", quantity: 1, unitCents: 10.5 }] }],
    ["unknown nested line field", { ...validInvoice(), lineItems: [{ description: "Bad", quantity: 1, unitCents: 100, totalCents: 100 }] }],
    ["negative invoice tax", { ...validInvoice(), taxCents: -1 }],
  ];
  for (const [label, value] of invoiceCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.invoices.create(value as never, ACTOR)));
  }

  const invoice = await services.invoices.create(validInvoice() as never, ACTOR);
  const invoicePatches: Array<[string, Record<string, unknown>]> = [
    ["invented invoice status", { status: "impossible" }],
    ["reversed patched due date", { dueAt: ISSUED_AT - 1 }],
    ["fractional patched tax", { taxCents: 1.5 }],
    ["unknown nested patched line field", { lineItems: [{ description: "Bad", quantity: 1, unitCents: 100, totalCents: 100 }] }],
    ["unknown invoice patch field", { currency: "usd" }],
  ];
  for (const [label, value] of invoicePatches) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.invoices.update(invoice.id, value as never, ACTOR)));
  }
  await t.test("invented paid-via value", () => rejectsWithoutWrite(snapshot, () => services.invoices.markPaid(invoice.id, { paidVia: "crypto" } as never, ACTOR)));
  for (const [label, value] of [
    ["invalid invoice template colour", { name: "Invoice", accentColor: "red", documentTitle: "Invoice" }],
    ["invalid invoice template image", { name: "Invoice", accentColor: "#112233", documentTitle: "Invoice", letterheadDataUrl: "data:text/plain;base64,eA==" }],
    ["unknown invoice template field", { name: "Invoice", accentColor: "#112233", documentTitle: "Invoice", currency: "gbp" }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.invoices.saveTemplate(value as never)));
  }

  const planCreates: Array<[string, Record<string, unknown>]> = [
    ["invented plan tier", { tier: "impossible", label: "Bad", monthlyAmountCents: 1_000, currency: "gbp" }],
    ["unsupported plan currency", { tier: "starter", label: "Bad", monthlyAmountCents: 1_000, currency: "zzz" }],
    ["fractional monthly price", { tier: "starter", label: "Bad", monthlyAmountCents: 10.5, currency: "gbp" }],
    ["negative lock-in term", { tier: "starter", label: "Bad", monthlyAmountCents: 1_000, lockInMonths: -1, currency: "gbp" }],
    ["invalid active flag", { tier: "starter", label: "Bad", monthlyAmountCents: 1_000, currency: "gbp", active: "yes" }],
    ["unknown plan field", { tier: "starter", label: "Bad", monthlyAmountCents: 1_000, currency: "gbp", status: "active" }],
  ];
  for (const [label, value] of planCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.plans.create(ACTOR, value as never)));
  }
  const plan = await services.plans.create(ACTOR, { tier: "starter", label: "Starter", monthlyAmountCents: 1_000, currency: "gbp" });
  for (const [label, value] of [
    ["blank plan label patch", { label: " " }],
    ["negative lock-in fee patch", { lockInFeeCents: -1 }],
    ["unknown plan patch field", { tier: "growth" }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.plans.update(ACTOR, plan.id, value as never)));
  }

  const budgetCreates: Array<[string, Record<string, unknown>]> = [
    ["invented budget purpose", { name: "Bad", purpose: "impossible", allocatedCents: 1_000, currency: "gbp" }],
    ["invented budget period", { name: "Bad", purpose: "growth", period: "never", allocatedCents: 1_000, currency: "gbp" }],
    ["unsupported budget currency", { name: "Bad", purpose: "growth", allocatedCents: 1_000, currency: "zzz" }],
    ["negative budget money", { name: "Bad", purpose: "growth", allocatedCents: -1, currency: "gbp" }],
    ["fractional budget money", { name: "Bad", purpose: "growth", allocatedCents: 1.5, currency: "gbp" }],
    ["reversed budget dates", { name: "Bad", purpose: "growth", allocatedCents: 1_000, currency: "gbp", startAt: DUE_AT, endAt: ISSUED_AT }],
    ["invalid company id list", { name: "Bad", purpose: "growth", allocatedCents: 1_000, currency: "gbp", companyIds: [42] }],
  ];
  for (const [label, value] of budgetCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.budgets.create(ACTOR, value as never)));
  }
  const budget = await services.budgets.create(ACTOR, { name: "Growth", purpose: "growth", allocatedCents: 10_000, currency: "gbp", startAt: ISSUED_AT, endAt: DUE_AT });
  for (const [label, value] of [
    ["invented budget status patch", { status: "impossible" }],
    ["reversed budget date patch", { startAt: DUE_AT + 1 }],
    ["unknown budget patch field", { currency: "usd" }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.budgets.update(ACTOR, budget.id, value as never)));
  }

  const category = await services.categories.create({ name: "Software" }, ACTOR);
  await t.test("invented category status", () => rejectsWithoutWrite(snapshot, () => services.categories.update(category.id, { status: "hidden" } as never, ACTOR)));
  await t.test("blank category name", () => rejectsWithoutWrite(snapshot, () => services.categories.update(category.id, { name: " " }, ACTOR)));
  await t.test("unknown category create field", () => rejectsWithoutWrite(snapshot, () => services.categories.create({ name: "Travel", kind: "operating" } as never, ACTOR)));
});

test("expense schema validates money, dates, recurrence, flags and attachment evidence without partial writes", async t => {
  const { services, snapshot } = buildWorld();
  const category = await services.categories.create({ name: "Operations" }, ACTOR);
  const valid = { categoryId: category.id, amountCents: 10_000, currency: "gbp", incurredAt: ISSUED_AT };
  const attachment = { id: "att_1", name: "receipt.pdf", url: "/receipt", size: 1_024, contentType: "application/pdf", storageProvider: "local", storageKey: "receipt.pdf", uploadedAt: ISSUED_AT };
  const creates: Array<[string, Record<string, unknown>]> = [
    ["negative expense money", { ...valid, amountCents: -1 }],
    ["fractional expense money", { ...valid, amountCents: 1.5 }],
    ["tax exceeds gross", { ...valid, taxCents: 10_001 }],
    ["invalid tax rate", { ...valid, taxRateBps: 10_001 }],
    ["invalid business-use percent", { ...valid, businessUsePercent: 101 }],
    ["invalid boolean", { ...valid, billableToClient: "yes" }],
    ["unsupported expense currency", { ...valid, currency: "zzz" }],
    ["negative incurred date", { ...valid, incurredAt: -1 }],
    ["invented payment method", { ...valid, paymentMethod: "crypto" }],
    ["invented recurrence", { ...valid, recurrence: "weekly" }],
    ["next date without recurrence", { ...valid, nextDueAt: DUE_AT }],
    ["next date before incurred date", { ...valid, recurrence: "monthly", nextDueAt: ISSUED_AT - 1 }],
    ["invented attachment provider", { ...valid, attachments: [{ ...attachment, storageProvider: "mystery" }] }],
    ["oversized attachment", { ...valid, attachments: [{ ...attachment, size: 8 * 1024 * 1024 + 1 }] }],
    ["unknown attachment field", { ...valid, attachments: [{ ...attachment, bucket: "public" }] }],
    ["unknown expense field", { ...valid, status: "reimbursed" }],
  ];
  for (const [label, value] of creates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.expenses.create(value as never, ACTOR)));
  }

  const expense = await services.expenses.create(valid, ACTOR);
  for (const [label, value] of [
    ["invented expense method patch", { paymentMethod: "crypto" }],
    ["negative expense date patch", { incurredAt: -1 }],
    ["invalid attachment patch", { attachments: [{ ...attachment, storageProvider: "mystery" }] }],
    ["unknown expense patch field", { status: "approved" }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.expenses.update(expense.id, value as never, ACTOR)));
  }
  await t.test("non-text approval note", () => rejectsWithoutWrite(snapshot, () => services.expenses.approve(expense.id, ACTOR, 42 as never)));
  await t.test("non-text rejection note", () => rejectsWithoutWrite(snapshot, () => services.expenses.reject(expense.id, ACTOR, 42 as never)));
});

test("Operations schemas reject invented states, invalid money and incoherent dates unchanged", async t => {
  const { services, snapshot } = buildWorld();
  const obligationCreates: Array<[string, Record<string, unknown>]> = [
    ["invented obligation type", { name: "Bad", type: "impossible", currency: "gbp" }],
    ["invented obligation frequency", { name: "Bad", type: "audit", frequency: "never", currency: "gbp" }],
    ["invented obligation status", { name: "Bad", type: "audit", status: "gone", currency: "gbp" }],
    ["unsupported obligation currency", { name: "Bad", type: "audit", currency: "zzz" }],
    ["negative obligation money", { name: "Bad", type: "audit", expectedCostCents: -1, currency: "gbp" }],
    ["reversed coverage dates", { name: "Bad", type: "insurance", effectiveAt: DUE_AT, coverageEndsAt: ISSUED_AT, currency: "gbp" }],
    ["reminder after due date", { name: "Bad", type: "audit", reminderAt: DUE_AT, nextDueAt: ISSUED_AT, currency: "gbp" }],
    ["non-text obligation provider", { name: "Bad", type: "audit", provider: 42, currency: "gbp" }],
    ["unknown obligation field", { name: "Bad", type: "audit", currency: "gbp", invented: true }],
  ];
  for (const [label, value] of obligationCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.operations.createObligation(ACTOR, value as never)));
  }
  const obligation = await services.operations.createObligation(ACTOR, { name: "Annual audit", type: "audit", currency: "gbp", reminderAt: ISSUED_AT, nextDueAt: DUE_AT });
  for (const [label, value] of [
    ["invented obligation patch status", { status: "gone" }],
    ["negative obligation patch money", { coverageAmountCents: -1 }],
    ["incoherent obligation patch dates", { reminderAt: DUE_AT + 1 }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.operations.updateObligation(ACTOR, obligation.id, value as never)));
  }

  const validProfile = { name: "Operator", payeeType: "employee", currency: "gbp", rateBasis: "annual", baseRateCents: 3_000_000, contractStartsAt: ISSUED_AT, contractEndsAt: DUE_AT };
  const profileCreates: Array<[string, Record<string, unknown>]> = [
    ["invented payee type", { ...validProfile, payeeType: "robot" }],
    ["invented rate basis", { ...validProfile, rateBasis: "sometimes" }],
    ["invented pay frequency", { ...validProfile, payFrequency: "daily" }],
    ["unsupported profile currency", { ...validProfile, currency: "zzz" }],
    ["fractional profile money", { ...validProfile, baseRateCents: 1.5 }],
    ["invalid employer percentage", { ...validProfile, employerCostPercent: 201 }],
    ["invalid weekly units", { ...validProfile, unitsPerWeek: 169 }],
    ["reversed contract dates", { ...validProfile, contractStartsAt: DUE_AT, contractEndsAt: ISSUED_AT }],
    ["non-text profile email", { ...validProfile, email: 42 }],
    ["unknown profile field", { ...validProfile, status: "active" }],
  ];
  for (const [label, value] of profileCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.operations.createCompensationProfile(ACTOR, value as never)));
  }
  const profile = await services.operations.createCompensationProfile(ACTOR, validProfile as never);
  for (const [label, value] of [
    ["invented profile patch status", { status: "gone" }],
    ["negative profile patch money", { annualBonusTargetCents: -1 }],
    ["reversed profile patch dates", { contractStartsAt: DUE_AT + 1 }],
    ["unknown profile patch field", { idempotencyKey: "not-supported" }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.operations.updateCompensationProfile(ACTOR, profile.id, value as never)));
  }

  const validPayment = { profileId: profile.id, kind: "salary", currency: "gbp", grossCents: 100_000, status: "planned", dueAt: DUE_AT };
  const paymentCreates: Array<[string, Record<string, unknown>]> = [
    ["invented compensation kind", { ...validPayment, kind: "gift" }],
    ["invented compensation status", { ...validPayment, status: "gone" }],
    ["unsupported compensation currency", { ...validPayment, currency: "zzz" }],
    ["fractional compensation money", { ...validPayment, grossCents: 1.5 }],
    ["negative compensation date", { ...validPayment, dueAt: -1 }],
    ["paid date on planned compensation", { ...validPayment, paidAt: DUE_AT }],
    ["non-text compensation notes", { ...validPayment, notes: 42 }],
    ["unknown compensation field", { ...validPayment, invented: true }],
  ];
  for (const [label, value] of paymentCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.operations.createCompensationPayment(ACTOR, value as never)));
  }
  const payment = await services.operations.createCompensationPayment(ACTOR, validPayment as never);
  for (const [label, value] of [
    ["invented compensation patch kind", { kind: "gift" }],
    ["negative compensation patch money", { employerCostCents: -1 }],
    ["paid date on approved compensation", { status: "approved", paidAt: DUE_AT }],
    ["unknown compensation patch field", { profileId: profile.id }],
  ] as Array<[string, Record<string, unknown>]>) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.operations.updateCompensationPayment(ACTOR, payment.id, value as never)));
  }
});

test("payment and income services plus mounted handlers reject invalid JSON without storage changes", async t => {
  const world = buildWorld();
  const { services, snapshot } = world;
  const invoice = await services.invoices.create(validInvoice() as never, ACTOR);
  await services.invoices.update(invoice.id, { status: "sent" }, ACTOR);

  const paymentCreates: Array<[string, Record<string, unknown>]> = [
    ["fractional payment money", { invoiceId: invoice.id, amountCents: 1.5, currency: "gbp", method: "cash" }],
    ["unsupported payment currency", { invoiceId: invoice.id, amountCents: 1_000, currency: "zzz", method: "cash" }],
    ["invented payment method", { invoiceId: invoice.id, amountCents: 1_000, currency: "gbp", method: "crypto" }],
    ["negative payment date", { invoiceId: invoice.id, amountCents: 1_000, currency: "gbp", method: "cash", paidAt: -1 }],
    ["non-text payment key", { invoiceId: invoice.id, amountCents: 1_000, currency: "gbp", method: "cash", idempotencyKey: 42 }],
    ["unknown payment field", { invoiceId: invoice.id, amountCents: 1_000, currency: "gbp", method: "cash", status: "paid" }],
  ];
  for (const [label, value] of paymentCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.payments.record(ACTOR, value as never)));
  }

  const incomeCreates: Array<[string, Record<string, unknown>]> = [
    ["blank income title", { title: " ", amountCents: 1_000, currency: "gbp", method: "cash" }],
    ["fractional income money", { title: "Other", amountCents: 1.5, currency: "gbp", method: "cash" }],
    ["unsupported income currency", { title: "Other", amountCents: 1_000, currency: "zzz", method: "cash" }],
    ["invented income method", { title: "Other", amountCents: 1_000, currency: "gbp", method: "crypto" }],
    ["negative income date", { title: "Other", amountCents: 1_000, currency: "gbp", method: "cash", receivedAt: -1 }],
    ["unknown income field", { title: "Other", amountCents: 1_000, currency: "gbp", method: "cash", status: "received" }],
  ];
  for (const [label, value] of incomeCreates) {
    await t.test(label, () => rejectsWithoutWrite(snapshot, () => services.income.create(ACTOR, value as never)));
  }

  registerAgencyFinanceFoundation({
    tenant: world.tenant,
    user: world.user,
    activity: world.activity,
    events: world.events,
    pluginInstalls: world.pluginInstalls,
  } as never);
  const ctx = {
    agencyId: AGENCY_ID,
    actor: ACTOR,
    storage: world.storage,
    install: { id: "install_validation", config: { defaultCurrency: "gbp", ukDefaultCurrencyV1: true } },
  } as unknown as PluginCtx;
  const request = (path: string, body: unknown): Request => new Request(`http://localhost/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const beforeInvoiceApi = snapshot();
  const invoiceResponse = await createInvoiceHandler(request("finance/invoices", { ...validInvoice(), currency: "zzz" }), ctx);
  assert.equal(invoiceResponse.status, 422);
  assert.match(String((await invoiceResponse.json() as { error: string }).error), /currency/);
  assert.equal(snapshot(), beforeInvoiceApi);

  const profile = await services.operations.createCompensationProfile(ACTOR, { name: "API Operator", payeeType: "employee", currency: "gbp", rateBasis: "annual", baseRateCents: 3_000_000 });
  const beforeOperationsApi = snapshot();
  const operationsResponse = await compensationPaymentsHandler(request("finance/operations/payments", { profileId: profile.id, kind: "gift", grossCents: 10_000 }), ctx);
  assert.equal(operationsResponse.status, 422);
  assert.match(String((await operationsResponse.json() as { error: string }).error), /kind/);
  assert.equal(snapshot(), beforeOperationsApi);
});
