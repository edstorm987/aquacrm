// Command Centre performance mode — on-demand radar/intelligence.
//
// Ed flagged the Command Centre as slow. Even under Performance mode the page
// used to eagerly `await` the two heaviest builds on every navigation:
// `getCachedBusinessIssueRadar` (a full business-issue sweep on a cold 30s
// cache) and `buildCommandIntelligenceSnapshot` (which itself rebuilds company
// health, brand portfolio, marketing intelligence and 20 KPIs). This module is
// the switch: under Performance mode we skip those two builds, hand the client
// lightweight *paused* placeholders, and let a one-shot `?scan=1` render (the
// "Run scan" control) do the full build on demand.
//
// Default is OFF. With Performance mode off the caller keeps its original code
// path unchanged — `shouldRunHeavyPanels` returns `true`, so the eager build
// runs exactly as before.

import type { BusinessIssueRadar } from "@/lib/radar/businessRadar";
import type { RadarPolicyConfiguration } from "@/server/types";
import type { CommandIntelligenceSnapshot } from "@/lib/intelligence/commandIntelligence";
import { buildCommercialLifecycleSnapshot } from "@/lib/intelligence/commercialLifecycle";
import { buildCommercialIntelligence } from "@/lib/intelligence/commercialIntelligence";

/**
 * Whether to build the heavy radar + KPI-intelligence panels for this render.
 *
 * - Performance mode OFF → always `true` (behaviour is byte-for-byte today).
 * - Performance mode ON  → `false` (paused: cached-or-on-button), UNLESS this
 *   render carries the one-shot `?scan=1` flag, which forces a single fresh
 *   build.
 */
export function shouldRunHeavyPanels(perfMode: boolean, scanRequested: boolean): boolean {
  return !perfMode || scanRequested;
}

/** Parse the one-shot `?scan=1` search param (string | string[] | undefined). */
export function normalizeScanFlag(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.includes("1");
  return value === "1";
}

/**
 * A type-complete but empty `BusinessIssueRadar` used while Performance mode
 * has paused the real sweep. Every count is zero and every collection empty —
 * the same shape a brand-new agency with nothing monitored produces — so the
 * client renders its ordinary empty states (never an error) behind the
 * "Run scan" affordance. The policy is the agency's real configured policy so
 * the adaptive operating stage still reads truthfully.
 */
export function buildPausedBusinessRadar(
  policy: RadarPolicyConfiguration,
  now: number,
): BusinessIssueRadar {
  return {
    generatedAt: now,
    summary: {
      critical: 0,
      warning: 0,
      watch: 0,
      connectedSources: 0,
      totalSources: 0,
      blindSpots: 0,
      totalChecks: 0,
      passedChecks: 0,
      firingChecks: 0,
      watchChecks: 0,
      blindChecks: 0,
      learningChecks: 0,
      inactiveChecks: 0,
      applicableChecks: 0,
      assuredChecks: 0,
      checksPerDomain: 0,
      detectorLenses: 0,
      assurancePercent: 0,
      correlatedRisks: 0,
      catalogChecks: 0,
      sentinelChecks: 0,
      sourceSentinels: 0,
      propertySentinels: 0,
      syntheticSentinels: 0,
      commercialLifecycleChecks: 0,
      historicalChecks: 0,
      infraChecks: 0,
      watchdogChecks: 0,
      monitoredProperties: 0,
      syntheticProperties: 0,
      failedSyntheticProbes: 0,
      evidenceSeries: 0,
      baselineReadySeries: 0,
      baselineCoveragePercent: 0,
      evidenceSamples: 0,
      historicalAnomalies: 0,
    },
    speedToLead: {
      status: "unknown",
      targetMinutes: 0,
      warningMinutes: 0,
      criticalMinutes: 0,
      enquiryCount: 0,
      measuredResponseCount: 0,
      awaitingResponseCount: 0,
      breachedCount: 0,
      withinTargetPercent: null,
      medianResponseMs: null,
      p90ResponseMs: null,
      oldestWaitingMs: null,
    },
    commercial: buildCommercialLifecycleSnapshot({ leads: [], clients: [], now, available: false }),
    issues: [],
    incidents: [],
    signals: [],
    coverage: [],
    checks: [],
    domains: [],
    memory: {
      status: "first-sweep",
      totalSweeps: 0,
      newIssues: 0,
      worseningIssues: 0,
      recoveredIssues: 0,
      recurringIssues: 0,
      newFiringChecks: 0,
      recoveredChecks: 0,
      flappingSources: 0,
      longRunningIssues: 0,
      assuranceDelta: 0,
      firingDelta: 0,
      blindDelta: 0,
      history: [],
    },
    evidence: {
      totalSeries: 0,
      measurableSeries: 0,
      baselineReadySeries: 0,
      baselineCoveragePercent: 0,
      totalSamples: 0,
      anomalousSeries: 0,
      recordingGaps: 0,
      topMovements: [],
    },
    adaptive: {
      operatingStage: policy.operatingStage,
      healthScore: 0,
      confidencePercent: 0,
      readinessPercent: 0,
      liveChecks: 0,
      learningChecks: 0,
      inactiveChecks: 0,
      alwaysOnChecks: 0,
      calibratingDomains: [],
      conclusions: [],
      policy,
    },
    findingGroups: [],
    coverageManifest: {
      entries: [],
      covered: 0,
      fallback: 0,
      gaps: 0,
      calibrating: 0,
      byType: {} as BusinessIssueRadar["coverageManifest"]["byType"],
    },
  };
}

/**
 * A type-complete but empty `CommandIntelligenceSnapshot` used while
 * Performance mode has paused the real build. `commercialIntelligence` is the
 * genuine empty-input result of the pure builder so its formulae stay honest
 * (values read "—"/learning, never a fabricated zero).
 */
export function buildPausedIntelligenceSnapshot(
  currency: string,
  now: number,
): CommandIntelligenceSnapshot {
  return {
    generatedAt: now,
    currency,
    kpis: [],
    scopes: [],
    campaigns: [],
    audienceProfiles: [],
    audienceLocations: [],
    audienceSignals: [],
    audienceDemographics: [],
    sourceCohorts: [],
    demandFlow: { pageviews: null, forms: null, leads: 0, convertedLeads: 0, activeClients: 0 },
    commercialIntelligence: buildCommercialIntelligence({
      leads: [],
      clients: [],
      campaigns: [],
      pipeline: null,
      cards: [],
      currency,
      pageviews: null,
      forms: null,
      now,
    }),
    summary: {
      connectedKpis: 0,
      learningKpis: 0,
      blindKpis: 0,
      criticalKpis: 0,
      warningKpis: 0,
      activeCampaigns: 0,
      campaignSpendCents: 0,
      campaignRevenueCents: 0,
      portfolioRoas: null,
      audienceProfiles: 0,
      validatedProfiles: 0,
      mappedLocations: 0,
      unmappedLocations: 0,
    },
  };
}
