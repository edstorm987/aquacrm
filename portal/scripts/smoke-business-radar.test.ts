import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { AdvisorDomain } from "../src/engines/data/radar/businessRadar";
import { buildRadarCheckMatrix } from "../src/engines/data/radar/radarCheckEngine";
import type { RadarObservation } from "../src/engines/data/radar/radarCheckEngine";
import { buildRadarCorrelationIssues } from "../src/engines/data/radar/radarCorrelations";
import { applyAdaptiveRadarPolicy } from "../src/engines/data/radar/radarPolicyEngine";
import { buildPropertySentinelChecks, buildRadarWatchdogChecks, buildSourceSentinelChecks } from "../src/engines/data/radar/radarSentinels";
import { buildSyntheticCanaryChecks } from "../src/engines/data/radar/radarSyntheticChecks";
import { isReservedSyntheticHostname, isUnsafeSyntheticAddress } from "../src/engines/data/radar/radarSyntheticSafety";
import type { RadarTelemetrySnapshot } from "../src/engines/data/server/radar/radarTelemetry";
import type { RadarPolicyConfiguration } from "../src/server/types";
import { BUSINESS_RADAR_RULE_CATALOG, RADAR_CHECKS_PER_DOMAIN, RADAR_RULE_LENSES, RADAR_SIGNAL_FAMILIES } from "../src/engines/data/radar/radarRuleCatalog";

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

test("business radar measures speed to lead against configurable guardrails", () => {
  const radar = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const settings = read("src/server/agencySettings.ts");
  const settingsUi = read("src/app/portal/agency/settings/SettingsTabs.tsx");
  assert.match(radar, /firstRespondedAt/);
  assert.match(radar, /awaitingResponseCount/);
  assert.match(radar, /withinTargetPercent/);
  assert.match(radar, /metric:speed-to-lead-breach/);
  assert.match(settings, /speedToLeadTargetMinutes: 5/);
  assert.match(settings, /speedToLeadWarningMinutes: 15/);
  assert.match(settings, /speedToLeadCriticalMinutes: 60/);
  assert.match(settingsUi, /Advisor guardrails/);
});

test("radar declares coverage and includes every installed module", () => {
  const radar = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const context = read("src/lib/server/assistants/advisorContext.ts");
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  assert.match(radar, /for \(const install of installs\)/);
  assert.match(radar, /module:\$\{install\.pluginId\}/);
  assert.match(radar, /coverage:business-blind-spots/);
  assert.match(radar, /Advisor conclusions may miss work completed elsewhere/);
  assert.match(context, /businessRadar/);
  assert.match(route, /buildBusinessIssueRadar/);
});

