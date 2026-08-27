import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  shouldRunHeavyPanels,
  normalizeScanFlag,
  buildPausedBusinessRadar,
  buildPausedIntelligenceSnapshot,
  reconcileBusinessRadarSnapshot,
  reconcileCommandIntelligenceSnapshot,
} from "../src/app/portal/agency/commandPerformance";
import {
  devTeamStationAttention,
  radarStationAttention,
} from "../src/app/portal/agency/commandStationAttention";
import {
  resolveServerCommandStation,
  serverCommandStationHref,
} from "../src/app/portal/agency/commandStationRouting";
import {
  beginServerStationNavigation,
  pendingServerStationView,
  serverStationSettlementFallback,
} from "../src/app/portal/agency/serverStationNavigation";
import type { RadarPolicyConfiguration } from "../src/server/types";

const read = (path: string) => readFileSync(path, "utf8");

// The policy is only read for its operatingStage and stored verbatim on the
// placeholder radar, so a minimal cast is enough to exercise the builder.
const POLICY = { operatingStage: "setup" } as unknown as RadarPolicyConfiguration;

test("Performance mode gates the heavy panels: off = always build, on = paused unless a one-shot scan", () => {
  // Performance mode OFF → the eager build path is intact on every render.
  assert.equal(shouldRunHeavyPanels(false, false), true);
  assert.equal(shouldRunHeavyPanels(false, true), true);
  // Performance mode ON → paused by default (cached-or-on-button, not every
  // navigation), but a one-shot ?scan=1 render forces a fresh build.
  assert.equal(shouldRunHeavyPanels(true, false), false);
  assert.equal(shouldRunHeavyPanels(true, true), true);
});

test("normalizeScanFlag reads the one-shot ?scan=1 flag", () => {
  assert.equal(normalizeScanFlag("1"), true);
  assert.equal(normalizeScanFlag(["1"]), true);
  assert.equal(normalizeScanFlag(undefined), false);
  assert.equal(normalizeScanFlag("0"), false);
  assert.equal(normalizeScanFlag("scan"), false);
});

test("an RSC scan replaces the untouched placeholder but preserves a newer local scan", () => {
  const previousServer = buildPausedBusinessRadar(POLICY, 300);
  const fullServer = { ...buildPausedBusinessRadar(POLICY, 200), summary: { ...previousServer.summary, totalChecks: 42 } };
  assert.equal(
    reconcileBusinessRadarSnapshot(previousServer, previousServer, fullServer, true, false),
    fullServer,
    "object identity replaces an untouched placeholder even when a cached full scan has an older timestamp",
  );

  const newerLocal = { ...buildPausedBusinessRadar(POLICY, 400), summary: { ...previousServer.summary, totalChecks: 99 } };
  assert.equal(reconcileBusinessRadarSnapshot(newerLocal, previousServer, fullServer, true, false), newerLocal);
  const newestServer = { ...fullServer, generatedAt: 500 };
  assert.equal(reconcileBusinessRadarSnapshot(newerLocal, previousServer, newestServer, true, false), newestServer);

  const newerPausedServer = buildPausedBusinessRadar(POLICY, 600);
  assert.equal(
    reconcileBusinessRadarSnapshot(fullServer, fullServer, newerPausedServer, false, true),
    fullServer,
    "a newer placeholder cannot erase an untouched full server sweep",
  );
  assert.equal(
    reconcileBusinessRadarSnapshot(newerLocal, fullServer, newerPausedServer, false, true),
    newerLocal,
    "a newer placeholder cannot erase a local scan",
  );
});

test("a completed KPI-intelligence build cannot be downgraded by a later paused RSC payload", () => {
  const previousPaused = buildPausedIntelligenceSnapshot("GBP", 300);
  const completed = { ...previousPaused, generatedAt: 200, currency: "USD" };
  assert.equal(
    reconcileCommandIntelligenceSnapshot(previousPaused, previousPaused, completed, true, false),
    completed,
    "the first completed server scan replaces the untouched placeholder even when its cached timestamp is older",
  );

  const laterPaused = buildPausedIntelligenceSnapshot("GBP", 600);
  assert.equal(
    reconcileCommandIntelligenceSnapshot(completed, completed, laterPaused, false, true),
    completed,
    "a freshly timestamped empty placeholder cannot erase completed KPI evidence",
  );
});

