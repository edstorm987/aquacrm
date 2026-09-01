// Finance accounting semantics — one selected-currency cash/accrual book is
// shared by P&L, Reports, Overview, Budgets, Planning and the mounted APIs.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [] } as never;

import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type { ActivityEntry, Agency, Client, PluginInstall } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import { reportHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers";
import { pnlSummaryHandler } from "../src/built-ins/modules/agency-finance/src/api/handlers-r007";
import { containerWithDeps, registerAgencyFinanceFoundation } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, TenantPort, UserPort } from "../src/built-ins/modules/agency-finance/src/server/ports";
import { buildFinancePlanSchedule } from "../src/lib/clients/clientPaymentPlans";

const AGENCY_ID = "agency_accounting_semantics";
const GBP_CLIENT = "client_accounting_gbp";
const USD_CLIENT = "client_accounting_usd";
const ACTOR = "owner_accounting";
const NOW = Date.now() + 60_000;

function world() {
  const agency: Agency = { id: AGENCY_ID, name: "Accounting Agency", slug: "accounting-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const clients: Client[] = [
    { id: GBP_CLIENT, agencyId: AGENCY_ID, name: "GBP Client", slug: "gbp-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 },
    { id: USD_CLIENT, agencyId: AGENCY_ID, name: "USD Client", slug: "usd-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 },
  ];
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix = ""): Promise<string[]> { return [...data.keys()].filter(key => key.startsWith(prefix)); },
  };
  const tenant: TenantPort = {
    getAgency: id => id === AGENCY_ID ? agency : null,
    getClient: id => clients.find(client => client.id === id) ?? null,
    getClientForAgency: (agencyId, id) => agencyId === AGENCY_ID ? clients.find(client => client.id === id) ?? null : null,
    listClients: agencyId => agencyId === AGENCY_ID ? clients : [],
  };
  const user: UserPort = { getUser: () => null };
  const activity: ActivityLogPort = {
    logActivity: input => ({ id: `activity_${Math.random()}`, ts: NOW, ...input }) as ActivityEntry,
    listActivity: () => [],
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall: () => null };
  const compensation = { getTerms: () => null, setProfileLink() {} };
  const services = containerWithDeps({ agencyId: AGENCY_ID, storage, tenant, user, activity, events, pluginInstalls, compensation });
  return { storage, tenant, user, activity, events, pluginInstalls, compensation, services };
}

