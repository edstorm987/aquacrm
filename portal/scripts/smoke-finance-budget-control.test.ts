import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBudgetPotSnapshots, campaignPotHeadroom } from "../src/built-ins/modules/agency-finance/src/lib/budgetHealth";
import type { AgencyId, UserId } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import { BudgetService } from "../src/built-ins/modules/agency-finance/src/server/budgets";
import { CategoryService } from "../src/built-ins/modules/agency-finance/src/server/categories";
import { ExpenseService } from "../src/built-ins/modules/agency-finance/src/server/expenses";
import type { ActivityLogPort, EventBusPort, StoragePort } from "../src/built-ins/modules/agency-finance/src/server/ports";

const agencyId = "agency_budget_smoke" as AgencyId;
const actor = "user_budget_smoke" as UserId;

function buildServices() {
  const data = new Map<string, unknown>();
  const storage: StoragePort = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
  };
  const activity = {
    logActivity: () => ({}) as never,
    listActivity: () => [],
  } satisfies ActivityLogPort;
  const events = { emit: () => undefined } satisfies EventBusPort;
  const categories = new CategoryService(agencyId, storage, activity, events);
  const budgets = new BudgetService(agencyId, storage, activity, events);
  const expenses = new ExpenseService(agencyId, storage, activity, events, categories, budgets);
  return { budgets, categories, expenses };
}

test("budget pots combine campaign commitments and paid expenses", async () => {
  const services = buildServices();
  const category = await services.categories.create({ name: "Marketing" }, actor);
  const pot = await services.budgets.create(actor, {
    name: "Autumn growth",
    purpose: "growth",
    currency: "gbp",
    period: "quarterly",
    allocatedCents: 100_000,
    fundedCents: 80_000,
  });
  const expense = await services.expenses.create({
    categoryId: category.id,
    budgetPotId: pot.id,
    amountCents: 30_000,
    currency: "gbp",
    vendor: "Printer",
    recordAsPaid: true,
  }, actor);
  const campaign = {
    id: "campaign_autumn",
    name: "Autumn launch",
    budgetPotId: pot.id,
    budgetCents: 60_000,
    spendCents: 10_000,
    status: "active",
  };

  const [snapshot] = buildBudgetPotSnapshots([pot], [campaign], [expense]);
  assert.equal(snapshot.campaignCommittedCents, 60_000);
  assert.equal(snapshot.expenseCommittedCents, 30_000);
  assert.equal(snapshot.committedCents, 90_000);
  assert.equal(snapshot.spentCents, 40_000);
  assert.equal(snapshot.remainingAllocatedCents, 10_000);
  assert.equal(snapshot.remainingFundedCents, -10_000);
  assert.equal(snapshot.signal, "watch");
  assert.equal(campaignPotHeadroom(snapshot, campaign), 50_000, "editing restores the campaign's current commitment before checking headroom");
});

test("expenses reject paused or wrong-currency budget pots", async () => {
  const services = buildServices();
  const category = await services.categories.create({ name: "Equipment" }, actor);
  const paused = await services.budgets.create(actor, {
    name: "Camera equipment",
    purpose: "equipment",
    currency: "gbp",
    allocatedCents: 200_000,
    fundedCents: 100_000,
  });
  await services.budgets.update(actor, paused.id, { status: "paused" });
  await assert.rejects(
    services.expenses.create({ categoryId: category.id, budgetPotId: paused.id, amountCents: 10_000 }, actor),
    /not active/i,
  );

  const euroPot = await services.budgets.create(actor, {
    name: "European trip",
    purpose: "expansion",
    currency: "eur",
    allocatedCents: 100_000,
    fundedCents: 100_000,
  });
  await assert.rejects(
    services.expenses.create({ categoryId: category.id, budgetPotId: euroPot.id, amountCents: 10_000, currency: "gbp" }, actor),
    /uses EUR, not GBP/i,
  );
});
