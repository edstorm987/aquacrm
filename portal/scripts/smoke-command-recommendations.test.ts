import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildBusinessRecommendedActions } from "../src/lib/businessRecommendedActions";
import type { AdvisorDomain, BusinessIssueRadar, BusinessIssueSeverity } from "../src/lib/businessRadar";

const now = new Date("2026-08-12T10:00:00Z").getTime();

test("command recommendations rank five live actions without letting one domain consume the list", () => {
  const radar = recommendationRadar([
    incident("systems-one", "systems", "critical", 90),
    incident("systems-two", "systems", "critical", 80),
    incident("systems-three", "systems", "critical", 70),
    incident("cash", "finance", "critical", 12),
    incident("lead-wait", "sales", "warning", 9),
    incident("client-risk", "clients", "warning", 7),
    incident("delivery-risk", "delivery", "watch", 5),
  ]);

  const actions = buildBusinessRecommendedActions({ radar, now, limit: 5 });

  assert.equal(actions.length, 5);
  assert.ok(actions.some(action => action.sourceAlertIds.includes("cash")));
  assert.ok(actions.some(action => action.sourceAlertIds.includes("lead-wait")));
  assert.ok(actions.every(action => action.evidence && action.href && action.dueAt >= now));
  assert.ok(actions.filter(action => action.sourceAlertIds.some(source => source.startsWith("systems-"))).length <= 2);
});

test("open tasks are removed and evidence gaps fill the command list", () => {
  const radar = recommendationRadar([incident("cash", "finance", "critical", 12)]);
  const actions = buildBusinessRecommendedActions({
    radar,
    now,
    existingTaskTitles: ["Cash action"],
    limit: 5,
  });

  assert.equal(actions.some(action => action.title === "Cash action"), false);
  assert.ok(actions.some(action => action.title.includes("visibility") || action.title.includes("readiness")));
  assert.equal(new Set(actions.map(action => action.title)).size, actions.length);
});

test("Actions and Advisor share one always-visible, approval-only top five", () => {
  const dashboard = readFileSync("src/app/portal/agency/_DashboardCommandCenter.tsx", "utf8");
  const page = readFileSync("src/app/portal/agency/page.tsx", "utf8");
  const actionsPage = readFileSync("src/app/portal/agency/actions/_ActionsPage.tsx", "utf8");
  const actions = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  const context = readFileSync("src/lib/server/advisorContext.ts", "utf8");
  const skillContext = readFileSync("src/lib/server/advisorSkillContext.ts", "utf8");
  const route = readFileSync("src/app/api/assistant/route.ts", "utf8");
  const advisor = readFileSync("src/lib/server/openaiAssistant.ts", "utf8");

  assert.match(page, /buildBusinessRecommendedActions/);
  assert.match(page, /recommendedActions=/);
  assert.match(actionsPage, /buildBusinessRecommendedActions/);
  assert.match(actionsPage, /commandRecommendations=/);
  assert.match(actions, /Top \{recommendations\.length \|\| 5\} actions from live data/);
  assert.match(actions, /Shared with Advisor/);
  assert.match(actions, /suggestions only · every task requires approval/);
  assert.match(actions, /Accept \$\{item\.title\} as a Radar task/);
  assert.match(actions, /origin: "radar"/);
  assert.doesNotMatch(dashboard, /command-recommendations-heading/);
  assert.match(context, /recommendedActions/);
  assert.match(skillContext, /command: \{/);
  assert.match(skillContext, /visibility: \{/);
  assert.match(skillContext, /Never describe the business as healthy without reconciling them/);
  assert.match(route, /recommendedActions: advisorContext\.recommendedActions/);
  assert.doesNotMatch(route, /if \(!isAssistantConfigured\(session\.agencyId\)\) \{[\s\S]{0,400}suggest-actions/);
  assert.match(advisor, /if \(!apiKey\) return guaranteedRadarActions/);
  assert.match(advisor, /Return at most five recommendations/);
  assert.doesNotMatch(actions, /createAgencyTask/);
});

function recommendationRadar(incidents: BusinessIssueRadar["incidents"]): BusinessIssueRadar {
  const domains = (["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"] as AdvisorDomain[]).map((domain, index) => ({
    domain,
    totalChecks: 200,
    passedChecks: 80,
    firingChecks: 1,
    watchChecks: 0,
    blindChecks: index % 3 === 0 ? 8 : 2,
    learningChecks: 100,
    inactiveChecks: 0,
    applicableChecks: 200,
    assuredChecks: 81,
    coveragePercent: 90,
    assurancePercent: 40,
    confidencePercent: 65,
    readinessPercent: 55 + index,
    sourceCount: 2,
  }));
  return {
    generatedAt: now,
    incidents,
    coverage: [{ id: "finance-feed", domain: "finance", label: "Finance feed", status: "disconnected", recordCount: 0, detail: "Bank evidence is unavailable." }],
    domains,
    adaptive: {
      healthScore: 20,
      confidencePercent: 65,
      readinessPercent: 60,
      conclusions: [],
    },
  } as unknown as BusinessIssueRadar;
}

function incident(id: string, domain: AdvisorDomain, severity: BusinessIssueSeverity, findingCount: number): BusinessIssueRadar["incidents"][number] {
  return {
    id,
    domain,
    severity,
    title: `${id === "cash" ? "Cash" : id} action`,
    detail: `Resolve ${id} from retained business evidence.`,
    evidence: [`${findingCount} findings`],
    href: "/portal/agency",
    detectedAt: now - findingCount * 60_000,
    sourceIds: [`source:${id}`],
    issueIds: [`issue:${id}`],
    checkIds: [`check:${id}`],
    findingCount,
  };
}
