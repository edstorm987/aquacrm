import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Actions exposes all four task sources plus the combined view", () => {
  const workspace = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");

  // "today" and "completed" were added as VIEWS over the same work; the four
  // origins are unchanged, which is what this test is actually guarding.
  assert.match(workspace, /type ActionSource = "all" \| "today" \| "completed" \| AgencyTaskOrigin/);
  for (const origin of ["radar", "advisor", "manual", "crm"]) {
    assert.match(workspace, new RegExp(`id: "${origin}"`), `the ${origin} source must remain`);
  }
  for (const source of ["all", "radar", "advisor", "manual", "crm"]) {
    assert.match(workspace, new RegExp(`id: "${source}"`));
  }
  assert.match(workspace, /aria-label="Filter actions by source"/);
  assert.match(workspace, /sourceCountMap/);
});

test("All uses one ranked queue while source filters retain specialised views", () => {
  const workspace = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");

  assert.match(workspace, /source === "all" \? <UnifiedActionQueue/);
  assert.match(workspace, /function UnifiedActionQueue/);
  assert.match(workspace, /buildUnifiedActionQueue/);
  assert.match(workspace, /Unified priority queue/);
  assert.match(workspace, /System ranked/);
  assert.match(workspace, /SourceBadge origin=/);
  assert.match(workspace, /ApprovalBadge/);
  assert.match(workspace, /source === "radar" \? <CommandRecommendations/);
  assert.match(workspace, /source === "advisor" \? <ExternalAiProposalInbox/);
  assert.match(workspace, /source === "crm" \? <CrmIntake/);
  assert.doesNotMatch(workspace, /source === "all" \|\| source === "radar" \? <CommandRecommendations/);
});

test("accepted tasks can be sorted without mixing pending suggestions into the calendar", () => {
  const workspace = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");

  assert.match(workspace, /aria-label="Sort actions"/);
  for (const sort of ["priority", "due-soon", "newest", "oldest", "recently-updated"]) {
    assert.match(workspace, new RegExp(`value="${sort}"`));
  }
  assert.match(workspace, /sortTasks\(showDone \? sourceTasks/);
  assert.match(workspace, /actions=\{source === "all" \|\| source === "crm" \? calendarEvents : \[\]\}/);
  assert.doesNotMatch(workspace, /actions=\{\[\.\.\.generatedActions/);
});

test("Radar, Advisor and CRM suggestions require acceptance before task creation", () => {
  const workspace = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
  const page = read("src/app/portal/agency/actions/_ActionsPage.tsx");
  const route = read("src/app/api/portal/tasks/route.ts");
  const tasks = read("src/server/tasks.ts");

  assert.match(workspace, /acceptSuggestion\(suggestion, "radar"\)/);
  assert.match(workspace, /acceptSuggestion\(suggestion, "advisor"\)/);
  assert.match(workspace, /async function acceptCrmAction/);
  assert.match(workspace, /origin: action\.origin \?\? "crm"/,
    "an accepted action must record where it came from, not always claim CRM");
  assert.match(workspace, /Accepted actions/);
  assert.match(workspace, /awaiting approval/);
  assert.match(page, /acceptedSourceIds\.has\(action\.id\)/);
  assert.match(page, /acceptedSourceIds\.has\(recommendation\.id\)/);
  assert.match(route, /sourceHref: staff \? undefined : body\.sourceHref/);
  assert.match(tasks, /acceptedAt: origin !== "manual" \? now : undefined/);
  assert.match(tasks, /task\.status !== "done" && taskOrigin\(task\) === origin && task\.sourceId === sourceId/);
});

test("manual and automated task creation preserve useful provenance", () => {
  const workspace = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const automations = read("src/server/automations.ts");
  const types = read("src/server/types.ts");

  assert.match(types, /AgencyTaskOrigin = "manual" \| "radar" \| "advisor" \| "crm"/);
  assert.match(types, /sourceId\?: string/);
  assert.match(types, /acceptedAt\?: number/);
  assert.match(workspace, /origin: "manual"/);
  assert.match(dashboard, /origin: "radar"/);
  assert.match(dashboard, /origin: "crm"/);
  assert.match(automations, /sourceId: `automation:\$\{workflow\.id\}:\$\{node\.id\}`/);
});

test("external AI proposals remain approval-gated and accepted tasks expose reconciliation", () => {
  const workspace = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
  const route = read("src/app/api/portal/external-ai/proposals/route.ts");
  const attention = read("src/components/chrome/NotificationAttentionProvider.tsx");
  const tasks = read("src/server/tasks.ts");

  assert.match(workspace, /External AI proposal inbox/);
  assert.match(workspace, /decision: "accept" \| "park" \| "reject"/);
  assert.match(workspace, /const actionable = proposals\.filter\(proposal => proposal\.status === "pending"\)/);
  assert.match(workspace, /Parked for later/);
  assert.match(workspace, /id=\{`external-proposal-\$\{proposal\.id\}`\}/);
  assert.match(workspace, /setInterval\(refreshWhenActive, 30_000\)/);
  assert.match(workspace, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(workspace, /attention\?\.refreshAlerts\(\)/);
  assert.match(attention, /refreshAlerts: \(\) => Promise<boolean>/);
  assert.match(attention, /setInterval\(refreshWhenStaleAndActive, NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS\)/);
  assert.match(workspace, /Evidence and resolution/);
  assert.match(workspace, /ReconciliationBadge/);
  assert.match(route, /decideExternalAssistantActionProposal/);
  assert.match(tasks, /reconcileAgencyTasksWithRadar/);
  assert.match(tasks, /task\.reopened_by_radar/);
});
