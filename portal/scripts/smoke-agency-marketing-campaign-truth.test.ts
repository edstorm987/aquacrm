import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import {
  createCampaignHandler,
  listCampaignsHandler,
  reportCampaignsHandler,
  updateCampaignHandler,
} from "../src/built-ins/modules/agency-marketing/src/api/handlers";
import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes";
import type { ActivityEntry, Agency, PluginInstall } from "../src/built-ins/modules/agency-marketing/src/lib/tenancy";
import {
  clearAgencyMarketingFoundation,
  registerAgencyMarketingFoundation,
} from "../src/built-ins/modules/agency-marketing/src/server/foundationAdapter";

const agencyId = "agency_marketing_campaign_truth";
const actor = "user_marketing_campaign_truth";

function context(): PluginCtx {
  const values = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string) { return values.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
  const install: PluginInstall = {
    id: "install_marketing_campaign_truth",
    pluginId: "agency-marketing",
    agencyId,
    enabled: true,
    config: { defaultCurrency: "gbp" },
    features: {},
    installedAt: Date.now(),
  };
  return { agencyId, actor, install, storage, services: {} as PluginCtx["services"] };
}

function campaignRequest(method: "POST" | "PATCH", body: unknown): Request {
  return new Request("http://localhost/campaigns", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Agency Marketing campaign truth boundary", () => {
  before(() => {
    const agency: Agency = {
      id: agencyId,
      name: "Marketing campaign truth test",
      slug: "marketing-campaign-truth-test",
      brand: { primaryColor: "#000000" },
      status: "active",
      createdAt: 0,
      updatedAt: 0,
    };
    registerAgencyMarketingFoundation({
      tenant: { getAgency: id => id === agencyId ? agency : null },
      user: { getUser: () => null },
      activity: {
        logActivity: input => ({ id: "activity", ts: Date.now(), ...input } as ActivityEntry),
        listActivity: () => [],
      },
      events: { emit: () => undefined },
      pluginInstalls: { getInstall: () => null },
    });
  });

  after(() => clearAgencyMarketingFoundation());

  it("refuses impossible runtime values and validates retained dates", async () => {
    const ctx = context();
    for (const body of [
      { name: "Bad channel", channel: "telepathy" },
      { name: "Bad currency", channel: "email", currency: "btc" },
      { name: "Bad budget", channel: "email", budgetCents: -1 },
    ]) {
      const response = await createCampaignHandler(campaignRequest("POST", body), ctx);
      assert.equal(response.status, 422);
    }

    const createdResponse = await createCampaignHandler(campaignRequest("POST", {
      name: "Valid campaign",
      channel: "email",
      startAt: 100,
      endAt: 200,
      budgetCents: 1_000,
    }), ctx);
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as { campaign: { id: string; currency: string } };
    assert.equal(created.campaign.currency, "gbp");

    for (const patch of [
      { name: "   " },
      { startAt: 300 },
      { budgetCents: -500 },
      { status: "sent" },
      { channel: "telepathy" },
      { currency: "btc" },
    ]) {
      const response = await updateCampaignHandler(campaignRequest("PATCH", {
        id: created.campaign.id,
        patch,
      }), ctx);
      assert.equal(response.status, 422);
    }

    const listResponse = await listCampaignsHandler(new Request("http://localhost/campaigns"), ctx);
    const listed = (await listResponse.json()) as {
      campaigns: Array<{ name: string; startAt?: number; endAt?: number; budgetCents?: number; currency: string }>;
    };
    assert.deepEqual(listed.campaigns, [{
      ...listed.campaigns[0],
      name: "Valid campaign",
      startAt: 100,
      endAt: 200,
      budgetCents: 1_000,
      currency: "gbp",
    }]);
  });

  it("reports same-channel budgets in separate labelled currencies", async () => {
    const ctx = context();
    const responses = await Promise.all([
      createCampaignHandler(campaignRequest("POST", {
        name: "GBP paid",
        channel: "paid",
        currency: "gbp",
        budgetCents: 10_000,
      }), ctx),
      createCampaignHandler(campaignRequest("POST", {
        name: "USD paid",
        channel: "paid",
        currency: "usd",
        budgetCents: 20_000,
      }), ctx),
    ]);
    assert.deepEqual(responses.map(response => response.status), [201, 201]);

    const reportResponse = await reportCampaignsHandler(new Request(
      `http://localhost/reports/campaigns?from=0&to=${Date.now() + 1_000}`,
    ), ctx);
    assert.equal(reportResponse.status, 200);
    const report = (await reportResponse.json()) as {
      snapshot: {
        windowBasis: string;
        byChannelCurrency: Array<{ channel: string; currency: string; budgetCents: number }>;
        totalBudgetByCurrency: Array<{ currency: string; budgetCents: number }>;
      };
    };
    assert.equal(report.snapshot.windowBasis, "createdAt");
    assert.deepEqual(report.snapshot.byChannelCurrency.map(row => ({
      channel: row.channel,
      currency: row.currency,
      budgetCents: row.budgetCents,
    })), [
      { channel: "paid", currency: "usd", budgetCents: 20_000 },
      { channel: "paid", currency: "gbp", budgetCents: 10_000 },
    ]);
    assert.deepEqual(report.snapshot.totalBudgetByCurrency, [
      { currency: "usd", budgetCents: 20_000 },
      { currency: "gbp", budgetCents: 10_000 },
    ]);

    const badWindow = await reportCampaignsHandler(new Request(
      "http://localhost/reports/campaigns?from=300&to=200",
    ), ctx);
    assert.equal(badWindow.status, 400);
  });

  it("labels the mounted report window, currency and formatted budget", () => {
    const page = readFileSync(
      new URL("../src/built-ins/modules/agency-marketing/src/pages/ReportsPage.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /Campaigns created in the trailing 12 months/);
    assert.match(page, /Campaigns by channel and currency/);
    assert.match(page, /byChannelCurrency/);
    assert.match(page, /Currency/);
    assert.match(page, /formatBudget\(r\.budgetCents, r\.currency\)/);
    assert.doesNotMatch(page, /Budget \(cents\)/);
  });
});