async function seedBooks() {
  const result = world();
  const { services } = result;
  const category = await services.categories.create({ name: "Operations" }, ACTOR);

  const invoice = async (clientId: string, amountCents: number, currency: "gbp" | "usd", key: string) => {
    const created = await services.invoices.create({
      clientId,
      issuedAt: NOW - 10_000,
      dueAt: NOW + 86_400_000,
      lineItems: [{ description: key, quantity: 1, unitCents: amountCents }],
      currency,
      idempotencyKey: key,
    }, ACTOR);
    return (await services.invoices.update(created.id, { status: "sent" }, ACTOR))!;
  };
  const partial = await invoice(GBP_CLIENT, 10_000, "gbp", "partial");
  await services.payments.record(ACTOR, { invoiceId: partial.id, amountCents: 4_000, currency: "gbp", method: "bank-transfer", paidAt: NOW - 7_000, idempotencyKey: "partial-payment" });
  const full = await invoice(GBP_CLIENT, 5_000, "gbp", "full");
  await services.payments.record(ACTOR, { invoiceId: full.id, amountCents: 5_000, currency: "gbp", method: "stripe", paidAt: NOW - 6_000, idempotencyKey: "full-payment" });
  const refunded = await invoice(GBP_CLIENT, 3_000, "gbp", "refunded");
  await services.payments.record(ACTOR, { invoiceId: refunded.id, amountCents: 3_000, currency: "gbp", method: "stripe", paidAt: NOW - 5_000, idempotencyKey: "refunded-payment" });
  await services.invoices.update(refunded.id, { status: "refunded" }, ACTOR);
  const usd = await invoice(USD_CLIENT, 20_000, "usd", "usd-full");
  await services.payments.record(ACTOR, { invoiceId: usd.id, amountCents: 20_000, currency: "usd", method: "stripe", paidAt: NOW - 4_000, idempotencyKey: "usd-payment" });

  const pending = await services.expenses.create({ categoryId: category.id, amountCents: 1_000, currency: "gbp", incurredAt: NOW - 3_000 }, ACTOR);
  const approved = await services.expenses.create({ categoryId: category.id, amountCents: 2_000, currency: "gbp", incurredAt: NOW - 3_000 }, ACTOR);
  await services.expenses.approve(approved.id, ACTOR);
  const reimbursed = await services.expenses.create({ categoryId: category.id, amountCents: 3_000, currency: "gbp", incurredAt: NOW - 3_000 }, ACTOR);
  await services.expenses.approve(reimbursed.id, ACTOR);
  await services.expenses.reimburse(reimbursed.id, ACTOR);
  const usdExpense = await services.expenses.create({ categoryId: category.id, amountCents: 4_000, currency: "usd", incurredAt: NOW - 3_000 }, ACTOR);
  await services.expenses.approve(usdExpense.id, ACTOR);
  await services.expenses.reimburse(usdExpense.id, ACTOR);
  assert.equal(pending.status, "pending");

  const gbpPlan = await services.plans.create(ACTOR, { tier: "starter", label: "GBP", monthlyAmountCents: 10_000, currency: "gbp" });
  const usdPlan = await services.plans.create(ACTOR, { tier: "growth", label: "USD", monthlyAmountCents: 20_000, currency: "usd" });
  for (const [clientId, plan] of [[GBP_CLIENT, gbpPlan], [USD_CLIENT, usdPlan]] as const) {
    const client = await result.tenant.getClientForAgency(AGENCY_ID, clientId);
    assert.ok(client);
    const schedule = buildFinancePlanSchedule({
      terms: plan,
      clientPaymentPlanId: `schedule-${clientId}`,
      operationId: `assign-${clientId}`,
      firstDueAt: NOW + 86_400_000,
      customerVisible: true,
      now: NOW - 1_000,
      makeMilestoneId: (kind, index) => `${clientId}-${kind}-${index}`,
    });
    client.metadata = { ...client.metadata, clientPaymentPlans: [schedule] };
  }
  return result;
}

