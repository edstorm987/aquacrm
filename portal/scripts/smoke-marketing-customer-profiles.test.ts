import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { customerProfilesHandler } from "../src/built-ins/modules/agency-marketing/src/api/handlers-customer-profiles";
import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes";

function context(): PluginCtx {
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(key => key.startsWith(prefix)) : keys;
    },
  };
  return { agencyId: "agency_marketing_profiles", storage } as unknown as PluginCtx;
}

test("customer profiles preserve company-scoped demographic and buying intelligence", async () => {
  const ctx = context();
  const create = await customerProfilesHandler(new Request("http://localhost/customer-profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Growth-minded local founder",
      companyIds: ["company_web", "company_web"],
      audienceType: "business",
      status: "active",
      priority: "primary",
      evidenceConfidence: "informed",
      ageRange: "30-50",
      locations: ["London", "Kent", "London"],
      industries: ["Hospitality", "Professional services"],
      jobTitles: ["Founder", "Managing Director"],
      goals: ["Increase qualified enquiries", "Build credibility"],
      painPoints: ["Fragmented marketing", "No clear attribution"],
      objections: ["Previous agency disappointment"],
      preferredChannels: ["Google", "LinkedIn"],
      typicalBudget: "£2,000-£8,000",
      buyingCycle: "2-6 weeks",
      estimatedAudienceSize: 2400.4,
    }),
  }), ctx);

  assert.equal(create.status, 201);
  const created = await create.json() as { profile: { id: string; companyIds: string[]; locations: string[]; estimatedAudienceSize: number } };
  assert.deepEqual(created.profile.companyIds, ["company_web"]);
  assert.deepEqual(created.profile.locations, ["London", "Kent"]);
  assert.equal(created.profile.estimatedAudienceSize, 2400);

  const update = await customerProfilesHandler(new Request("http://localhost/customer-profiles", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: created.profile.id, patch: { evidenceConfidence: "validated", offerFit: "Website and growth operating system" } }),
  }), ctx);
  assert.equal(update.status, 200);

  const list = await customerProfilesHandler(new Request("http://localhost/customer-profiles"), ctx);
  const listed = await list.json() as { profiles: Array<{ id: string; evidenceConfidence: string; offerFit?: string; goals: string[] }> };
  assert.equal(listed.profiles.length, 1);
  assert.equal(listed.profiles[0]?.evidenceConfidence, "validated");
  assert.equal(listed.profiles[0]?.offerFit, "Website and growth operating system");
  assert.deepEqual(listed.profiles[0]?.goals, ["Increase qualified enquiries", "Build credibility"]);

  const remove = await customerProfilesHandler(new Request(`http://localhost/customer-profiles?id=${created.profile.id}`, { method: "DELETE" }), ctx);
  assert.equal(remove.status, 200);
  const empty = await customerProfilesHandler(new Request("http://localhost/customer-profiles"), ctx);
  assert.equal(((await empty.json()) as { profiles: unknown[] }).profiles.length, 0);
});

test("Marketing opens as a dashboard before exposing configuration tools", () => {
  const page = readFileSync("src/app/portal/agency/marketing/page.tsx", "utf8");
  const workspace = readFileSync("src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx", "utf8");
  const routes = readFileSync("src/built-ins/modules/agency-marketing/src/api/routes.ts", "utf8");
  const campaigns = readFileSync("src/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace.tsx", "utf8");
  const campaignService = readFileSync("src/built-ins/modules/leads-pipeline/src/server/campaigns.ts", "utf8");

  assert.match(page, /if \(view === "overview"\)/);
  assert.match(page, /Open marketing workspace/);
  assert.match(page, /Back to dashboard/);
  assert.match(page, /Customer profiles/);
  assert.match(page, /MarketingOverviewDashboard/);
  assert.match(workspace, /Demographics/);
  assert.match(workspace, /Business and decision profile/);
  assert.match(workspace, /Needs and buying behaviour/);
  assert.match(routes, /path: "customer-profiles"/);
  assert.match(campaigns, /CampaignCustomerProfileSelector/);
  assert.match(campaigns, /customerProfileIds: form\.customerProfileIds/);
  assert.match(campaignService, /customerProfileIds: cleanIds\(input\.customerProfileIds\)/);
});
