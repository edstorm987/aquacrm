import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cleanClientMarketingService, clientMarketingMetrics } from "../src/lib/clientMarketingService";

test("client marketing service cleans records and calculates precise paid-media metrics", () => {
  const service = cleanClientMarketingService({
    enabled: true,
    status: "active",
    currency: "gbp",
    monthlyBudgetCents: 100_000,
    profiles: [{ id: "p1", platform: "Instagram", handle: "@client", status: "connected" }],
    content: [{ id: "c1", title: "Launch reel", platform: "Instagram", format: "Reel", status: "review", approval: "pending", updatedAt: 10 }],
    campaigns: [{ id: "a1", name: "High intent", platform: "Google Ads", objective: "Leads", status: "active", approval: "approved", budgetCents: 50_000, spendCents: 20_000, impressions: 10_000, clicks: 500, leads: 20, conversions: 5, revenueCents: 80_000, updatedAt: 10 }],
  });
  const metrics = clientMarketingMetrics(service);
  assert.equal(service.profiles.length, 1);
  assert.equal(metrics.activeCampaigns, 1);
  assert.equal(metrics.pendingApprovals, 1);
  assert.equal(metrics.ctr, 0.05);
  assert.equal(metrics.cplCents, 1_000);
  assert.equal(metrics.conversionRate, 0.01);
  assert.equal(metrics.roas, 4);
});

test("social and paid media is a canonical client lens and packaged portal product", () => {
  const workspace = readFileSync("src/lib/clientWorkspace.ts", "utf8");
  const clientPage = readFileSync("src/app/portal/clients/[clientId]/page.tsx", "utf8");
  const marketingPage = readFileSync("src/app/portal/agency/marketing/page.tsx", "utf8");
  const products = readFileSync("src/lib/portalProducts.ts", "utf8");
  const alerts = readFileSync("src/lib/server/operationalAlerts.ts", "utf8");
  assert.match(workspace, /id: "marketing", label: "Social & ads"/);
  assert.match(clientPage, /ClientMarketingServiceWorkspace/);
  assert.match(marketingPage, /view=client-services/);
  assert.match(products, /catalogKey: "social-ads"/);
  assert.match(alerts, /client-marketing-budget/);
  assert.match(alerts, /client-marketing-approvals/);
});
