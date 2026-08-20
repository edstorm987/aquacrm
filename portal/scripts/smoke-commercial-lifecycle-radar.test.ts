import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildCommercialLifecycleChecks,
  buildCommercialLifecycleIssues,
  buildCommercialLifecycleSnapshot,
  type CommercialLifecycleLead,
} from "../src/lib/intelligence/commercialLifecycle";
import type { Client } from "../src/server/types";

const ROOT = process.cwd();
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 12, 12);

test("commercial lifecycle remains in learning when no cohort evidence exists", () => {
  const snapshot = buildCommercialLifecycleSnapshot({ leads: [], clients: [], now: NOW });
  const checks = buildCommercialLifecycleChecks(snapshot);

  assert.equal(snapshot.conversionRatePercent, null);
  assert.equal(snapshot.retentionRatePercent, null);
  assert.equal(snapshot.cohorts.length, 0);
  assert.equal(checks.length, 17);
  assert.equal(checks.every(check => check.status === "learning"), true);
  assert.deepEqual(buildCommercialLifecycleIssues(snapshot, checks), []);
});

test("commercial lifecycle joins lead sources to conversion, churn, and cancellation outcomes", () => {
  const leads: CommercialLifecycleLead[] = [
    lead("g1", "Google Ads", 80, { convertedAt: NOW - 60 * DAY, convertedClientId: "c1", currentStageId: "won" }),
    lead("g2", "google ads", 70, { convertedAt: NOW - 40 * DAY, convertedClientId: "c2", currentStageId: "won" }),
    lead("g3", "Google Ads", 60, { currentStageId: "lost" }),
    lead("g4", "Google Ads", 50),
    lead("g5", "Google Ads", 40),
    lead("i1", "Instagram", 40, { currentStageId: "lost" }),
    lead("i2", "Instagram", 35, { currentStageId: "disqualified" }),
    lead("i3", "Instagram", 30, { currentStageId: "lost" }),
    lead("i4", "Instagram", 25),
    lead("u1", "Unknown", 20),
  ];
  const clients = [
    client("c1", "active", "live", NOW - 5 * DAY, { leadId: "g1", leadSource: "Google Ads" }),
    client("c2", "archived", "churned", NOW - 10 * DAY, { leadId: "g2", leadSource: "Google Ads" }),
    client("c3", "active", "live", NOW - DAY, {
      leadSource: "Instagram",
      clientRequests: [{ id: "req1", type: "cancel", status: "open", submittedAt: NOW - DAY }],
    }),
    client("c4", "suspended", "onboarding", NOW - 2 * DAY),
  ];

  const snapshot = buildCommercialLifecycleSnapshot({ leads, clients, now: NOW });
  const checks = buildCommercialLifecycleChecks(snapshot);
  const issues = buildCommercialLifecycleIssues(snapshot, checks);
  const google = snapshot.cohorts.find(cohort => cohort.key === "google ads");
  const instagram = snapshot.cohorts.find(cohort => cohort.key === "instagram");

  assert.equal(snapshot.conversionRatePercent, 20);
  assert.equal(snapshot.lostDecisionRatePercent, 66.7);
  assert.equal(snapshot.unattributedLeadCount, 1);
  assert.equal(snapshot.retentionRatePercent, 66.7);
  assert.equal(snapshot.recentlyChurnedClientCount, 1);
  assert.equal(snapshot.pendingCancellationCount, 1);
  assert.equal(snapshot.clientSourceCoveragePercent, 75);
  assert.equal(snapshot.conversionSpreadPercent, 40);
  assert.equal(snapshot.bestConvertingSource?.key, "google ads");
  assert.equal(google?.conversionRatePercent, 40);
  assert.equal(google?.churnRatePercent, 50);
  assert.equal(instagram?.conversionRatePercent, 0);
  assert.equal(checks.find(check => check.familyId === "lead-conversion-rate")?.status, "pass");
  assert.equal(checks.find(check => check.familyId === "lost-decision-rate")?.status, "critical");
  assert.equal(checks.find(check => check.familyId === "pending-cancellations")?.status, "critical");
  assert.equal(checks.find(check => check.familyId === "portfolio-retention")?.status, "warning");
  assert.equal(issues.some(issue => issue.id === "commercial:clients:pending-cancellations"), true);
  assert.equal(issues.some(issue => issue.id === "commercial:sales:lost-decision-rate"), true);
});

test("business radar, Advisor, and command centre consume the same lifecycle snapshot", () => {
  const radar = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const observations = read("src/engines/data/server/radar/radarObservations.ts");
  const advisor = read("src/lib/server/assistants/advisorSkillContext.ts");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const tenants = read("src/server/tenants.ts");

  assert.match(radar, /buildCommercialLifecycleSnapshot/);
  assert.match(radar, /commercialLifecycleChecks/);
  assert.match(observations, /source-conversion-spread/);
  assert.match(observations, /pending-cancellations/);
  assert.match(advisor, /commercialLifecycle: radar\.commercial/);
  assert.match(dashboard, /Source quality from first lead to retained client/);
  assert.match(dashboard, /Portfolio retention/);
  assert.match(radar, /includeArchived: true/);
  assert.match(tenants, /metadata\.churnedAt = now/);
  assert.match(tenants, /metadata\.archivedAt = now/);
  assert.match(tenants, /metadata\.reactivatedAt = now/);
});

function lead(id: string, source: string, capturedDaysAgo: number, patch: Partial<CommercialLifecycleLead> = {}): CommercialLifecycleLead {
  return {
    id,
    source,
    capturedAt: NOW - capturedDaysAgo * DAY,
    currentStageId: "new",
    stageEnteredAt: NOW - capturedDaysAgo * DAY,
    ...patch,
  };
}

function client(
  id: string,
  status: Client["status"],
  stage: Client["stage"],
  updatedAt: number,
  metadata: Record<string, unknown> = {},
): Client {
  return {
    id,
    agencyId: "agency-1",
    name: id.toUpperCase(),
    slug: id,
    brand: { primaryColor: "#0f766e" },
    stage,
    status,
    metadata,
    createdAt: NOW - 180 * DAY,
    updatedAt,
  };
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}