test("Finance cash/accrual semantics stay selected-currency and agree across mounted consumers", async t => {
  const seeded = await seedBooks();
  const { services } = seeded;
  const range = { from: 0, to: NOW + 86_400_000 };

  await t.test("partial, full and status-only refunded receipts remain ledger cash while cost states stay named", async () => {
    const gbp = await services.accounting.snapshot({ ...range, currency: "gbp" });
    assert.equal(gbp.cashRevenueCents, 12_000, "partial + full + pre-refund-ledger receipt are cash rows");
    assert.equal(gbp.cashExpenseCents, 3_000, "only reimbursed costs are cash paid");
    assert.equal(gbp.cashNetCents, 9_000);
    assert.equal(gbp.accrualRevenueCents, 18_000, "recognised invoices are separate from receipts");
    assert.equal(gbp.committedExpenseCents, 5_000, "approved + reimbursed are committed/accrued");
    assert.equal(gbp.pendingExpenseCents, 1_000, "pending is neither cash nor committed");
    assert.equal(gbp.accrualNetCents, 13_000);
    assert.equal(gbp.outstandingReceivableCents, 6_000, "partial receipt reduces the open invoice");
    assert.deepEqual(gbp.availableCurrencies, ["gbp", "usd"]);

    const usd = await services.accounting.snapshot({ ...range, currency: "usd" });
    assert.equal(usd.cashRevenueCents, 20_000);
    assert.equal(usd.cashExpenseCents, 4_000);
    assert.equal(usd.cashNetCents, 16_000);
    assert.equal(usd.committedExpenseCents, 4_000);
  });

  await t.test("Reports and Planning/P&L expose the same cash values and currency-partitioned MRR", async () => {
    const report = await services.reports.revenueSnapshot({ ...range, currency: "gbp" });
    assert.equal(report.totalPaidCents, report.cashRevenueCents);
    assert.equal(report.totalExpensesCents, report.cashExpenseCents);
    assert.equal(report.netCents, report.cashNetCents);
    assert.equal(report.cashRevenueCents, 12_000);
    assert.equal(report.committedExpenseCents, 5_000);
    assert.equal(report.monthly.reduce((sum, month) => sum + month.cashRevenueCents, 0), 12_000);

    const gbp = await services.pnl.founderSnapshot(NOW, 30, "gbp");
    const usd = await services.pnl.founderSnapshot(NOW, 30, "usd");
    assert.equal(gbp.currency, "gbp");
    assert.equal(gbp.mrrCents, 10_000);
    assert.equal(usd.currency, "usd");
    assert.equal(usd.mrrCents, 20_000);
    assert.equal(gbp.trailingMonths.at(-1)?.cashRevenueCents, 12_000);
    assert.equal(usd.trailingMonths.at(-1)?.cashRevenueCents, 20_000);
  });

  await t.test("mounted Report and P&L APIs preserve the requested currency and canonical figures", async () => {
    registerAgencyFinanceFoundation({
      tenant: seeded.tenant,
      user: seeded.user,
      activity: seeded.activity,
      events: seeded.events,
      pluginInstalls: seeded.pluginInstalls,
      compensation: seeded.compensation,
    });
    const install = { id: "install_accounting", pluginId: "agency-finance", agencyId: AGENCY_ID, enabled: true, config: { defaultCurrency: "gbp" }, features: {}, installedAt: 0 } as PluginInstall;
    const ctx: PluginCtx = { agencyId: AGENCY_ID, install, storage: seeded.storage, services: {} as PluginCtx["services"], actor: ACTOR };
    const reportResponse = await reportHandler(new Request(`http://localhost/report?from=0&to=${range.to}&currency=usd`), ctx);
    assert.equal(reportResponse.status, 200);
    const reportBody = await reportResponse.json() as { snapshot: { currency: string; cashRevenueCents: number; cashExpenseCents: number } };
    assert.equal(reportBody.snapshot.currency, "usd");
    assert.equal(reportBody.snapshot.cashRevenueCents, 20_000);
    assert.equal(reportBody.snapshot.cashExpenseCents, 4_000);

    const pnlResponse = await pnlSummaryHandler(new Request(`http://localhost/pnl?now=${NOW}&currency=usd`), ctx);
    assert.equal(pnlResponse.status, 200);
    const pnlBody = await pnlResponse.json() as { snapshot: { currency: string; mrrCents: number; trailingMonths: Array<{ cashRevenueCents: number }> } };
    assert.equal(pnlBody.snapshot.currency, "usd");
    assert.equal(pnlBody.snapshot.mrrCents, 20_000);
    assert.equal(pnlBody.snapshot.trailingMonths.at(-1)?.cashRevenueCents, 20_000);
  });

  await t.test("Overview, Reports, Budgets and Planning headlines all read canonical named fields", () => {
    const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const overview = source("src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx");
    const reports = source("src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx");
    const budgets = source("src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx");
    const budgetWorkspace = source("src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx");
    const planning = source("src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx");
    assert.match(overview, /accounting\.cashRevenueCents/);
    assert.match(overview, /accounting\.cashExpenseCents/);
    assert.match(overview, /accounting\.committedExpenseCents/);
    assert.match(reports, /snapshot\.cashRevenueCents/);
    assert.match(reports, /snapshot\.committedExpenseCents/);
    assert.match(budgets, /accounting\.cashNetCents/);
    assert.match(planning, /latest\?\.cashRevenueCents/);
    assert.match(planning, /accounting\.committedExpenseCents/);
    for (const page of [overview, reports, planning, budgetWorkspace]) assert.match(page, /FinanceCurrencyNav/);
    assert.match(budgets, /availableCurrencies=/);
  });

  await t.test("Overview metric definition-list groups keep dt and dd as direct children", () => {
    const overview = readFileSync(new URL("../src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx", import.meta.url), "utf8");
    const metric = overview.slice(overview.indexOf("function Metric("), overview.indexOf("function Row("));
    assert.match(metric, /data-finance-tone=\{tone \?\? "income"\}>\s*<dt\b/);
    assert.match(metric, /<\/dt>\s*<dd\b/);
    assert.doesNotMatch(metric, /data-finance-tone=\{tone \?\? "income"\}>\s*<div\b/);
    assert.match(metric, /<span aria-hidden="true" className="mm-finance-metric-icon/);
  });
});
