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

test("live notifications are exposed to global workspace search", () => {
  const search = readFileSync("src/app/api/portal/search/route.ts", "utf8");
  const searchUi = readFileSync("src/components/chrome/PortalSearch.tsx", "utf8");
  assert.match(search, /await listOperationalAlerts\(agencyId\)/);
  assert.match(search, /category: "Notification"/);
  assert.match(searchUi, /category === "Notification"/);
});
