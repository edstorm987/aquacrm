import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { readFileSync } from "node:fs";

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

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Installs = typeof import("../src/server/pluginInstalls");
type Alerts = typeof import("../src/lib/server/operationalAlerts");

let storage: Storage;
let tenants: Tenants;
let installs: Installs;
let alerts: Alerts;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  alerts = await import("../src/lib/server/operationalAlerts");
  await storage.ensureHydrated();
  await storage.reset();
});

test("finance rules feed the shared notification collector", async () => {
  const now = Date.parse("2026-08-08T12:00:00Z");
  const agency = tenants.createAgency({ name: "AquaOasis-Web", slug: "aqua-notifications" });
  const install = installs.upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  storage.mutate(state => {
    state.pluginData[install.id] = {
      "expenses/by-id/missing": {
        id: "missing",
        status: "reimbursed",
        paymentMethod: "card",
        amountCents: 1200,
        incurredAt: now - 2_000,
        updatedAt: now - 1_000,
      },
      "expenses/by-id/attached": {
        id: "attached",
        status: "reimbursed",
        paymentMethod: "card",
        amountCents: 800,
        attachments: [{ id: "receipt" }],
        incurredAt: now - 2_000,
        updatedAt: now - 1_000,
      },
      "expenses/by-id/pending": {
        id: "pending",
        status: "pending",
        amountCents: 500,
        incurredAt: now - 2_000,
        updatedAt: now - 1_000,
      },
      "invoices/by-id/late": {
        id: "late",
        status: "sent",
        dueAt: now - 86_400_000,
        totalCents: 50_000,
      },
    };
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.match(result.find(alert => alert.id === "finance:expense-evidence")?.title ?? "", /1 paid expense need receipt evidence/);
  assert.equal(result.find(alert => alert.id === "finance:expense-evidence")?.href, "/portal/agency/agency-finance/expenses?evidence=missing");
  assert.match(result.find(alert => alert.id === "finance:expense-review")?.title ?? "", /1 expense await review/);
  assert.match(result.find(alert => alert.id === "finance:overdue-invoices")?.title ?? "", /1 invoice is overdue/);
});

test("budget pots raise cross-module funding and overspend alerts", async () => {
  const now = Date.parse("2026-08-08T12:00:00Z");
  const agency = tenants.createAgency({ name: "Budget Alerts", slug: "budget-alerts" });
  const finance = installs.upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  const leads = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
  });
  storage.mutate(state => {
    state.pluginData[finance.id] = {
      "budget-pots/by-id/growth": {
        id: "growth",
        name: "Growth campaigns",
        status: "active",
        allocatedCents: 10_000,
        fundedCents: 5_000,
        updatedAt: now - 2_000,
      },
      "budget-pots/by-id/gear": {
        id: "gear",
        name: "Studio equipment",
        status: "active",
        allocatedCents: 4_000,
        fundedCents: 4_000,
        updatedAt: now - 2_000,
      },
    };
    state.pluginData[leads.id] = {
      "campaign:growth": {
        id: "campaign-growth",
        name: "Growth launch",
        budgetPotId: "growth",
        budgetCents: 8_000,
        spendCents: 1_000,
        status: "active",
        updatedAt: now - 1_000,
      },
      "campaign:gear": {
        id: "campaign-gear",
        name: "Equipment launch",
        budgetPotId: "gear",
        budgetCents: 5_000,
        spendCents: 500,
        status: "active",
        updatedAt: now - 1_000,
      },
    };
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.equal(result.find(alert => alert.id === "finance:budget-unfunded:growth")?.severity, "warning");
  assert.match(result.find(alert => alert.id === "finance:budget-unfunded:growth")?.detail ?? "", /£30/);
  assert.equal(result.find(alert => alert.id === "finance:budget-over:gear")?.severity, "critical");
  assert.equal(result.find(alert => alert.id === "finance:budget-over:gear")?.href, "/portal/agency/agency-finance/budgets");
});

test("finance operations warns about compliance and people payments", async () => {
  const now = Date.parse("2026-08-08T12:00:00Z");
  const agency = tenants.createAgency({ name: "Finance Operations Alerts", slug: "finance-operations-alerts" });
  const finance = installs.upsertInstall({ pluginId: "agency-finance", scope: { agencyId: agency.id }, enabled: true, config: {}, features: {} });
  storage.mutate(state => {
    state.pluginData[finance.id] = {
      "operations/obligations/by-id/audit": {
        id: "audit",
        name: "Annual financial audit",
        type: "audit",
        status: "upcoming",
        nextDueAt: now - 86_400_000,
        updatedAt: now - 10_000,
      },
      "operations/payments/by-id/payroll": {
        id: "payroll",
        profileId: "founder",
        kind: "salary",
        status: "approved",
        grossCents: 200_000,
        employerCostCents: 20_000,
        dueAt: now - 1_000,
        updatedAt: now - 5_000,
      },
    };
  });

  const result = await alerts.listOperationalAlerts(agency.id, now);
  assert.equal(result.find(alert => alert.id === "finance:obligations-overdue")?.severity, "critical");
  assert.match(result.find(alert => alert.id === "finance:obligations-overdue")?.title ?? "", /1 finance obligation is overdue/);
  assert.equal(result.find(alert => alert.id === "finance:people-payments-due")?.severity, "critical");
  assert.equal(result.find(alert => alert.id === "finance:people-payments-due")?.href, "/portal/agency/agency-finance/operations");
});

test("live notifications are exposed to global workspace search", () => {
  const search = readFileSync("src/app/api/portal/search/route.ts", "utf8");
  const searchUi = readFileSync("src/components/chrome/PortalSearch.tsx", "utf8");
  assert.match(search, /listOperationalAlerts\(agencyId\)/);
  assert.match(search, /category: "Notification"/);
  assert.match(searchUi, /category === "Notification"/);
});
