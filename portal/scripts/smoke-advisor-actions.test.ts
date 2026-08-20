import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("advisor action review is grounded in live operating data", () => {
  const context = read("src/lib/server/assistants/advisorContext.ts");
  const health = read("src/engines/data/server/kpi/companyHealthSnapshot.ts");
  const route = read("src/app/api/assistant/route.ts");
  assert.match(context, /buildCompanyHealthSnapshot/);
  assert.match(context, /listOperationalAlerts/);
  assert.match(context, /openTasks/);
  assert.match(context, /businessRadar/);
  assert.match(context, /recommendedActions/);
  assert.match(health, /clientsNeedingAttention/);
  assert.match(health, /revenueGapCents/);
  assert.match(route, /suggest-actions/);
  assert.match(route, /advisor-actions:/);
  assert.match(route, /existingTaskTitles/);
});

test("advisor returns strict recommendations without mutating tasks", () => {
  const advisor = read("src/lib/server/assistants/openaiAssistant.ts");
  assert.match(advisor, /json_schema/);
  assert.match(advisor, /additionalProperties: false/);
  assert.match(advisor, /Do not duplicate an existing open task/);
  assert.match(advisor, /sourceAlertIds/);
  assert.match(advisor, /guaranteedRadarActions/);
  assert.match(advisor, /Return at most five recommendations/);
  assert.doesNotMatch(advisor, /createAgencyTask/);
  assert.doesNotMatch(advisor, /updateAgencyTask/);
});

test("a person must approve each recommendation before it becomes a task", () => {
  const actions = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
  assert.match(actions, /Find smart actions/);
  assert.match(actions, /Open evidence/);
  assert.match(actions, /Dismiss/);
  assert.match(actions, /Accept task/);
  assert.match(actions, /acceptSuggestion\(suggestion, "advisor"\)/);
  assert.match(actions, /fetch\("\/api\/assistant"/);
  assert.match(actions, /fetch\("\/api\/portal\/tasks"/);
});

test("company health and the global top bar link to Aqua Advisor", () => {
  const company = read("src/app/portal/agency/company/_CompanyWorkspace.tsx");
  const topbar = read("src/components/chrome/Topbar.tsx");
  assert.match(company, /Ask Advisor/);
  assert.match(company, /\/portal\/agency\/assistant/);
  assert.match(topbar, /Open Aqua Advisor/);
});
