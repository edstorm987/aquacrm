import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildBudgetPotSnapshots } from "../src/built-ins/modules/agency-finance/src/lib/budgetHealth";
import { compensationCostProjection } from "../src/built-ins/modules/agency-finance/src/lib/workforceCosts";
import type { AgencyId, UserId } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import { BudgetService } from "../src/built-ins/modules/agency-finance/src/server/budgets";
import { FinanceOperationsService } from "../src/built-ins/modules/agency-finance/src/server/operations";
import type { ActivityLogPort, EventBusPort, StoragePort } from "../src/built-ins/modules/agency-finance/src/server/ports";

const agencyId = "agency_finance_operations" as AgencyId;
const actor = "owner_finance_operations" as UserId;

function buildServices() {
  const data = new Map<string, unknown>();
  const storage: StoragePort = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
  };
  const activity = { logActivity: () => ({}) as never, listActivity: () => [] } satisfies ActivityLogPort;
  const events = { emit: () => undefined } satisfies EventBusPort;
  const budgets = new BudgetService(agencyId, storage, activity, events);
  return { budgets, operations: new FinanceOperationsService(agencyId, storage, activity, events, budgets) };
}

test("finance operations tracks insurance and audit completion", async () => {
  const { operations } = buildServices();
  const renewal = await operations.createObligation(actor, {
    name: "Professional indemnity renewal",
    type: "insurance",
    provider: "Example Underwriters",
    reference: "PI-2026",
    linkedLegalDocumentId: "legal_policy",
    currency: "gbp",
    expectedCostCents: 48_000,
    coverageAmountCents: 1_000_000_00,
    nextDueAt: Date.parse("2026-11-30T12:00:00Z"),
    reminderAt: Date.parse("2026-10-30T12:00:00Z"),
  });
  assert.equal(renewal.frequency, "annual");
  assert.equal(renewal.linkedLegalDocumentId, "legal_policy");
  assert.equal((await operations.listObligations()).length, 1);

  const completed = await operations.updateObligation(actor, renewal.id, { status: "completed" });
  assert.equal(completed?.status, "completed");
  assert.ok(completed?.lastCompletedAt);
});

test("salary, employer costs, bonuses and freelancers roll up by budget", async () => {
  const { budgets, operations } = buildServices();
  const payrollPot = await budgets.create(actor, {
    name: "People and specialists",
    purpose: "team",
    currency: "gbp",
    period: "monthly",
    allocatedCents: 500_000,
    fundedCents: 400_000,
  });
  const employee = await operations.createCompensationProfile(actor, {
    name: "Operations lead",
    payeeType: "employee",
    departmentId: "dept_operations",
    departmentName: "Operations",
    budgetPotId: payrollPot.id,
    currency: "gbp",
    rateBasis: "annual",
    baseRateCents: 3_600_000,
    employerCostPercent: 15,
    annualBonusTargetCents: 120_000,
  });
  const projection = compensationCostProjection(employee);
  assert.equal(projection.monthlyBaseCents, 300_000);
  assert.equal(projection.monthlyEmployerCostCents, 45_000);
  assert.equal(projection.monthlyBonusTargetCents, 10_000);
  assert.equal(projection.monthlyTotalCents, 355_000);

  const payment = await operations.createCompensationPayment(actor, {
    profileId: employee.id,
    kind: "salary",
    periodLabel: "August 2026",
    grossCents: 300_000,
    employerCostCents: 45_000,
    status: "approved",
    dueAt: Date.parse("2026-08-28T12:00:00Z"),
  });
  assert.equal(payment.budgetPotId, payrollPot.id, "payments inherit the profile budget pot");
  const [snapshot] = buildBudgetPotSnapshots([payrollPot], [], [], [payment]);
  assert.equal(snapshot.workforcePaymentCount, 1);
  assert.equal(snapshot.workforceCommittedCents, 345_000);
  assert.equal(snapshot.remainingFundedCents, 55_000);

  const freelancer = await operations.createCompensationProfile(actor, {
    name: "Freelance photographer",
    payeeType: "freelancer",
    departmentName: "Creative",
    currency: "gbp",
    rateBasis: "daily",
    baseRateCents: 45_000,
    unitsPerWeek: 1,
  });
  assert.equal(freelancer.payeeType, "freelancer");
  await assert.rejects(operations.createCompensationPayment(actor, {
    profileId: freelancer.id,
    kind: "freelancer-invoice",
    currency: "eur",
    grossCents: 45_000,
  }), /must use GBP/i);
});

test("Finance exposes operations, legal reuse and private compensation controls", () => {
  const manifest = readFileSync("src/built-ins/modules/agency-finance/index.ts", "utf8");
  const navigation = readFileSync("src/built-ins/modules/agency-finance/src/components/FinanceNav.tsx", "utf8");
  const sections = readFileSync("src/built-ins/modules/agency-finance/src/lib/sections.ts", "utf8");
  const workspace = readFileSync("src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx", "utf8");
  const routes = readFileSync("src/built-ins/modules/agency-finance/src/api/routes.ts", "utf8");
  // Operations section + route live in the one canonical section list; the
  // manifest nav items and the in-page tabs both derive from it.
  assert.match(sections, /agency-finance\/operations/);
  assert.match(sections, /Operations/);
  assert.match(manifest, /FINANCE_SECTIONS/);
  assert.match(navigation, /FINANCE_SECTIONS/);
  assert.match(workspace, /LegalCompliancePanel/);
  assert.match(workspace, /Department cost capacity/);
  assert.match(workspace, /Freelancer invoice/);
  assert.match(routes, /operations\/obligations/);
  assert.match(routes, /operations\/profiles/);
  assert.match(routes, /operations\/payments/);
});
