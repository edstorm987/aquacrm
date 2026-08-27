import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildFinancePlanSchedule,
  cancelActiveFinancePlanSchedules,
  type ClientPaymentPlan,
} from "../src/lib/clients/clientPaymentPlans";
import { containerWithDeps } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/agency-finance/src/server/ports";
import type {
  Agency,
  Client,
  ClientId,
} from "../src/built-ins/modules/agency-finance/src/lib/tenancy";

const agencyId = "agency_commercial_convergence";
const actorId = "owner_commercial_convergence";
const clientId = "client_commercial_convergence";

function buildWorld() {
  const agency: Agency = {
    id: agencyId,
    name: "Commercial Convergence Agency",
    slug: "commercial-convergence",
    brand: { primaryColor: "#0f172a" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  const clients = new Map<ClientId, Client>([[clientId, {
    id: clientId,
    agencyId,
    name: "Converged Client",
    slug: "converged-client",
    brand: { primaryColor: "#2563eb" },
    stage: "live",
    status: "active",
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
  }]]);
  const rows = new Map<string, unknown>();
  const storage: StoragePort = {
    async get<T>(key: string) { return rows.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { rows.set(key, value); },
    async del(key: string) { rows.delete(key); },
    async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
  };
  const tenant: TenantPort = {
    getAgency: id => id === agencyId ? agency : null,
    getClient: id => clients.get(id) ?? null,
    getClientForAgency: (targetAgencyId, id) => targetAgencyId === agencyId ? clients.get(id) ?? null : null,
    listClients: targetAgencyId => targetAgencyId === agencyId ? [...clients.values()] : [],
  };
  const activity: ActivityLogPort = {
    logActivity: input => ({ id: `activity-${Date.now()}`, ts: Date.now(), ...input }),
    listActivity: () => [],
  };
  const events: EventBusPort = { emit: () => undefined };
  const user: UserPort = { getUser: () => null };
  const pluginInstalls: PluginInstallStorePort = { getInstall: () => null };
  const createContainer = () => containerWithDeps({
    agencyId,
    storage,
    tenant,
    activity,
    events,
    user,
    pluginInstalls,
  });
  const saveSchedules = (schedules: ClientPaymentPlan[]) => {
    const client = clients.get(clientId);
    assert.ok(client);
    client.metadata = { ...client.metadata, clientPaymentPlans: schedules };
  };
  return { clients, createContainer, saveSchedules };
}

function scheduleFor(input: {
  plan: { id: string; label: string; currency: string; monthlyAmountCents: number; lockInMonths: number; lockInFeeCents: number };
  operationId: string;
  now: number;
}) {
  return buildFinancePlanSchedule({
    terms: input.plan,
    clientPaymentPlanId: `schedule-${input.operationId}`,
    operationId: input.operationId,
    firstDueAt: Date.UTC(2026, 8, 1),
    customerVisible: true,
    now: input.now,
    makeMilestoneId: (kind, index) => `${input.operationId}-${kind}-${index}`,
  });
}

test("canonical client schedule drives MRR, ARR and explicit deposit collection", async () => {
  const world = buildWorld();
  const finance = world.createContainer();
  const plan = await finance.plans.create(actorId, {
    tier: "growth",
    label: "Growth UK",
    monthlyAmountCents: 75_000,
    currency: "gbp",
    lockInMonths: 6,
    lockInFeeCents: 120_000,
  });
  const schedule = scheduleFor({ plan, operationId: "gbp-assignment", now: Date.UTC(2026, 7, 26) });

  const invoice = await finance.invoices.create({
    clientId,
    issuedAt: Date.UTC(2026, 7, 26),
    dueAt: Date.UTC(2026, 8, 1),
    currency: "gbp",
    lineItems: [{ description: "Growth UK deposit", quantity: 1, unitCents: 120_000 }],
  }, actorId);
  await finance.invoices.update(invoice.id, { status: "sent" }, actorId);
  const deposit = schedule.milestones.find(milestone => milestone.kind === "deposit");
  assert.ok(deposit);
  deposit.invoiceId = invoice.id;
  world.saveSchedules([schedule]);
  await finance.payments.record(actorId, {
    invoiceId: invoice.id,
    amountCents: 120_000,
    currency: "gbp",
    method: "bank-transfer",
    externalRef: "unrelated-bank-reference",
  });

  assert.deepEqual((await finance.plans.listCommercialAssignments()).map(row => row.clientPaymentPlanId), [schedule.id]);
  const snapshot = await finance.pnl.founderSnapshot(Date.UTC(2026, 9, 1), 30, "gbp");
  assert.equal(snapshot.mrrCents, 75_000);
  assert.equal(snapshot.arrCents, 900_000);
  assert.equal(snapshot.activeClients, 1);
  const deposits = await finance.pnl.lockInRows();
  assert.equal(deposits[0]?.paid, true);
  assert.equal(deposits[0]?.paidCents, 120_000);

  const recoveredNewest = scheduleFor({
    plan: { ...plan, monthlyAmountCents: 88_000 },
    operationId: "newest-recovery-snapshot",
    now: Date.UTC(2026, 7, 27),
  });
  world.saveSchedules([schedule, recoveredNewest]);
  const recoveredAssignments = await finance.plans.listCommercialAssignments();
  assert.equal(recoveredAssignments.length, 1, "damaged duplicate-active metadata cannot double-count one client");
  assert.equal(recoveredAssignments[0]?.monthlyAmountCents, 88_000);

  const monthEnd = buildFinancePlanSchedule({
    terms: { ...plan, lockInMonths: 2 },
    clientPaymentPlanId: "month-end-schedule",
    operationId: "month-end",
    firstDueAt: Date.UTC(2027, 0, 31, 9, 30),
    customerVisible: true,
    now: Date.UTC(2027, 0, 1),
    makeMilestoneId: (kind, index) => `${kind}-${index}`,
  });
  const recurringDates = monthEnd.milestones
    .filter(milestone => milestone.kind === "recurring")
    .map(milestone => new Date(milestone.dueAt).toISOString());
  assert.deepEqual(recurringDates, ["2027-01-31T09:30:00.000Z", "2027-02-28T09:30:00.000Z"]);
});

test("move and cancellation preserve historic invoices while restart reads only the active snapshot", async () => {
  const world = buildWorld();
  const finance = world.createContainer();
  const gbp = await finance.plans.create(actorId, {
    tier: "growth", label: "UK Retainer", monthlyAmountCents: 50_000,
    currency: "gbp", lockInMonths: 3, lockInFeeCents: 25_000,
  });
  const usd = await finance.plans.create(actorId, {
    tier: "scale", label: "US Retainer", monthlyAmountCents: 90_000,
    currency: "usd", lockInMonths: 12, lockInFeeCents: 0,
  });
  const oldSchedule = scheduleFor({ plan: gbp, operationId: "first", now: 100 });
  const oldInvoice = await finance.invoices.create({
    clientId,
    issuedAt: Date.UTC(2026, 7, 1),
    dueAt: Date.UTC(2026, 7, 8),
    currency: "gbp",
    lineItems: [{ description: "Historic UK invoice", quantity: 1, unitCents: 50_000 }],
  }, actorId);
  world.saveSchedules([oldSchedule]);

  const movedHistory = cancelActiveFinancePlanSchedules([oldSchedule], 200);
  const newSchedule = scheduleFor({ plan: usd, operationId: "move", now: 200 });
  world.saveSchedules([...movedHistory, newSchedule]);

  assert.equal((await finance.pnl.founderSnapshot(Date.now(), 30, "gbp")).mrrCents, 0);
  assert.equal((await finance.pnl.founderSnapshot(Date.now(), 30, "usd")).mrrCents, 90_000);
  assert.equal((await finance.invoices.get(oldInvoice.id))?.currency, "gbp");

  const afterRestart = world.createContainer();
  assert.deepEqual((await afterRestart.plans.listCommercialAssignments()).map(row => row.financePlanId), [usd.id]);
  const cancelled = cancelActiveFinancePlanSchedules([...movedHistory, newSchedule], 300, "cancel-new-schedule");
  world.saveSchedules(cancelled);
  const afterCancelRestart = world.createContainer();
  assert.equal((await afterCancelRestart.plans.listCommercialAssignments()).length, 0);
  assert.equal((await afterCancelRestart.pnl.founderSnapshot(Date.now(), 30, "usd")).mrrCents, 0);
  assert.ok(await afterCancelRestart.invoices.get(oldInvoice.id), "cancellation does not erase historic invoices");
  assert.equal(cancelled.find(plan => plan.id === newSchedule.id)?.commercialCancelledByOperationId, "cancel-new-schedule");

  const reassigned = scheduleFor({ plan: gbp, operationId: "after-cancel", now: 400 });
  world.saveSchedules([reassigned, ...cancelled]);
  assert.ok(cancelled.some(plan => plan.commercialCancelledByOperationId === "cancel-new-schedule"), "a replay can be adopted before touching the later assignment");
});

test("mounted Plans UI owns template currency and uses the canonical schedule lifecycle", () => {
  const plansPage = readFileSync("src/built-ins/modules/agency-finance/src/pages/PlansPage.tsx", "utf8");
  const newPlan = readFileSync("src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx", "utf8");
  const manager = readFileSync("src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx", "utf8");
  const routes = readFileSync("src/built-ins/modules/agency-finance/src/api/routes.ts", "utf8");
  const paymentPlanRoute = readFileSync("src/app/api/tenants/client-payment-plans/route.ts", "utf8");
  const clientSchedule = readFileSync("src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx", "utf8");
  const pnl = readFileSync("src/built-ins/modules/agency-finance/src/server/pnl.ts", "utf8");
  const pnlCode = pnl.replace(/\/\/.*$/gm, "");

  assert.match(plansPage, /<CommercialPlansManager/);
  assert.match(newPlan, /currency:\s*String\(data\.get\("currency"\) \?\? defaultCurrency\)/);
  assert.match(manager, /assign-finance-plan/);
  assert.match(manager, /cancel-finance-plan/);
  assert.doesNotMatch(routes, /\/plans\/assign/);
  assert.match(paymentPlanRoute, /action === "assign-finance-plan"/);
  assert.match(paymentPlanRoute, /action === "cancel-finance-plan"/);
  assert.match(paymentPlanRoute, /commercialCancelledByOperationId === operationId/);
  assert.match(paymentPlanRoute, /current\.financePlanId && \["update", "status", "delete"\]/);
  assert.match(clientSchedule, /Manage in Finance Plans/);
  assert.match(pnl, /listCommercialAssignments\(\)/);
  assert.doesNotMatch(pnlCode, /plan\.clientIds|externalRef|notes/);
});
