import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { AdvisorDomain } from "../src/lib/businessRadar";
import { buildRadarCheckMatrix } from "../src/lib/radarCheckEngine";
import type { RadarObservation } from "../src/lib/radarCheckEngine";
import { buildRadarCorrelationIssues } from "../src/lib/radarCorrelations";
import { buildPropertySentinelChecks, buildRadarWatchdogChecks, buildSourceSentinelChecks } from "../src/lib/radarSentinels";
import { buildSyntheticCanaryChecks } from "../src/lib/radarSyntheticChecks";
import { isReservedSyntheticHostname, isUnsafeSyntheticAddress } from "../src/lib/radarSyntheticSafety";
import type { RadarTelemetrySnapshot } from "../src/lib/server/radarTelemetry";
import { BUSINESS_RADAR_RULE_CATALOG, RADAR_CHECKS_PER_DOMAIN, RADAR_RULE_LENSES, RADAR_SIGNAL_FAMILIES } from "../src/lib/radarRuleCatalog";

const read = (path: string) => readFileSync(path, "utf8");

test("business radar measures speed to lead against configurable guardrails", () => {
  const radar = read("src/lib/server/businessIssueRadar.ts");
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
  const radar = read("src/lib/server/businessIssueRadar.ts");
  const context = read("src/lib/server/advisorContext.ts");
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  assert.match(radar, /for \(const install of installs\)/);
  assert.match(radar, /module:\$\{install\.pluginId\}/);
  assert.match(radar, /coverage:business-blind-spots/);
  assert.match(radar, /Advisor conclusions may miss work completed elsewhere/);
  assert.match(context, /businessRadar/);
  assert.match(route, /buildBusinessIssueRadar/);
});

test("critical radar findings survive model omission and reach visible Advisor UI", () => {
  const advisor = read("src/lib/server/openaiAssistant.ts");
  const drawer = read("src/components/chrome/GlobalAdvisorDrawer.tsx");
  const workspace = read("src/app/portal/agency/assistant/AssistantWorkspace.tsx");
  assert.match(advisor, /guaranteedRadarActions/);
  assert.match(advisor, /BUSINESS RADAR findings are deterministic/);
  assert.match(advisor, /mergeAdvisorActions/);
  assert.match(advisor, /if \(guaranteedRadarActions\.length\) return guaranteedRadarActions/);
  assert.match(drawer, /issues need attention/);
  assert.match(workspace, /Business radar/);
  assert.match(workspace, /Speed to lead/);
  assert.match(workspace, /Review radar/);
});

test("the main dashboard exposes an active, actionable radar mode", () => {
  const page = read("src/app/portal/agency/page.tsx");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  assert.match(page, /getCachedBusinessIssueRadar/);
  assert.match(page, /businessRadar=\{businessRadar\}/);
  assert.match(dashboard, /Active business radar/);
  assert.match(dashboard, /automatic rescan every minute/);
  assert.match(dashboard, /\/api\/portal\/advisor\/radar/);
  assert.match(dashboard, /Check coverage by business area/);
  assert.match(dashboard, /addRadarTask/);
  assert.match(dashboard, /Radar findings automatically join your strict priority queue/);
  assert.match(dashboard, /detector lenses per KPI/);
  assert.match(dashboard, /Compound risks/);
});

test("every radar domain carries at least 140 deterministic checks", () => {
  const domains = Object.keys(RADAR_SIGNAL_FAMILIES) as AdvisorDomain[];
  assert.equal(domains.length, 12);
  assert.equal(RADAR_RULE_LENSES.length, 12);
  assert.equal(RADAR_CHECKS_PER_DOMAIN, 144);
  assert.equal(BUSINESS_RADAR_RULE_CATALOG.length, domains.length * RADAR_CHECKS_PER_DOMAIN);
  for (const domain of domains) {
    assert.equal(RADAR_SIGNAL_FAMILIES[domain].length, 12, `${domain} should retain 12 metric families`);
    assert.equal(BUSINESS_RADAR_RULE_CATALOG.filter(rule => rule.domain === domain).length, 144, `${domain} should retain 144 checks`);
  }
});

test("missing observations become explicit blind checks instead of false passes", () => {
  const matrix = buildRadarCheckMatrix([], [], Date.UTC(2026, 7, 11));
  assert.equal(matrix.checks.length, 1728);
  assert.equal(matrix.checks.every(check => check.status === "blind"), true);
  assert.equal(matrix.domains.every(domain => domain.totalChecks === 144 && domain.blindChecks === 144 && domain.coveragePercent === 0 && domain.assurancePercent === 0), true);
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
  const probes = read("src/lib/server/radarSyntheticProbes.ts");
  const checks = read("src/lib/radarSyntheticChecks.ts");
  const types = read("src/server/types.ts");
  const storage = read("src/server/storage.ts");
  const radar = read("src/lib/server/businessIssueRadar.ts");
  const route = read("src/app/api/portal/advisor/radar/route.ts");
  const cron = read("src/app/api/cron/inbox/route.ts");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
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
  assert.match(route, /runAgencySyntheticProbes\(session\.agencyId, \{ force: true \}\)/);
  assert.match(cron, /runAgencySyntheticProbes\(agency\.id\)/);
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
  const memory = read("src/lib/server/radarMemory.ts");
  const storage = read("src/server/storage.ts");
  const types = read("src/server/types.ts");
  const radarRoute = read("src/app/api/portal/advisor/radar/route.ts");
  const cron = read("src/app/api/cron/inbox/route.ts");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const advisor = read("src/lib/server/advisorSkillContext.ts");
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
  assert.match(radarRoute, /recordRadarSweep/);
  assert.match(radarRoute, /invalidateBusinessIssueRadarCache/);
  assert.match(cron, /radarSweeps/);
  assert.match(cron, /buildBusinessIssueRadar/);
  assert.match(dashboard, /Temporal continuity live/);
  assert.match(dashboard, /Assurance memory/);
  assert.match(dashboard, /Recovered/);
  assert.match(dashboard, /Flapping/);
  assert.match(advisor, /memory: radar\.memory/);
});

test("radar retains every KPI in a durable evidence vault with historical detectors", () => {
  const vault = read("src/lib/server/radarEvidenceVault.ts");
  const types = read("src/server/types.ts");
  const storage = read("src/server/storage.ts");
  const radar = read("src/lib/server/businessIssueRadar.ts");
  const radarRoute = read("src/app/api/portal/advisor/radar/route.ts");
  const cron = read("src/app/api/cron/inbox/route.ts");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const advisor = read("src/lib/server/advisorSkillContext.ts");
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
  assert.match(radarRoute, /recordRadarEvidence/);
  assert.match(cron, /recordRadarEvidence/);
  assert.match(dashboard, /Durable evidence vault/);
  assert.match(dashboard, /Historical evidence/);
  assert.match(dashboard, /Pattern breaks/);
  assert.match(advisor, /evidence: radar\.evidence/);
});

test("radar wires property traffic, form, tag, server, and Advisor check context", () => {
  const engine = read("src/lib/server/businessIssueRadar.ts");
  const telemetry = read("src/lib/server/radarTelemetry.ts");
  const observations = read("src/lib/server/radarObservations.ts");
  const advisor = read("src/lib/server/advisorSkillContext.ts");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const sentinels = read("src/lib/radarSentinels.ts");
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
