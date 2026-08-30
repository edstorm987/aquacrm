import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// NOTE (2026-08-29): the Command Centre's radar UI now lives in TWO files.
// `BusinessRadarDashboard` and its eight helpers were lifted out of
// `_DashboardCommandCenter.tsx` (2,787 → 2,050 lines) and are loaded lazily,
// because dev-server memory grows per compiled route and this was the largest
// route graph in the app.
//
// These assertions are about the radar SURFACE, not about which file holds it,
// so the source is read as both files concatenated. An assertion that pinned
// the location would fail on a refactor while a real regression — the markup
// disappearing — still passed.
function commandCentreSource(): string {
  return [
    "src/app/portal/agency/_DashboardCommandCenter.tsx",
    "src/app/portal/agency/_BusinessRadarDashboard.tsx",
    "src/app/portal/agency/_radarShared.ts",
  ].map(file => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
}

const read = (path: string) => readFileSync(path, "utf8");

test("legacy Radar links preserve their inspector state inside Command Centre", () => {
  const page = read("src/app/portal/agency/radar/page.tsx");
  const route = read("src/app/api/portal/advisor/radar/evidence/route.ts");
  assert.match(page, /redirect/);
  assert.match(page, /station: "radar-inspector"/);
  assert.match(page, /"view", "query", "domain", "status", "scope", "lens", "source", "dataset"/);
  assert.match(page, /params\.set\(key, value\.trim\(\)\.slice\(0, 240\)\)/);
  assert.match(page, /redirect\(`\/portal\/agency\?\$\{params\.toString\(\)\}`\)/);
  // Was `requireRole(["agency-owner","agency-manager"])`. Replaced 2026-08-27
  // (issue #182) by an ELEMENT requirement, which is strictly stronger: a role
  // check passes a manager whose element access has been narrowed, and the AI
  // then answers from data the UI hides from them.
  assert.match(route, /requireAssistantElement\("workspace\.overview"\)/);
  assert.doesNotMatch(route, /requireRole\(/, "the Radar evidence route is back on a role check");
  assert.match(route, /session\.agencyId/);
  assert.match(route, /cache-control/);
  assert.match(route, /private, no-store/);
  assert.match(route, /seriesId\.length > 240/);
});

test("evidence inspection exposes an index, complete series, and archive without agency leakage", () => {
  const vault = read("src/engines/data/server/radar/radarEvidenceVault.ts");
  const route = read("src/app/api/portal/advisor/radar/evidence/route.ts");
  assert.match(vault, /inspectRadarEvidence\(/);
  assert.match(vault, /inspectRadarEvidenceSeries\(/);
  assert.match(vault, /recentPoints: series\.points\.slice\(-24\)/);
  assert.match(vault, /points: series\.points\.map/);
  assert.match(vault, /hourly: series\.hourly\.map/);
  assert.match(route, /format.*=== "json"/s);
  assert.match(route, /content-disposition/);
  assert.doesNotMatch(vault, /agencyId: series\.agencyId/);
});

test("manual inspection covers every Radar layer and links from Command Centre", () => {
  const workspace = read("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx");
  const dashboard = commandCentreSource();
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  assert.match(stationNav, /label="Command Centre"/);
  assert.doesNotMatch(stationNav, /Radar workspace/);
  assert.doesNotMatch(stationNav, /KPI Intelligence/);
  assert.match(dashboard, /CommandInstrumentDock/);
  assert.match(dashboard, /Open Radar Workspace/);
  assert.match(dashboard, /Open KPI Intelligence/);
  assert.match(dashboard, /Back to Command Centre/);
  assert.match(dashboard, /Data inspector/);
  assert.match(dashboard, /initialTab=\{inspectorTarget\.tab\}/);
  assert.match(dashboard, /initialDomain=\{inspectorTarget\.domain\}/);
  assert.match(dashboard, /initialStatus=\{inspectorTarget\.status\}/);
  assert.match(dashboard, /initialScope=\{inspectorTarget\.scope\}/);
  assert.match(dashboard, /initialLens=\{inspectorTarget\.lens\}/);
  assert.match(dashboard, /<RadarInspectionWorkspace[^>]* embedded \/>/s);
  assert.match(dashboard, /initialSourceId=\{inspectorTarget\.sourceId\}/);
  assert.match(dashboard, /initialDatasetId=\{inspectorTarget\.datasetId\}/);
  assert.match(dashboard, /searchParams\.get\("station"\) !== "radar-inspector"/);
  assert.match(dashboard, /onOpenInspector/);
  assert.match(dashboard, /Data inspector/);
  assert.match(dashboard, /Inspect raw findings/);
  assert.match(dashboard, /Inspect source records/);
  assert.match(dashboard, /Inspect.*samples/);
  assert.match(dashboard, /initialQuery=\{inspectorTarget\.query\}/);
  assert.match(dashboard, /initialDomain=\{inspectorTarget\.domain\}/);
  assert.match(workspace, /initialTab: InspectionTab/);
  assert.match(workspace, /Browse source records/);
  assert.match(workspace, /Inspect source records/);
  assert.match(workspace, /setQuery\(check\.sourceId\)/);
  assert.match(workspace, /sourceIds\.includes\(check\.sourceId\)/);
  assert.match(workspace, /Complete scanner ledger/);
  assert.match(workspace, /Resolved policy/);
  assert.match(workspace, /Evidence used/);
  assert.match(workspace, /Raw check record/);
  assert.match(workspace, /CHECK_BATCH_SIZE = 200/);
  assert.match(workspace, /checks\.slice\(0, visibleCheckCount\)/);
  assert.match(workspace, /Load.*more/);
  assert.match(workspace, /checks\.find\(check => check\.id === selectedCheckId\)/);
  assert.match(workspace, /filteredSeries\.find\(series => series\.id === selectedSeriesId\)/);
  assert.match(workspace, /Load every retained point/);
  assert.match(workspace, /Domain rollups/);
  assert.match(workspace, /Source coverage/);
  assert.match(workspace, /Metric signals/);
  assert.match(workspace, /Grouped incidents/);
  assert.match(workspace, /Underlying findings/);
  assert.match(workspace, /Exact incident breakdown/);
  assert.match(workspace, /Exact underlying issues/);
  assert.match(workspace, /Exact detector checks/);
  assert.match(workspace, /selectedIncident\.issueIds\.includes\(item\.id\)/);
  assert.match(workspace, /selectedIncident\.checkIds\.map/);
  assert.match(workspace, /Full calculation/);
  assert.match(dashboard, /What exactly/);
  assert.match(dashboard, /Exact breakdown/);
  assert.match(dashboard, /issue\.issueIds\.length.*underlying issue/);
  assert.match(dashboard, /issue\.checkIds\.length.*exact check/);
  assert.match(workspace, /Full evidence history/);
  assert.match(workspace, /Source records/);
  assert.match(workspace, /Operational source catalogue/);
  assert.match(workspace, /JSON\.stringify\(check, null, 2\)/);
  assert.doesNotMatch(workspace, /\.slice\(0, 240\)/);
});
