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

const dashboard = commandCentreSource();
const inspector = readFileSync("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx", "utf8");

const DETAIL_LABELS = [
  "Oldest lead wait",
  "Outside target",
  "Awaiting reply",
  "Within target",
  "Check coverage",
  "Learning",
  "Inactive by policy",
  "Evidence assured",
  "Compound risks",
  "Sentinel mesh",
  "Properties watched",
  "Active canaries",
  "Failed probes",
  "Historical checks",
  "Baseline coverage",
  "Evidence samples",
  "Pattern breaks",
  "Lead conversion",
  "Portfolio retention",
  "Churned in 90d",
  "Cancellation risk",
  "Lifecycle checks",
] as const;

const HEADLINE_LABELS = ["Health", "Confidence", "Setup", "Critical", "Warnings", "Checks live", "Learning", "Blind"] as const;
const MEMORY_LABELS = ["New", "Worsening", "Recovered", "Recurring", "Flapping", "Oldest open"] as const;
const EVIDENCE_LABELS = ["KPI streams", "Baselines ready", "Pattern breaks", "Recording gaps"] as const;
const COMMERCIAL_LABELS = ["Leads retained", "Converted", "Retention", "Pending exits"] as const;

test("every headline Radar metric is clickable and explains its calculation", () => {
  for (const label of HEADLINE_LABELS) {
    const line = dashboard.split("\n").find(candidate => candidate.includes("<RadarMetric") && candidate.includes(`label="${label}"`));
    assert.ok(line, `${label} must render as a headline Radar metric`);
    assert.match(line, /detail="[^"]+"/, `${label} must explain its calculation`);
    assert.match(line, /onExplain={setMetricHelp}/, `${label} must open the shared explanation panel`);
    assert.match(line, /onClick=/, `${label} must provide a drill-down`);
  }
  assert.match(dashboard, /function RadarMetric\([\s\S]+?<button type="button"/);
  assert.match(dashboard, /aria-label={`Explain \$\{label\}`}/);
  assert.match(dashboard, /<Info size=\{13\}/);
  assert.match(dashboard, /role="status" aria-live="polite"/);
  assert.match(dashboard, /aria-label="Close metric explanation"/);
});

test("every Radar summary detail is an accessible drill-down", () => {
  for (const label of DETAIL_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(dashboard, new RegExp(`<RadarDetail label="${escaped}"[^>]+onClick=`), `${label} must provide a drill-down`);
  }
  assert.match(dashboard, /function RadarDetail\([\s\S]+?<button type="button"/);
  assert.match(dashboard, /aria-label={`Inspect \$\{label\}: \$\{value\}`}/);
  assert.match(dashboard, /<ArrowUpRight size=\{11\}/);
});

test("Radar memory, evidence, commercial cohorts, and scanner rows all expose inspection actions", () => {
  for (const label of [...MEMORY_LABELS, ...EVIDENCE_LABELS]) {
    const line = dashboard.split("\n").find(candidate => candidate.includes("<RadarMemoryStat") && candidate.includes(`label="${label}"`));
    assert.ok(line, `${label} must render as a Radar memory statistic`);
    assert.match(line, /onClick=/, `${label} must provide a drill-down`);
  }
  for (const label of COMMERCIAL_LABELS) {
    assert.match(dashboard, new RegExp(`<RadarDetail label="${label}"[^>]+onClick=`), `${label} must provide a drill-down`);
  }
  assert.match(dashboard, /aria-label="Inspect assurance memory"/);
  assert.match(dashboard, /aria-label="Inspect durable evidence vault"/);
  assert.match(dashboard, /aria-label="Inspect commercial lifecycle checks"/);
  assert.match(dashboard, /aria-label={`Inspect baseline coverage:/);
  assert.match(dashboard, /aria-label={`Inspect evidence movement \$\{movement\.familyLabel\}`}/);
  assert.match(dashboard, /aria-label={`Inspect commercial cohort \$\{cohort\.label\}`}/);
  assert.match(dashboard, /aria-label={`Inspect \$\{radar\.summary\.totalChecks\.toLocaleString\(\)\}-point scanner`}/);
  assert.match(dashboard, /aria-label={`Inspect \$\{activeDomain === "all" \? "whole business" : domainLabel\(activeDomain\)\} scanner ledger`}/);
  assert.match(dashboard, /aria-label={`Inspect incident \$\{issue\.title\}`}/);
  assert.match(dashboard, /aria-label={`Inspect Radar check \$\{check\.title\}`}/);
});

test("Radar drill-down targets preserve aggregate filters in the inspector", () => {
  assert.match(dashboard, /initialStatus={inspectorTarget\.status}/);
  assert.match(dashboard, /initialScope={inspectorTarget\.scope}/);
  assert.match(dashboard, /initialLens={inspectorTarget\.lens}/);
  assert.match(inspector, /initialStatus = "all"/);
  assert.match(inspector, /initialScope = "all"/);
  assert.match(inspector, /initialLens = "all"/);
  assert.match(inspector, /filter === "applicable"/);
  assert.match(inspector, /filter === "assured"/);
  assert.match(inspector, /filter === "firing"/);
  assert.match(inspector, /filter === "live"/);
  assert.match(inspector, /filter === "sentinel"/);
  assert.match(inspector, /scope === "source" \|\| scope === "property" \|\| scope === "synthetic" \|\| scope === "watchdog"/);
});

test("commercial, canary, evidence, and correlation summaries open their exact evidence families", () => {
  for (const target of [
    "awaiting-response",
    "target-breaches",
    "speed-to-lead",
    "lead-conversion-rate",
    "portfolio-retention",
    "recent-client-churn",
    "pending-cancellations",
    "commercial:lifecycle",
  ]) assert.match(dashboard, new RegExp(target.replace(":", "\\:")));
  assert.match(dashboard, /status: "attention", scope: "synthetic", lens: "connection"/);
  assert.match(dashboard, /status: "firing", scope: "history", lens: "anomaly"/);
  assert.match(dashboard, /scope: "history", lens: "baseline"/);
  assert.match(dashboard, /tab: "incidents", query: "correlation:"/);
  assert.match(inspector, /IncidentInspection radar={radar} query={query} domain={domain}/);
  assert.match(inspector, /status={status}/);
  assert.match(inspector, /matchesIncidentStatus/);
  assert.match(inspector, /JSON\.stringify\(item\)\.toLowerCase\(\)\.includes\(normalized\)/);
});
