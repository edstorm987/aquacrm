// One "needs you" queue, shared by the Command Centre and the Actions list.
//
// Ed: "needs you notifications is wrong… it's meant to combine the actions +
// other things into one." The Actions workspace and the Command Centre priority
// feed used to build their own pools from different inputs, so the two surfaces
// disagreed about what needed the owner. They now both build from ONE shared
// assembler (`buildUnifiedActionQueue`) over ONE server assembly
// (`assembleAgencyActions`). These are static-source contracts, matching the
// rest of the dashboard suite (readFileSync + assert.match on source strings).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dashboard = readFileSync("src/app/portal/agency/_DashboardCommandCenter.tsx", "utf8");
const page = readFileSync("src/app/portal/agency/page.tsx", "utf8");
const actionsWorkspace = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
const unifiedQueue = readFileSync("src/lib/intelligence/unifiedActionQueue.ts", "utf8");

test("the one ranked queue lives in one shared module", () => {
  assert.match(unifiedQueue, /export function buildUnifiedActionQueue\(/, "the assembler is defined once");
  for (const surface of [dashboard, actionsWorkspace]) {
    assert.match(surface, /from "@\/lib\/intelligence\/unifiedActionQueue"/, "every attention surface imports the shared module");
    assert.match(surface, /buildUnifiedActionQueue\(/, "and builds its queue from it, not an ad-hoc pool");
  }
});

test("the Command Centre priority feed IS the unified queue, mapped to the existing row shape", () => {
  // The pool source changed; the row shape and handlers did not — one
  // UnifiedActionItem maps to one StrictItem.
  assert.match(dashboard, /const strictPool = useMemo<StrictItem\[\]>\(\(\) => \{/);
  assert.match(dashboard, /buildUnifiedActionQueue\(\{[\s\S]*?tasks: openTasks,[\s\S]*?crm: generatedActions/, "committed tasks plus the assembled CRM/inbox actions");
  assert.match(dashboard, /return unified\.map\(strictItemFromUnified\)/, "each unified item becomes one feed row");
  assert.match(dashboard, /function strictItemFromUnified\(item: UnifiedActionItem\): StrictItem/);
});

test("the feed no longer runs its own heuristic 'signals' pool", () => {
  // The coarse buildDashboardSignals nudges were replaced by the granular,
  // per-record actions the Actions list already shows.
  assert.doesNotMatch(dashboard, /signals: DashboardSignal\[\]/, "the signals prop is gone from the component type");
  assert.doesNotMatch(page, /signals=\{dashboardSignals\}/, "the page no longer passes a heuristic signals pool");
  assert.doesNotMatch(page, /buildDashboardSignals/, "the heuristic signal builder is retired");
});

test("the page assembles the queue once and shares it with both surfaces", () => {
  assert.match(page, /assembleAgencyActions\(\)/, "the canonical server assembler is called");
  assert.match(page, /const preparedActions = !scanPaused/, "and skipped only while the scan is paused (performance mode)");
  // Same assembly feeds the Actions/Calendar station slot…
  assert.match(page, /prepared=\{preparedActions \?\? undefined\}/, "shared with the Actions station, not re-assembled");
  // …and the dashboard feed.
  assert.match(page, /generatedActions=\{preparedActions\?\.generatedActions \?\? \[\]\}/);
  assert.match(page, /commandRecommendations=\{preparedActions\?\.commandRecommendations \?\? \[\]\}/);
  assert.match(page, /externalProposals=\{preparedActions\?\.externalProposals \?\? \[\]\}/);
});

test("the two surfaces share one urgency ranking", () => {
  // Both import priorityRank from the shared module rather than keeping a
  // private copy that could drift.
  assert.match(unifiedQueue, /export function priorityRank\(/);
  assert.match(dashboard, /import \{ buildUnifiedActionQueue, priorityRank/, "the dashboard uses the shared rank");
  assert.doesNotMatch(dashboard, /function priorityRank\(/, "no private priorityRank copy in the dashboard");
});