test("deferred Dev Team and paused Radar attention are unknown, while completed zero results are clear", () => {
  const deferredDevTeam = devTeamStationAttention(false, 0, 0);
  assert.equal(deferredDevTeam.tone, "info");
  assert.match(deferredDevTeam.label, /loads with the Dev Team station/i);
  assert.notEqual(deferredDevTeam.label, "Nothing is blocked on the Dev Team board");

  const clearDevTeam = devTeamStationAttention(true, 0, 0);
  assert.equal(clearDevTeam.tone, "clear");
  assert.equal(clearDevTeam.label, "Nothing is blocked on the Dev Team board");

  const pausedRadar = radarStationAttention({ critical: 0, warning: 0 }, true);
  assert.equal(pausedRadar.tone, "info");
  assert.match(pausedRadar.label, /Radar paused · run scan/i);
  assert.notEqual(pausedRadar.label, "Radar has no critical or warning incidents");

  const clearRadar = radarStationAttention({ critical: 0, warning: 0 }, false);
  assert.equal(clearRadar.tone, "clear");
  assert.equal(clearRadar.label, "Radar has no critical or warning incidents");

  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  assert.match(dashboard, /radarStationAttention\(radarSnapshot\.summary, displayedRadarIsPaused\)/);
  assert.match(dashboard, /devTeamStationAttention\(devTeamAttentionLoaded, devTeamBlockedCount, devTeamLaunchBlockerCount\)/);
  assert.match(stationNav, /radarAttention\.tone === "info" \? "text-sky-200"/);
  assert.match(stationNav, /radarAttention\.tone === "info" \? radarAttention\.label : "Radar online"/);
});

test("the paused radar placeholder is a well-formed empty sweep, never a fabricated failure", () => {
  const radar = buildPausedBusinessRadar(POLICY, 1_000);
  assert.equal(radar.generatedAt, 1_000);
  assert.equal(radar.summary.critical, 0);
  assert.equal(radar.summary.warning, 0);
  assert.equal(radar.summary.totalChecks, 0);
  assert.deepEqual(radar.incidents, []);
  assert.deepEqual(radar.domains, []);
  assert.deepEqual(radar.checks, []);
  // The agency's real configured policy still flows through so the operating
  // stage reads truthfully rather than being invented.
  assert.equal(radar.adaptive.operatingStage, "setup");
  assert.equal(radar.adaptive.policy, POLICY);
});

test("the paused intelligence placeholder carries no KPIs and honest empty commercial intelligence", () => {
  const snapshot = buildPausedIntelligenceSnapshot("GBP", 2_000);
  assert.equal(snapshot.generatedAt, 2_000);
  assert.equal(snapshot.currency, "GBP");
  assert.deepEqual(snapshot.kpis, []);
  assert.equal(snapshot.scopes.length, 1);
  assert.equal(snapshot.scopes[0]?.kind, "ecosystem");
  assert.equal(snapshot.summary.connectedKpis, 0);
  assert.equal(snapshot.demandFlow.pageviews, null);
  assert.ok(snapshot.commercialIntelligence, "commercial intelligence must be present");
});