test("priority business signals are independently connected and inspectable", () => {
  const radar = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const sources = read("src/engines/data/server/radar/radarSourceInspection.ts");
  const workspace = read("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx");
  for (const sourceId of ["external:website-enquiries", "external:response-time-clocks", "core:website-telemetry", "external:inbox-messages", "core:calendar-commitments"]) {
    assert.match(radar, new RegExp(sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sources, /Lead response clocks/);
  assert.match(sources, /Calendar commitments/);
  assert.match(workspace, /Connection and coverage centre/);
  assert.match(workspace, /Priority signal mesh/);
  assert.match(workspace, /sourceConnectionState/);
  assert.match(workspace, /Activate:/);
});

test("critical radar findings survive model omission and reach visible Advisor UI", () => {
  const advisor = read("src/lib/server/assistants/openaiAssistant.ts");
  const drawer = read("src/components/chrome/GlobalAdvisorDrawer.tsx");
  const quickLook = read("src/components/chrome/RadarQuickLookButton.tsx");
  const workspace = read("src/app/portal/agency/assistant/AssistantWorkspace.tsx");
  assert.match(advisor, /guaranteedRadarActions/);
  assert.match(advisor, /BUSINESS RADAR findings are deterministic/);
  assert.match(advisor, /mergeAdvisorActions/);
  assert.match(advisor, /if \(guaranteedRadarActions\.length\) return guaranteedRadarActions/);
  assert.doesNotMatch(drawer, /issues need attention/);
  assert.match(drawer, /reply ready/);
  assert.match(quickLook, /alerts need attention/);
  assert.match(workspace, /Business radar/);
  assert.match(workspace, /Speed to lead/);
  assert.match(workspace, /Review radar/);
});

test("the main dashboard exposes an active, actionable radar mode", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  const dashboard = commandCentreSource();
  const policyPanel = read("src/app/portal/agency/_RadarPolicyPanel.tsx");
  assert.match(page, /getCachedBusinessIssueRadar/);
  assert.match(page, /businessRadar=\{businessRadar\}/);
  assert.match(dashboard, /Active business radar/);
  assert.match(dashboard, /automatic rescan every minute/);
  assert.match(dashboard, /\/api\/portal\/advisor\/radar/);
  assert.match(dashboard, /Check coverage by business area/);
  assert.match(dashboard, /addRadarTask/);
  assert.match(stationNav, /Radar findings automatically join your strict priority queue/);
  assert.match(dashboard, /applicable checks/);
  assert.match(dashboard, /RadarPolicyPanel/);
  assert.match(policyPanel, /Radar operating policy/);
  assert.match(dashboard, /Health/);
  assert.match(dashboard, /Compound risks/);
});

test("the Command Centre exposes twenty source-backed decision KPIs and dedicated intelligence diagrams", () => {
  const snapshot = read("src/lib/server/commandIntelligenceService.ts");
  const workspace = read("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx");
  const trajectory = read("src/app/portal/agency/_CommandCentreKpiTrajectory.tsx");
  const daySensor = read("src/app/portal/agency/_DayCommandSensorPanel.tsx");
  const dashboard = commandCentreSource();
  const stationNav = read("src/app/portal/agency/_CommandStationNav.tsx");
  const page = read("src/app/portal/agency/page.tsx");
  const kpiIds = [...snapshot.matchAll(/makeKpi\(\{ id: "([^"]+)"/g)].map(match => match[1]);

  assert.equal(kpiIds.length, 20);
  assert.equal(new Set(kpiIds).size, 20);
  assert.match(snapshot, /MARKETING_CUSTOMER_PROFILES_KEY/);
  assert.match(snapshot, /buildCampaignRows/);
  assert.match(snapshot, /buildAudienceLocations/);
  assert.match(snapshot, /buildAudienceSignals/);
  assert.match(snapshot, /hydrateCommandEvidence/);
  assert.match(snapshot, /inspectRadarEvidenceSeries/);
  assert.match(snapshot, /sourceCohorts: radar\.commercial\.cohorts/);
  assert.doesNotMatch(snapshot, /Math\.random/);
  assert.match(workspace, /AudienceMap/);
  assert.match(workspace, /SignalBank/);
  assert.match(workspace, /CampaignPortfolioSummary/);
  assert.match(workspace, /DemandFlow/);
  assert.match(workspace, /KpiInspector/);
  assert.match(workspace, /KpiComparisonWorkspace/);
  for (const range of ["90d", "quarter", "ytd", "12m", "custom"]) assert.match(workspace, new RegExp(`"${range}"`));
  assert.match(workspace, /ComparisonChart/);
  assert.match(workspace, /PlanGapChart/);
  assert.match(workspace, /PlanningAssumptions/);
  assert.match(workspace, /Actual progress against required pace and forecast/);
  assert.match(workspace, /directionalShortfall/);
  assert.doesNotMatch(workspace, /KPI_PLAN_OVERRIDES_KEY|kpi-plan-overrides/, "KPI targets converge through the server API, not a browser-only override ledger");
  assert.match(workspace, /SAVED_COMPARISON_KEY/);
  assert.match(workspace, /type="date"/);
  assert.match(workspace, /data-kpi-id=\{kpi\.id\}/);
  assert.match(trajectory, /Five primary stations/i);
  assert.match(trajectory, /CommandCentreKpiTrajectory/);
  assert.match(trajectory, /COMMAND CENTRE · DECISION TREND ARRAY/);
  assert.match(trajectory, /Executive KPI trajectory/);
  assert.match(trajectory, /Open all five primary KPI stations in Intelligence/);
  assert.match(trajectory, /COMMAND_PRIMARY_KPI_STATIONS/);
  assert.match(daySensor, /Radar and primary instruments/);
  assert.match(daySensor, /COMMAND_PRIMARY_KPI_STATIONS/);
  assert.match(daySensor, /Open .* intelligence from Day Command/);
  assert.match(dashboard, /DayCommandSensorPanel/);
  assert.doesNotMatch(stationNav, /KPI Intelligence/);
  assert.doesNotMatch(stationNav, /Radar workspace/);
  assert.doesNotMatch(stationNav, /Omega Dashboard/);
  assert.match(dashboard, /CommandCentreKpiTrajectory/);
  assert.match(dashboard, /CommandInstrumentDock/);
  assert.match(dashboard, /Open KPI Intelligence/);
  assert.match(dashboard, /Open Radar Workspace/);
  assert.match(dashboard, /Back to Command Centre/);
  assert.match(dashboard, /data-testid="unified-command-centre"/);
  assert.match(dashboard, /CommandIntelligenceWorkspace/);
  assert.match(dashboard, /requestedStation \?\? "day"/);
  assert.ok(stationNav.indexOf('label="Day command"') < stationNav.indexOf('label="Command Centre"'));
  assert.match(dashboard, /if \(value === "omega"\) return "executive"/);
  assert.match(page, /buildCommandIntelligenceSnapshot/);
  assert.match(page, /intelligenceSnapshot=\{intelligenceSnapshot\}/);
  assert.match(snapshot, /baselineValue/);
  assert.match(snapshot, /targetValue/);
  assert.match(snapshot, /Company monthly revenue target/);
  assert.match(snapshot, /id: "revenue-growth"/);
  assert.match(snapshot, /Formula: \(current month - previous month\) \/ previous month x 100/);
  assert.match(snapshot, /revenueGrowthStatus/);
  const intelligenceTypes = read("src/lib/intelligence/commandIntelligence.ts");
  for (const kpiId of ["revenue-growth", "traffic-7d", "revenue-target", "business-health", "client-attention"]) assert.match(intelligenceTypes, new RegExp(`kpiId: "${kpiId}"`));
  assert.match(read("src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx"), /"No baseline"/);
  assert.match(snapshot, /Configured .*minute first-response SLA/);
  assert.match(snapshot, /buildRadarTelemetrySnapshot/);
  assert.match(snapshot, /buildIntelligenceScopes/);
  assert.match(snapshot, /websiteScopeReadings/);
  assert.match(snapshot, /Whole Aqua ecosystem/);
  assert.match(workspace, /IntelligenceScopeBar/);
  assert.match(workspace, /applyIntelligenceScope/);
  assert.match(workspace, /aria-label="Intelligence scope"/);
  assert.match(workspace, /exact evidence only/);
  assert.match(workspace, /kpi\.scope\.label/);
  assert.match(workspace, /Radar will not borrow Aqua-wide figures/);
  assert.match(dashboard, /initialScopeId=\{intelligenceEntry\.scopeId\}/);
  assert.match(dashboard, /searchParams\.get\("scope"\)/);
  assert.match(snapshot, /buildCommercialIntelligence/);
  assert.match(workspace, /CommercialIntelligenceWorkspace/);
  assert.match(workspace, /label="Lifecycle"/);
  const commercialWorkspace = read("src/app/portal/agency/_CommercialIntelligenceWorkspace.tsx");
  assert.match(commercialWorkspace, /Marketing-to-client control/);
  assert.match(commercialWorkspace, /Commercial metric register/);
  assert.match(commercialWorkspace, /Customer and lead ledger/);
  assert.match(commercialWorkspace, /Acquisition source matrix/);
  assert.match(commercialWorkspace, /FormulaInspector/);
});

test("the command Radar shows its last full run and can force a complete persisted scan", () => {
  const executive = read("src/app/portal/agency/_ExecutiveCommandWorkspace.tsx");
  const console = read("src/app/portal/agency/_DynamicRadarConsole.tsx");
  const control = read("src/app/portal/agency/_RadarScanControl.tsx");
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  // The full-scan orchestration lives in the sweep scheduler (radar upgrade Stage 1);
  // the route delegates to runRadarFullSweep. Same behaviour, relocated home.
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  assert.match(executive, /DynamicRadarConsole/);
  assert.match(console, /RadarScanControl/);
  assert.match(executive, /initialLastRunAt=\{businessRadar\.memory\.lastSweepAt\}/);
  assert.match(control, /Last full scan/);
  assert.match(control, /Never · Run one now/);
  assert.match(control, /Run full scan/);
  assert.match(control, /Scanning all systems/);
  assert.match(control, /Scan complete/);
  assert.match(control, /Scan failed · Retry/);
  assert.match(control, /fetch\("\/api\/portal\/advisor\/radar", \{ method: "POST", cache: "no-store" \}\)/);
  assert.match(route, /async function runFullRadarScan/);
  assert.match(route, /runRadarFullSweep\(session\.agencyId\)/);
  assert.match(sweeps, /runAgencySyntheticProbes\(agencyId, \{ force: true \}\)/);
  assert.match(sweeps, /recordRadarSweep\(agencyId, radar\)/);
  assert.match(sweeps, /recordRadarEvidence\(agencyId, radar\)/);
  assert.match(sweeps, /reconcileAgencyTasksWithRadar\(agencyId, radar\)/);
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /export async function POST\(\)/);
  assert.match(commandCentreSource(), /method: showBusy \? "POST" : "GET"/);
  assert.match(read("src/engines/data/server/radar/radarMemory.ts"), /lastSweepAt: includeCurrentSweep \? now : memory\?\.lastSweepAt/);
});

test("every radar domain carries at least 140 deterministic checks", () => {
  const domains = Object.keys(RADAR_SIGNAL_FAMILIES) as AdvisorDomain[];
  assert.equal(domains.length, 12);
  assert.equal(RADAR_RULE_LENSES.length, 12);
  assert.equal(RADAR_CHECKS_PER_DOMAIN, 144);
  assert.ok(BUSINESS_RADAR_RULE_CATALOG.length >= domains.length * RADAR_CHECKS_PER_DOMAIN);
  for (const domain of domains) {
    assert.ok(RADAR_SIGNAL_FAMILIES[domain].length >= 12, `${domain} should retain at least 12 metric families`);
    assert.ok(BUSINESS_RADAR_RULE_CATALOG.filter(rule => rule.domain === domain).length >= 144, `${domain} should retain at least 144 checks`);
  }
});

test("missing observations become explicit blind checks instead of false passes", () => {
  const matrix = buildRadarCheckMatrix([], [], Date.UTC(2026, 7, 11));
  assert.equal(matrix.checks.length, BUSINESS_RADAR_RULE_CATALOG.length);
  assert.equal(matrix.checks.every(check => check.status === "blind"), true);
  assert.equal(matrix.domains.every(domain => domain.totalChecks >= 144 && domain.blindChecks === domain.totalChecks && domain.coveragePercent === 0 && domain.assurancePercent === 0), true);
});

test("every domain accounts for assured, watch, and blind outcomes without ambiguity", () => {
  const now = Date.UTC(2026, 7, 11);
  const matrix = buildRadarCheckMatrix(
    [observed("marketing", "traffic-7d", 120, "120 pageviews", now)],
    [{ id: "test:marketing", domain: "marketing", label: "Marketing telemetry", status: "connected", recordCount: 120, lastActivityAt: now, detail: "Test source." }],
    now,
  );
  const trafficChecks = matrix.checks.filter(check => check.domain === "marketing" && check.familyId === "traffic-7d");
  assert.equal(trafficChecks.length, 12);
  assert.deepEqual(new Set(trafficChecks.map(check => check.lens)), new Set(RADAR_RULE_LENSES.map(lens => lens.id)));
  assert.equal(trafficChecks.some(check => check.status === "blind"), false);
  assert.equal(matrix.domains.every(domain => domain.assuredChecks + domain.watchChecks + domain.blindChecks === domain.totalChecks), true);
});

test("radar correlates independent observations into compound business risks", () => {
  const now = Date.UTC(2026, 7, 11);
  const observations: RadarObservation[] = [
    observed("marketing", "traffic-7d", 120, "120 pageviews", now),
    observed("marketing", "form-submissions", 0, "0 forms", now),
    observed("marketing", "conversions", 0, "0 conversions", now),
    observed("sales", "enquiries-7d", 8, "8 enquiries", now),
    observed("sales", "awaiting-response", 3, "3 waiting", now),
  ];
  const issues = buildRadarCorrelationIssues(observations, [], now);
  assert.equal(issues.some(issue => issue.id === "correlation:traffic-conversion-leak"), true);
  assert.equal(issues.some(issue => issue.id === "correlation:demand-response-pressure"), true);
});

test("radar adds source, property, and self-watchdog sentinel packs", () => {
  const now = Date.UTC(2026, 7, 11);
  const coverage = [{ id: "test:marketing", domain: "marketing" as const, label: "Marketing telemetry", status: "connected" as const, recordCount: 120, lastActivityAt: now, detail: "Test source." }];
  const telemetry: RadarTelemetrySnapshot = {
    properties: [{
      id: "property-1",
      label: "Test website",
      href: "/portal/agency/performance",
      publicUrl: "https://example.org",
      expectedLive: true,
      tagDeclared: true,
      lastSeenAt: now,
      current7d: 120,
      previous7d: 100,
      pageviews24h: 20,
      forms24h: 2,
      forms7d: 8,
      conversions7d: 8,
      errors24h: 0,
      heartbeats24h: 1,
      averageLoadMs: 900,
      searchImpressions28d: 200,
      searchClicks28d: 20,
      events: [],
    }],
    issues: [],
    totals: {
      properties: 1,
      expectedProperties: 1,
      connectedTags: 1,
      staleTags: 0,
      pageviews24h: 20,
      pageviews7d: 120,
      previousPageviews7d: 100,
      forms24h: 2,
      forms7d: 8,
      conversions7d: 8,
      errors24h: 0,
      heartbeats24h: 1,
      trafficSurges: 0,
      trafficDrops: 0,
      slowProperties: 0,
      searchImpressions28d: 200,
      searchClicks28d: 20,
      averageLoadMs: 900,
      latestEventAt: now,
    },
  };
  const catalog = buildRadarCheckMatrix([], [], now).checks;
  const sources = buildSourceSentinelChecks(coverage, now);
  const properties = buildPropertySentinelChecks(telemetry, now);
  const synthetic = buildSyntheticCanaryChecks(telemetry, {
    "property-1": {
      id: "synthetic:property-1",
      agencyId: "agency-1",
      propertyId: "property-1",
      label: "Test website",
      url: "https://example.org",
      checkedAt: now,
      durationMs: 450,
      ok: true,
      statusCode: 200,
      finalUrl: "https://example.org/",
      redirectCount: 0,
      dnsAddresses: ["93.184.216.34"],
      contentType: "text/html",
      htmlBytes: 12_000,
      titleDetected: true,
      formsDetected: 1,
      tagDetected: true,
      tlsValid: true,
      tlsExpiresAt: now + 90 * 86_400_000,
      tlsDaysRemaining: 90,
      securityHeaders: {
        strictTransportSecurity: true,
        contentSecurityPolicy: true,
        frameProtection: true,
        contentTypeOptions: true,
        referrerPolicy: true,
        permissionsPolicy: true,
      },
    },
  }, now);
  const watchdogs = buildRadarWatchdogChecks({ checks: [...catalog, ...sources, ...properties, ...synthetic], coverage, telemetry, correlationIssues: [], now });
  assert.equal(sources.length, 8);
  assert.equal(properties.length, 12);
  assert.equal(synthetic.length, 12);
  assert.equal(watchdogs.length, 16);
  assert.equal(sources.every(check => check.scope === "source"), true);
  assert.equal(properties.every(check => check.scope === "property"), true);
  assert.equal(synthetic.every(check => check.scope === "synthetic"), true);
  assert.equal(synthetic.every(check => check.status !== "blind"), true);
  assert.equal(watchdogs.every(check => check.scope === "watchdog"), true);
});

test("radar actively probes every expected live property with SSRF-safe canaries", () => {
  const probes = read("src/engines/data/server/radar/radarSyntheticProbes.ts");
  const checks = read("src/engines/data/radar/radarSyntheticChecks.ts");
  const types = read("src/server/types.ts");
  const storage = read("src/server/storage.ts");
  const radar = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  const dashboard = commandCentreSource();
  assert.match(probes, /assertPublicDestination/);
  assert.match(probes, /isUnsafeSyntheticAddress/);
  assert.match(probes, /redirect: "manual"/);
  assert.match(probes, /MAX_REDIRECTS = 5/);
  assert.match(probes, /HARD_TARGET_TIMEOUT_MS = 12_000/);
  assert.match(probes, /MAX_HTML_BYTES = 128 \* 1024/);
  assert.match(probes, /inspectTls/);
  assert.match(probes, /inspectSecurityHeaders/);
  assert.match(probes, /runWithConcurrency/);
  assert.match(checks, /buildSyntheticCanaryChecks/);
  assert.match(checks, /buildSyntheticCanaryIssues/);
  assert.match(checks, /Aqua Tag marker/);
  assert.match(types, /RadarSyntheticProbeResult/);
  assert.match(storage, /radarSyntheticProbes: parsed\.radarSyntheticProbes \?\? \{\}/);
  assert.match(radar, /syntheticSentinels/);
  // Deep sweep force/cadence split lives in the sweep scheduler (Stage 1): the
  // full sweep forces every probe; the scheduled sweep respects probe cadence.
  assert.match(sweeps, /runAgencySyntheticProbes\(agencyId, \{ force: true \}\)/);
  assert.match(sweeps, /runAgencySyntheticProbes\(agencyId\)/);
  assert.match(dashboard, /Synthetic canaries/);
  assert.match(dashboard, /Failed probes/);
  for (const address of ["127.0.0.1", "10.0.0.7", "172.16.1.1", "192.168.4.5", "169.254.169.254", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isUnsafeSyntheticAddress(address), true, `${address} must be blocked`);
  }
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) {
    assert.equal(isUnsafeSyntheticAddress(address), false, `${address} should be publicly routable`);
  }
  for (const hostname of ["localhost", "app.local", "service.internal", "fixture.test", "sample.example"]) {
    assert.equal(isReservedSyntheticHostname(hostname), true, `${hostname} must be blocked`);
  }
});

test("radar retains temporal memory, recovery, and source-flapping evidence", () => {
  const memory = read("src/engines/data/server/radar/radarMemory.ts");
  const storage = read("src/server/storage.ts");
  const types = read("src/server/types.ts");
  const radarRoute = read("src/app/api/portal/advisor/radar/route.ts");
  const cron = read("src/app/api/cron/inbox/route.ts");
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  const dashboard = commandCentreSource();
  const advisor = read("src/lib/server/assistants/advisorSkillContext.ts");
  assert.match(types, /RadarMemoryState/);
  assert.match(storage, /radarMemory: parsed\.radarMemory \?\? \{\}/);
  assert.match(memory, /recordRadarSweep/);
  assert.match(memory, /recoveredAt/);
  assert.match(memory, /flapCount/);
  assert.match(memory, /buildRadarMemoryIssues/);
  assert.match(memory, /Radar evidence assurance dropped sharply/);
  assert.match(memory, /new blind check/);
  assert.match(memory, /RECENT_SCAN_LIMIT = 180/);
  assert.match(memory, /HOURLY_ROLLUP_LIMIT = 24 \* 30/);
  // The sweep scheduler records the sweep and rebuilds the Pulse; the cron loop
  // drives it per agency and reports the results as radarSweeps.
  assert.match(sweeps, /recordRadarSweep/);
  assert.match(radarRoute, /invalidateBusinessIssueRadarCache/);
  assert.match(cron, /radarSweeps/);
  assert.match(sweeps, /buildBusinessIssueRadar/);
  assert.match(dashboard, /Temporal continuity live/);
  assert.match(dashboard, /Assurance memory/);
  assert.match(dashboard, /Recovered/);
  assert.match(dashboard, /Flapping/);
  assert.match(advisor, /memory: radar\.memory/);
});

test("radar retains every KPI in a durable evidence vault with historical detectors", () => {
  const vault = read("src/engines/data/server/radar/radarEvidenceVault.ts");
  const types = read("src/server/types.ts");
  const storage = read("src/server/storage.ts");
  const radar = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const sweeps = read("src/engines/data/server/radar/radarSweeps.ts");
  const dashboard = commandCentreSource();
  const advisor = read("src/lib/server/assistants/advisorSkillContext.ts");
  assert.match(types, /RadarEvidenceState/);
  assert.match(types, /RadarEvidenceHourlyRollup/);
  assert.match(storage, /radarEvidence: parsed\.radarEvidence \?\? \{\}/);
  assert.match(vault, /applyRadarEvidenceBaselines/);
  assert.match(vault, /buildRadarEvidenceLayer/);
  assert.match(vault, /recordRadarEvidence/);
  assert.match(vault, /RECENT_POINT_LIMIT = 288/);
  assert.match(vault, /HOURLY_ROLLUP_LIMIT = 24 \* 30/);
  assert.match(vault, /deviationScore/);
  assert.match(vault, /EvidenceAssessment/);
  assert.match(vault, /scope: "history"/);
  assert.match(radar, /historicalChecks/);
  assert.match(radar, /baselineCoveragePercent/);
  // Evidence rollup (recordRadarEvidence) is driven by the sweep scheduler for
  // both the full scan and the scheduled cron sweep.
  assert.match(sweeps, /recordRadarEvidence/);
  assert.match(dashboard, /Durable evidence vault/);
  assert.match(dashboard, /Historical evidence/);
  assert.match(dashboard, /Pattern breaks/);
  assert.match(advisor, /evidence: radar\.evidence/);
});

test("radar wires property traffic, form, tag, server, and Advisor check context", () => {
  const engine = read("src/engines/data/server/radar/businessIssueRadar.ts");
  const telemetry = read("src/engines/data/server/radar/radarTelemetry.ts");
  const observations = read("src/engines/data/server/radar/radarObservations.ts");
  const advisor = read("src/lib/server/assistants/advisorSkillContext.ts");
  const dashboard = commandCentreSource();
  const sentinels = read("src/engines/data/radar/radarSentinels.ts");
  assert.match(engine, /metric:form-submissions/);
  assert.match(engine, /metric:aqua-tag-coverage/);
  assert.match(telemetry, /traffic is surging/);
  assert.match(telemetry, /Aqua Tag has never reported/);
  assert.match(telemetry, /received .*form submission/);
  assert.match(observations, /production-errors/);
  assert.match(observations, /integration-failures/);
  assert.match(advisor, /attentionChecks/);
  assert.match(engine, /buildRadarCorrelationIssues/);
  assert.match(engine, /buildSourceSentinelChecks/);
  assert.match(sentinels, /Zero-blindness guardrail/);
  assert.match(sentinels, /Property sentinel registration/);
  assert.match(dashboard, /Scanner ledger/);
  assert.match(dashboard, /Check coverage by business area/);
  assert.match(dashboard, /Radar watchdogs/);
});

test("adaptive Radar separates health, confidence, readiness, and honest zero-state conclusions", () => {
  const now = Date.UTC(2026, 7, 11);
  const observation = { ...observed("marketing", "traffic-7d", 0, "0 pageviews", now), sampleSize: 0, historySamples: 0, historySpanMs: 0 };
  const raw = buildRadarCheckMatrix([observation], [{ id: "test:marketing", domain: "marketing", label: "Marketing telemetry", status: "empty", recordCount: 0, detail: "Connected with no useful evidence." }], now);
  const result = applyAdaptiveRadarPolicy({
    checks: raw.checks.filter(check => check.domain === "marketing" && check.familyId === "traffic-7d"),
    issues: [],
    signals: [
      { id: "metric:company-health", domain: "company", label: "Company health", value: 15, display: "15/100", target: "80", status: "critical", detail: "Zero commercial activity.", href: "/portal/agency/company", measuredAt: now },
      { id: "metric:traffic-7d", domain: "marketing", label: "Traffic", value: 0, display: "0", target: "Growing", status: "unknown", detail: "No traffic.", href: "/portal/agency/marketing", measuredAt: now },
      { id: "metric:form-submissions", domain: "marketing", label: "Forms", value: 0, display: "0", target: "Attributed", status: "unknown", detail: "No forms.", href: "/portal/agency/inbox", measuredAt: now },
    ],
    coverage: [{ id: "test:marketing", domain: "marketing", label: "Marketing telemetry", status: "empty", recordCount: 0, detail: "Connected with no useful evidence." }],
    policy: testPolicy({ metricPolicies: { "marketing:traffic-7d": { targetValue: 100, expectedDirection: "higher" } } }),
    business: { currency: "GBP", monthRevenueCents: 0, monthlyRevenueTargetCents: 500_000, revenueGapCents: 500_000, leadCount: 0, activeClientCount: 0, meetingsThisMonth: 0, estimatedCallsNeeded: 20 },
    enquiryCount: 0,
    now,
  });
  assert.equal(result.adaptive.healthScore < 40, true, "zero activity should not present healthy business health");
  assert.equal(result.adaptive.confidencePercent < 50, true, "an empty connection should lower confidence");
  assert.equal(result.adaptive.readinessPercent < 70, true, "empty telemetry should not imply completed setup");
  assert.equal(result.adaptive.conclusions.some(item => item.id === "commercial-engine-not-established"), true);
  assert.equal(result.adaptive.conclusions.some(item => item.id === "lead-clock-not-started" && item.severity === "info"), true);
  assert.equal(result.checks.find(check => check.lens === "threshold")?.status, "critical", "an approved fixed target must remain authoritative while history learns");
  assert.equal(result.checks.some(check => check.status === "learning"), true);
});

test("adaptive Radar keeps protected checks active and groups duplicate findings into incidents", () => {
  const now = Date.UTC(2026, 7, 11);
  const marketingCheck = buildRadarCheckMatrix([observed("marketing", "traffic-7d", 20, "20", now)], [], now).checks.find(check => check.domain === "marketing" && check.familyId === "traffic-7d" && check.lens === "threshold")!;
  const systemCheck = { ...marketingCheck, id: "synthetic:systems:server-runtime", ruleId: "synthetic:runtime", domain: "systems" as const, familyId: "server-runtime", familyLabel: "Server runtime", scope: "synthetic" as const, status: "critical" as const, title: "Server runtime failed" };
  const result = applyAdaptiveRadarPolicy({
    checks: [marketingCheck, systemCheck],
    issues: [
      { id: "coverage:marketing-one", severity: "warning", domain: "marketing", title: "Marketing source missing", detail: "First related gap.", evidence: ["Source one"], href: "/portal/agency", detectedAt: now, sourceIds: ["one"] },
      { id: "coverage:marketing-two", severity: "warning", domain: "marketing", title: "Attribution source missing", detail: "Second related gap.", evidence: ["Source two"], href: "/portal/agency", detectedAt: now, sourceIds: ["two"] },
    ],
    signals: [],
    coverage: [],
    policy: testPolicy({ operatingStage: "paused" }),
    business: { currency: "GBP", monthRevenueCents: 0, monthlyRevenueTargetCents: 0, revenueGapCents: 0, leadCount: 0, activeClientCount: 0, meetingsThisMonth: 0, estimatedCallsNeeded: 0 },
    enquiryCount: 0,
    now,
  });
  assert.equal(result.checks.find(check => check.id === marketingCheck.id)?.status, "inactive");
  assert.equal(result.checks.find(check => check.id === systemCheck.id)?.status, "critical", "safety checks must survive a paused business stage");
  assert.equal(result.incidents.filter(incident => incident.domain === "marketing").length <= 1, true, "related domain gaps should collapse into one incident");
});

test("grouped blind-spot incidents retain only their exact failing checks", () => {
  const now = Date.UTC(2026, 7, 11);
  const template = buildRadarCheckMatrix([observed("marketing", "traffic-7d", 20, "20", now)], [], now).checks.find(check => check.domain === "marketing" && check.familyId === "traffic-7d" && check.lens === "threshold")!;
  const blindChecks = Array.from({ length: 52 }, (_, index) => ({ ...template, id: `systems:missing-${index}`, ruleId: `systems:missing-${index}`, domain: "systems" as const, familyId: `module-${index}`, familyLabel: `Module ${index}`, sourceId: `core:systems:${index}`, status: "blind" as const, title: `Module ${index} cannot be proved` }));
  const unrelatedCritical = { ...template, id: "systems:unrelated-runtime", ruleId: "systems:runtime", domain: "systems" as const, familyId: "runtime", familyLabel: "Runtime", sourceId: "runtime:probe", status: "critical" as const, title: "Runtime failed" };
  const result = applyAdaptiveRadarPolicy({
    checks: [...blindChecks, unrelatedCritical],
    issues: [{ id: "coverage:systems-check-blindness", severity: "critical", domain: "systems", title: "52 systems checks cannot prove health", detail: "The exact blind checks must remain inspectable.", evidence: ["52 blind"], href: "/portal/agency/company", detectedAt: now, sourceIds: ["core:systems"] }],
    signals: [],
    coverage: [{ id: "core:systems", domain: "systems", label: "Systems", status: "disconnected", recordCount: 0, detail: "Unavailable." }],
    policy: testPolicy(),
    business: { currency: "GBP", monthRevenueCents: 0, monthlyRevenueTargetCents: 0, revenueGapCents: 0, leadCount: 0, activeClientCount: 0, meetingsThisMonth: 0, estimatedCallsNeeded: 0 },
    enquiryCount: 0,
    now,
  });
  const incident = result.incidents.find(item => item.id === "incident:systems:coverage")!;
  assert.deepEqual(incident.issueIds, ["coverage:systems-check-blindness"]);
  assert.deepEqual(incident.checkIds.sort(), blindChecks.map(check => check.id).sort(), "the exact breakdown must not truncate after 40 checks");
  assert.equal(incident.checkIds.includes(unrelatedCritical.id), false, "an unrelated domain failure must not be hidden inside the blind-spot incident");
  assert.equal(incident.findingCount, 53, "one issue and every exact check should be counted separately from the domain total");
});

test("adaptive Radar policy is persisted, editable, and uses business-grade learning windows", () => {
  const types = read("src/server/types.ts");
  const settings = read("src/server/agencySettings.ts");
  const engine = read("src/engines/data/radar/radarPolicyEngine.ts");
  const vault = read("src/engines/data/server/radar/radarEvidenceVault.ts");
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  const panel = read("src/app/portal/agency/_RadarPolicyPanel.tsx");
  assert.match(types, /RadarPolicyConfiguration/);
  assert.match(types, /RadarPolicyException/);
  assert.match(settings, /learningPeriodDays: 30/);
  assert.match(settings, /minimumSampleSize: 12/);
  assert.match(engine, /isAuthoritativeFailure/);
  assert.match(engine, /isAlwaysOnCheck/);
  assert.match(engine, /groupIncidents/);
  assert.match(vault, /DEFAULT_BASELINE_SPAN_MS = 30 \* DAY/);
  assert.match(route, /export async function PATCH/);
  assert.match(panel, /Business stage/);
  assert.match(panel, /Metric overrides|Find a KPI/);
  assert.match(panel, /Temporary exceptions|No temporary exceptions/);
});

function observed(domain: AdvisorDomain, familyId: string, current: number, display: string, now: number): RadarObservation {
  return {
    domain,
    familyId,
    sourceId: `test:${domain}:${familyId}`,
    connected: true,
    current,
    previous: current,
    status: "healthy",
    display,
    target: "test guardrail",
    detail: "Test observation.",
    href: "/portal/agency",
    measuredAt: now,
    lastSeenAt: now,
    sampleSize: Math.max(1, current),
    integrity: true,
  };
}

function testPolicy(overrides: Partial<RadarPolicyConfiguration> = {}): RadarPolicyConfiguration {
  return {
    operatingStage: overrides.operatingStage ?? "setup",
    defaultPolicy: {
      state: "learning",
      activationCondition: "on-first-activity",
      baselineStrategy: "target-and-baseline",
      warningTolerancePercent: 15,
      criticalTolerancePercent: 30,
      minimumSampleSize: 12,
      learningPeriodDays: 30,
      evaluationWindow: "daily",
      businessHoursOnly: false,
      notificationCadence: "daily",
      ...(overrides.defaultPolicy ?? {}),
    },
    domainPolicies: overrides.domainPolicies ?? {},
    metricPolicies: overrides.metricPolicies ?? {},
    exceptions: overrides.exceptions ?? [],
    updatedAt: overrides.updatedAt ?? 0,
  };
}
