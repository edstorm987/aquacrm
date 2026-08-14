import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Radar exposes a first-class KPI scorecard backed by checks, signals, policy, and evidence", () => {
  const page = read("src/app/portal/agency/radar/page.tsx");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const workspace = read("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx");

  assert.match(page, /station: "radar-inspector"/);
  assert.match(dashboard, /radarInspectionTab\(searchParams\.get\("view"\)\)/);
  assert.match(dashboard, /initialTab=\{inspectorTarget\.tab\}/);
  assert.match(workspace, /"kpis", "KPI scorecard"/);
  assert.match(workspace, /data-testid="radar-kpi-scorecard"/);
  assert.match(workspace, /Business KPI scorecard/);
  assert.match(workspace, /buildKpiScorecard\(radar, evidence\)/);
  assert.match(workspace, /check\.scope !== "kpi"/);
  assert.match(workspace, /radar\.signals/);
  assert.match(workspace, /policy\?\.targetValue/);
  assert.match(workspace, /warningTolerancePercent/);
  assert.match(workspace, /criticalTolerancePercent/);
  assert.match(workspace, /domainConfidencePercent/);
  assert.match(workspace, /evidenceSamples/);
  assert.match(workspace, /Actual/);
  assert.match(workspace, /Target/);
  assert.match(workspace, /Variance/);
  assert.match(workspace, /Movement/);
  assert.match(workspace, /Inspect all checks/);
  assert.match(workspace, /Open evidence history/);
});