test("the Command Centre page gates radar + intelligence behind runHeavyPanels and keeps the OFF path intact", () => {
  const page = read("src/app/portal/agency/page.tsx");

  // The switch exists and drives a paused flag handed to the client.
  assert.match(page, /shouldRunHeavyPanels\(lightweightMode, scanRequested\)/);
  assert.match(page, /const scanPaused = !runHeavyPanels/);
  assert.match(page, /scanPaused=\{scanPaused\}/);
  assert.match(page, /let devTeamAttentionLoaded = false/);
  assert.match(page, /devTeamAttentionLoaded = true/);
  assert.match(page, /devTeamAttentionLoaded=\{devTeamAttentionLoaded\}/);

  // The heavy sweep is no longer unconditional — it only runs under
  // runHeavyPanels, and the paused branch swaps in the lightweight placeholder.
  assert.match(page, /if \(runHeavyPanels\) \{[\s\S]*getCachedBusinessIssueRadar\(agency\.id\)/);
  assert.match(page, /buildPausedBusinessRadar\(workspaceSettings\.advisor\.radarPolicy/);
  assert.match(page, /runHeavyPanels[\s\S]*buildCommandIntelligenceSnapshot\([\s\S]*buildPausedIntelligenceSnapshot\(/);

  // The full path remains intact, but both large server graphs are dynamic so
  // the pristine paused landing does not compile them before Run scan.
  assert.match(page, /const radarPromise = import\("@\/engines\/data\/server\/radar\/businessIssueRadar"\)/);
  assert.match(page, /const operationalAlertsPromise = lightweightMode[\s\S]*import\("@\/lib\/server\/inbox\/operationalAlerts"\)/);
  assert.doesNotMatch(page, /^import \{ getCachedBusinessIssueRadar \}/m);
  assert.doesNotMatch(page, /^import \{ buildCommandIntelligenceSnapshot \}/m);
});

test("the Command Centre client surfaces a Run scan control while paused", () => {
  const client = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  assert.match(client, /scanPaused\?: boolean/);
  assert.match(client, /scanPaused = false/);
  assert.match(client, /data-testid="command-scan-paused"/);
  assert.match(client, /displayedRadarIsPaused = scanPaused && radarSnapshot === businessRadar/);
  assert.match(client, /displayedIntelligenceIsPaused = scanPaused && intelligenceState === intelligenceSnapshot/);
  assert.match(client, /displayedScanIsPaused = displayedRadarIsPaused \|\| displayedIntelligenceIsPaused/);
  assert.match(client, /\{displayedScanIsPaused \? \(/, "a preserved complete scan must not be labelled paused after a lightweight RSC navigation");
  assert.match(client, /reconcileCommandIntelligenceSnapshot\(/);
  assert.match(client, /if \(!scanPaused\) setCompletedServerScan\(true\)/);
  assert.match(client, /serverCommandStationHref\(pathname, searchParams\.toString\(\), station, fullServerScanLoaded\)/);
  assert.match(client, /<CommandCentreKpiTrajectory intelligence=\{intelligenceState\}/);
  assert.match(client, /<BattleTableWorkspace payload=\{battleTablePayload\} intelligence=\{intelligenceState\}/);
  assert.match(client, /snapshot=\{intelligenceState\}/);
  assert.match(client, /<DayKpiIntelligencePanel intelligence=\{intelligenceState\}/);
  assert.match(client, /<DayCommandSensorPanel radar=\{radarSnapshot\} intelligence=\{intelligenceState\}/);
  assert.doesNotMatch(client, /intelligence=\{intelligenceSnapshot\}/, "rendered stations must consume the reconciled intelligence evidence");
  assert.match(client, /Run scan/);
  // The one-shot flag is stripped after the heavy render so a later refresh
  // returns to the fast paused view rather than rebuilding again.
  assert.match(client, /params\.delete\("scan"\)/);
});

test("only the server-backed stations resolve, Battle defers its payload, legacy Executive links survive, and Dev Team stays gated", () => {
  assert.equal(resolveServerCommandStation("executive"), "executive");
  assert.equal(resolveServerCommandStation("battle"), "battle");
  assert.equal(resolveServerCommandStation("omega"), "executive");
  assert.equal(resolveServerCommandStation("calendar"), "calendar");
  assert.equal(resolveServerCommandStation("actions"), "actions");
  assert.equal(resolveServerCommandStation(["advisor", "actions"]), "advisor");
  assert.equal(resolveServerCommandStation("devteam", false), null);
  assert.equal(resolveServerCommandStation("devteam", true), "devteam");
  for (const localStation of [undefined, null, "", "day", "radar", "intelligence"]) {
    assert.equal(resolveServerCommandStation(localStation), null);
  }
});

test("server-station navigation preserves unrelated query parameters", () => {
  assert.equal(
    serverCommandStationHref("/portal/agency", "scan=1&scope=company%3Aalpha", "advisor"),
    "/portal/agency?scan=1&scope=company%3Aalpha&station=advisor",
  );
  assert.equal(
    serverCommandStationHref("/portal/agency", "scan=1&station=calendar&scope=ecosystem", "actions"),
    "/portal/agency?scan=1&station=actions&scope=ecosystem",
  );
  assert.equal(
    serverCommandStationHref("/portal/agency", "scan=1&station=devteam&scope=ecosystem", null),
    "/portal/agency?scan=1&scope=ecosystem",
  );
  assert.equal(
    serverCommandStationHref("/portal/agency", "scope=company%3Aalpha", "battle", true),
    "/portal/agency?scope=company%3Aalpha&scan=1&station=battle",
    "a completed scan is explicitly continued after its visible one-shot query was stripped",
  );
});

test("server-station transitions select a loading view immediately, coalesce duplicates, and recover on failure", () => {
  const previous = { activeStation: "intelligence" as const, dashboardMode: "intelligence" as const };
  assert.deepEqual(pendingServerStationView("executive"), { activeStation: "executive", dashboardMode: "radar" });
  assert.deepEqual(pendingServerStationView("battle"), { activeStation: "battle", dashboardMode: "battle" });
  assert.deepEqual(pendingServerStationView("devteam"), { activeStation: "devteam", dashboardMode: "radar" });
  assert.deepEqual(pendingServerStationView("calendar"), { activeStation: "day", dashboardMode: "calendar" });
  assert.deepEqual(pendingServerStationView("actions"), { activeStation: "day", dashboardMode: "actions" });
  assert.deepEqual(pendingServerStationView("advisor"), { activeStation: "radar", dashboardMode: "advisor" });

  const pending = beginServerStationNavigation(null, "executive", previous);
  assert.equal(beginServerStationNavigation(pending, "battle", { activeStation: "day", dashboardMode: "day" }), pending, "a second click is coalesced behind the in-flight navigation");
  assert.equal(serverStationSettlementFallback(pending, "executive"), null, "a committed target keeps its new view");
  assert.equal(serverStationSettlementFallback(pending, null), previous, "a failed or rejected navigation restores the previous local view");
});

test("Actions, Calendar, and Advisor use real client-side lazy boundaries", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const actionsPage = read("src/app/portal/agency/actions/_ActionsPage.tsx");
  const actionsBoundary = read("src/app/portal/agency/actions/_LazyActionsWorkspace.tsx");
  const advisorBoundary = read("src/app/portal/agency/assistant/_LazyAssistantWorkspace.tsx");

  // Server code references only the small boundary components. The sizeable
  // clients must not become direct client references in the agency page RSC
  // manifest merely because their server loader was selected conditionally.
  assert.match(page, /import\("\.\/assistant\/_LazyAssistantWorkspace"\)/);
  assert.doesNotMatch(page, /import\("\.\/assistant\/AssistantWorkspace"\)/);
  assert.match(actionsPage, /import \{ LazyActionsWorkspace \} from "\.\/_LazyActionsWorkspace"/);
  assert.doesNotMatch(actionsPage, /import \{ ActionsWorkspace[^\n]*\} from "\.\/_ActionsWorkspace"/);

  assert.match(actionsBoundary, /^"use client";/);
  assert.match(actionsBoundary, /dynamic<ActionsWorkspaceProps>\(\s*\(\) => import\("\.\/_ActionsWorkspace"\)\.then\(module => module\.ActionsWorkspace\)/);
  assert.match(actionsBoundary, /loading: \(\) => <ActionsWorkspaceLoading \/>/);
  assert.equal(actionsBoundary.split("\n").some(line => /^import\s+(?!type\b)/.test(line) && line.includes("./_ActionsWorkspace")), false);

  assert.match(advisorBoundary, /^"use client";/);
  assert.match(advisorBoundary, /dynamic<AssistantWorkspaceProps>\(\s*\(\) => import\("\.\/AssistantWorkspace"\)\.then\(module => module\.AssistantWorkspace\)/);
  assert.match(advisorBoundary, /loading: \(\) => <AssistantWorkspaceLoading \/>/);
  assert.equal(advisorBoundary.split("\n").some(line => /^import\s+(?!type\b)/.test(line) && line.includes("./AssistantWorkspace")), false);
});

test("inactive server station modules and nodes stay off the default render", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const client = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const executive = read("src/app/portal/agency/_ExecutiveCommandWorkspace.tsx");

  // Static imports would compile and initialise every station for the default
  // route even when its React node is null.
  assert.doesNotMatch(page, /^import .*AgencyActionsPage/m);
  assert.doesNotMatch(page, /^import .*AssistantWorkspace/m);
  assert.doesNotMatch(page, /^import .*DevTeamStation/m);
  assert.doesNotMatch(page, /^import .*ExecutiveCommandWorkspace/m);
  assert.doesNotMatch(page, /^import .*DynamicRadarConsole/m);
  assert.doesNotMatch(page, /^import .*NewClientButton/m);
  assert.match(page, /if \(requestedServerStation === "executive"\) \{\s*const \[\{ ExecutiveCommandWorkspace \}, serviceBrands\] = await Promise\.all\(\[\s*import\("\.\/_ExecutiveCommandWorkspace"\)/);
  assert.match(page, /if \(requestedServerStation === "calendar" \|\| requestedServerStation === "actions"\) \{\s*const \{ AgencyActionsPage \} = await import\("\.\/actions\/_ActionsPage"\)/);
  assert.match(page, /else if \(requestedServerStation === "advisor"\) \{[\s\S]*import\("\.\/assistant\/_LazyAssistantWorkspace"\)/);
  assert.match(page, /else if \(requestedServerStation === "devteam"\) \{\s*const \{ DevTeamStation \} = await import\("\.\/_DevTeamStation"\)/);
  for (const workspace of ["calendarWorkspace", "actionsWorkspace", "advisorWorkspace", "devTeamWorkspace", "executiveWorkspace"]) {
    assert.match(page, new RegExp(`let ${workspace}: ReactNode = null`));
    assert.match(page, new RegExp(`${workspace}=\\{${workspace}\\}`));
  }

  // Client state changes only after the query-driven RSC payload arrives. Any
  // action that opens Executive must navigate through that server boundary;
  // local stations can still clear it without fetching the whole page again.
  assert.match(client, /router\.replace\(href, \{ scroll: false \}\)/);
  assert.match(client, /if \(mode === "executive"\) \{\s*navigateServerStation\("executive"\)/);
  assert.match(client, /if \(mode === "battle"\) \{\s*navigateServerStation\("battle"\)/);
  assert.match(client, /<button type="button" onClick=\{\(\) => navigateServerStation\("executive"\)\} disabled=\{serverNavigationBusy\}[^>]*>[\s\S]*Back to Command Centre/, "Back uses the same pending-aware server navigation");
  assert.match(client, /DayCommandSensorPanel[^>]*onOpenRadar=\{\(\) => navigateServerStation\("executive"\)\}/);
  assert.match(client, /if \(mode === "calendar" \|\| mode === "actions" \|\| mode === "advisor"\) \{\s*navigateServerStation\(mode\)/);
  assert.match(client, /if \(mode === "devteam"\) \{\s*if \(devTeamVisible\) navigateServerStation\("devteam"\)/);
  assert.match(client, /window\.history\.replaceState\(window\.history\.state, "", href\)/);
  assert.match(client, /if \(requestedServerStation === "advisor"\) \{\s*setActiveStation\("radar"\);\s*setDashboardMode\("advisor"\)/);
  assert.match(client, /if \(requestedServerStation === "battle"\) \{\s*setActiveStation\("battle"\);\s*setDashboardMode\("battle"\)/);
  assert.match(client, /if \(requestedServerStation === "calendar" \|\| requestedServerStation === "actions"\) \{\s*setActiveStation\("day"\);\s*setDashboardMode\(requestedServerStation\)/);
  assert.match(client, /if \(!requestedServerStation\) \{[\s\S]*serverWorkspaceMissing[\s\S]*setActiveStation\("day"\);[\s\S]*setDashboardMode\("day"\)/, "removing the query cannot strand a preserved client station without its server workspace");
  assert.match(client, /devTeamWorkspace \?\? <StationLoading label="Dev Team" \/>/);
  assert.match(client, /executiveWorkspace \?\? <StationLoading label="Command Centre" \/>/);
  assert.match(client, /calendarWorkspace \?\? <StationLoading label="Command Calendar" \/>/);
  assert.match(client, /advisorWorkspace \?\? <StationLoading label="Aqua Advisor" \/>/);
  assert.match(client, /actionsWorkspace \?\? <StationLoading label="Command Centre Actions" \/>/);
  assert.match(client, /battleTablePayload \? <BattleTableWorkspace/);

  // Every server-backed station gets an immediate optimistic surface, one
  // coalesced transition, disabled controls, and a forced loading boundary.
  assert.match(client, /const \[serverStationTransitionPending, startServerStationTransition\] = useTransition\(\)/);
  assert.match(client, /if \(pendingServerNavigationRef\.current \|\| requestedServerStation === station\) return/);
  assert.match(client, /serverStationSettlementFallback\(pendingServerNavigation, requestedServerStation\)/);
  for (const station of ["executive", "battle", "devteam", "calendar", "actions", "advisor"]) {
    assert.match(client, new RegExp(`pendingServerStation === "${station}"`), `${station} needs an immediate pending surface`);
  }
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  assert.match(stationNav, /navigationPending= false|navigationPending = false/);
  assert.match(stationNav, /disabled=\{navigationPending\}/);
  assert.match(stationNav, /Loading station…/);

  // The extracted server station owns the interactive executive-only clients;
  // the default Day Command page no longer serialises or preloads them.
  assert.match(executive, /export function ExecutiveCommandWorkspace/);
  assert.match(executive, /<DynamicRadarConsole/);
  assert.match(executive, /<NewClientButton/);
});

test("the pristine Day server graph excludes Battle and full-scan providers until requested", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const battlePayload = read("src/app/portal/agency/battleTablePayload.server.ts");

  assert.match(page, /const needsBattleData = requestedServerStation === "battle"/);
  assert.match(page, /if \(needsBattleData\) \{\s*const \{ buildBattleTablePayload \} = await import\("\.\/battleTablePayload\.server"\)/);
  assert.match(page, /let battleTablePayload: BattleTablePayload \| null = null/);
  for (const eagerImport of [
    "getRequestCompanyHealth",
    "buildBrandPortfolioSnapshot",
    "listTradingCompanies",
    "listLegalDocuments",
    "listPeopleEmployees",
    "buildHiringCapacitySignals",
  ]) {
    assert.doesNotMatch(page, new RegExp(`^import .*${eagerImport}`, "m"), `${eagerImport} must stay outside pristine Day's eager graph`);
    assert.match(battlePayload, new RegExp(eagerImport), `${eagerImport} remains available inside the requested Battle boundary`);
  }
  assert.match(page, /buildPausedIntelligenceSnapshot\(workspaceSettings\.defaultCurrency/);
});

test("optional client chunks stay behind explicit station or disclosure boundaries", () => {
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const battle = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  const intelligence = read("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx");

  for (const moduleName of [
    "_ClockOutReviewDialog",
    "_CommandCentreKpiTrajectory",
    "_RadarPolicyPanel",
    "_InfraHealthPanel",
    "_FindingGroupBar",
    "_WeeklyReviewWorkspace",
  ]) {
    assert.doesNotMatch(dashboard, new RegExp(`^import \\{[^\\n]*\\} from "\\./${moduleName}"`, "m"));
    assert.match(dashboard, new RegExp(`import\\("\\./${moduleName}"\\)`));
  }

  for (const moduleName of ["_CommandIntelligenceWorkspace", "_CapitalOwnershipWorkspace", "_QuarterlyStrategyReview"]) {
    assert.doesNotMatch(battle, new RegExp(`^import \\{[^\\n]*\\} from "\\./${moduleName}"`, "m"));
    assert.match(battle, new RegExp(`import\\("\\./${moduleName}"\\)`));
  }
  assert.match(battle, /import \{ applyIntelligenceScope \} from "\.\/commandIntelligenceScope"/);
  assert.match(intelligence, /import\("\.\/_CommercialIntelligenceWorkspace"\)/);

  const defaultDeferredBytes = [
    "src/app/portal/agency/_ClockOutReviewDialog.tsx",
    "src/app/portal/agency/_CommandCentreKpiTrajectory.tsx",
    "src/app/portal/agency/_RadarPolicyPanel.tsx",
    "src/app/portal/agency/_InfraHealthPanel.tsx",
    "src/app/portal/agency/_FindingGroupBar.tsx",
    "src/app/portal/agency/_WeeklyReviewWorkspace.tsx",
  ].reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(defaultDeferredBytes > 60_000, `expected a material default split; deferred ${defaultDeferredBytes} source bytes`);
  const dashboardInitialSourceBytes = statSync("src/app/portal/agency/_DashboardCommandCenter.tsx").size;
  assert.ok(dashboardInitialSourceBytes < 220_000, `Day Command source budget exceeded: ${dashboardInitialSourceBytes} bytes`);

  const battleDrillInBytes = [
    "src/app/portal/agency/_CommandIntelligenceWorkspace.tsx",
    "src/app/portal/agency/_CapitalOwnershipWorkspace.tsx",
    "src/app/portal/agency/_QuarterlyStrategyReview.tsx",
  ].reduce((sum, file) => sum + statSync(file).size, 0);
  assert.ok(battleDrillInBytes > 180_000, `expected a material Battle drill-in split; deferred ${battleDrillInBytes} source bytes`);

  const stationSourceBudgets = [
    ["Battle", "src/app/portal/agency/_BattleTableWorkspace.tsx", 110_000],
    ["Intelligence", "src/app/portal/agency/_CommandIntelligenceWorkspace.tsx", 140_000],
    ["Radar inspector", "src/app/portal/agency/radar/RadarInspectionWorkspace.tsx", 110_000],
  ] as const;
  for (const [label, file, budget] of stationSourceBudgets) {
    const bytes = statSync(file).size;
    assert.ok(bytes < budget, `${label} first-open source budget exceeded: ${bytes}/${budget} bytes`);
  }
});
