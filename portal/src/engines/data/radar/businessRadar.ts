import type {
  RadarEvidenceHourlyRollup,
  RadarEvidencePoint,
  RadarPolicyConfiguration,
  RadarPolicyRule,
} from "@/server/types";
import type { CommercialLifecycleSnapshot } from "@/lib/intelligence/commercialLifecycle";

export type AdvisorDomain =
  | "company"
  | "sales"
  | "inbox"
  | "clients"
  | "finance"
  | "delivery"
  | "marketing"
  | "operations"
  | "compliance"
  | "development"
  | "team"
  | "systems";

export type BusinessIssueSeverity = "critical" | "warning" | "watch";
export type BusinessSignalStatus = BusinessIssueSeverity | "healthy" | "unknown";
export type AdvisorCoverageStatus = "connected" | "empty" | "disconnected" | "unavailable";
export type RadarCheckStatus = "pass" | BusinessIssueSeverity | "blind" | "learning" | "inactive";
export type RadarCheckScope = "kpi" | "source" | "property" | "synthetic" | "history" | "watchdog" | "infra";
/**
 * Which sweep refreshes a check (radar upgrade Stage 2). `instant` = in-state
 * derivation the Pulse assembles live; `probe` = a network/DB round-trip run by
 * the Deep/Infra sweeps; `rollup` = needs retained history from the Evidence
 * sweep. See `lib/radarClassification.ts` and the sweep scheduler.
 */
export type RadarCheckTier = "instant" | "probe" | "rollup";
/**
 * What a check's answer depends on. `in-state` = current PortalState only;
 * `derived` = needs retained evidence history or another derived signal;
 * `external` = needs data from outside AquaCRM (a live probe or tag telemetry).
 * Makes "why is this blind?" answerable: external dep down vs. not-yet-instrumented.
 */
export type RadarDataDependency = "in-state" | "derived" | "external";
/**
 * Top-level "what kind of problem" bucket above the {domain}:{category} grouping
 * (radar upgrade Stage 5). The operator sees the kind of problem before drilling
 * into domain detail. Derived by `radarFindingGroup` in `lib/radarClassification.ts`.
 */
export type RadarFindingGroup =
  | "infrastructure"
  | "commercial"
  | "compliance"
  | "delivery"
  | "reliability"
  | "people";
export type RadarEntityType = "client" | "product" | "property";

// ─── Coverage seeding (radar upgrade Stage 6 — auto-coverage for new entities) ─
/** Entity types with a declared radar detector-pack template. */
export type RadarCoverageEntityType =
  | "client"
  | "product"
  | "property"
  | "integration"
  | "portal-connection"
  | "trading-company";
/** `calibrating` = seeded but still accruing evidence; `active` = evidence-backed. */
export type RadarCoverageState = "calibrating" | "active";

export interface RadarCoverageManifestEntry {
  type: RadarCoverageEntityType;
  id: string;
  label: string;
  packId: string;
  /** `bespoke` = a template exists for this type; `fallback` = the generic pack caught it. */
  template: "bespoke" | "fallback";
  state: RadarCoverageState;
}

/** Proof that every monitorable entity resolves to a radar pack (Part E). */
export interface RadarCoverageManifest {
  entries: RadarCoverageManifestEntry[];
  covered: number; // entries on a bespoke template
  fallback: number; // entries caught by the generic fallback
  gaps: number; // entries resolving to no pack at all (should always be 0)
  calibrating: number;
  byType: Record<RadarCoverageEntityType, number>;
}

// ─── Infra health (radar upgrade Stage 4 — DB & storage health) ─────────────
export type RadarInfraBackend = "file" | "memory" | "postgres" | "supabase" | "unknown";
export type RadarInfraProbeStatus = "connected" | "down" | "untested";

/** One database's reachability + latency (+ row counts for the primary). */
export interface RadarInfraDatabaseHealth {
  id: string; // "primary" or an external target id
  label: string;
  backend: RadarInfraBackend;
  status: RadarInfraProbeStatus;
  latencyMs: number | null;
  external: boolean;
  error?: string;
  /** Row counts of key tables — best-effort, primary only; omitted where unavailable. */
  rowCounts?: Record<string, number>;
}

/**
 * Storage health. Total Supabase Storage bytes is NOT available from the
 * service-role client, so `measurable` is false and `bucketBytes` is null —
 * shown honestly as "not available in-app" rather than faked (plan Part D §4).
 */
export interface RadarInfraStorageHealth {
  backend: RadarInfraBackend;
  bucketBytes: number | null;
  measurable: boolean;
  note: string;
}

/** The Infra sweep's latest snapshot; written to `radarInfraHealth`, read by the Pulse. */
export interface RadarInfraHealthSnapshot {
  checkedAt: number;
  primary: RadarInfraDatabaseHealth;
  external: RadarInfraDatabaseHealth[];
  storage: RadarInfraStorageHealth;
}

/**
 * The gap the DEPLOYED probe schedule actually delivers between two runs of the
 * Deep (synthetic canary) and Infra sweeps — `vercel.json`'s
 * `/api/cron/radar-probes` cron, `15 6 * * *`, i.e. once a day.
 *
 * Every surface that judges probe-evidence freshness reads this one value, so a
 * cadence change is a single edit rather than a hunt through hardcoded
 * agreements. It exists because those agreements used to be hardcoded at
 * 15m/60m while nothing ran more often than daily: every live property's canary
 * therefore read "stale/critical" all day, which mislabels a DEPLOYMENT choice
 * as a per-property outage — and, on the infra side, a day-old snapshot was
 * stamped with the Pulse's `now` and read exactly like a fresh one.
 *
 * Whether the cron returns to a sub-daily cadence is a hosting decision (Vercel
 * Hobby is daily-only) and remains Ed's call → issues #170. Pinned against
 * `vercel.json` and `RADAR_SWEEP_DEFINITIONS` by scripts/smoke-radar-sweeps.test.ts,
 * so moving the cron without moving this constant fails the suite.
 */
export const RADAR_PROBE_CADENCE_MS = 86_400_000;
export type RadarRuleLens =
  | "connection"
  | "freshness"
  | "threshold"
  | "trend"
  | "anomaly"
  | "integrity"
  | "continuity"
  | "baseline"
  | "confidence"
  | "forecast"
  | "volatility"
  | "resilience";

export interface BusinessRadarIssue {
  id: string;
  severity: BusinessIssueSeverity;
  domain: AdvisorDomain;
  title: string;
  detail: string;
  evidence: string[];
  href: string;
  detectedAt: number;
  sourceIds: string[];
  entity?: RadarEntityReference;
}

export interface RadarEntityReference {
  type: RadarEntityType;
  id: string;
  label: string;
  parentId?: string;
}

export interface BusinessMetricSignal {
  id: string;
  domain: AdvisorDomain;
  label: string;
  value: number | null;
  display: string;
  target: string;
  status: BusinessSignalStatus;
  detail: string;
  href: string;
  measuredAt: number;
  sampleSize?: number;
}

export interface AdvisorCoverageSource {
  id: string;
  domain: AdvisorDomain;
  label: string;
  status: AdvisorCoverageStatus;
  recordCount: number;
  lastActivityAt?: number;
  detail: string;
}

export interface BusinessRadarCheck {
  id: string;
  ruleId: string;
  domain: AdvisorDomain;
  familyId: string;
  familyLabel: string;
  lens: RadarRuleLens;
  lensLabel: string;
  scope: RadarCheckScope;
  tier?: RadarCheckTier;
  dataDependency?: RadarDataDependency;
  status: RadarCheckStatus;
  title: string;
  detail: string;
  evidence: string[];
  href: string;
  sourceId: string;
  measuredAt: number;
  value?: number;
  previousValue?: number;
  lastSeenAt?: number;
  sampleSize?: number;
  historySamples?: number;
  historySpanMs?: number;
  expectedDirection?: "higher" | "lower" | "neutral";
  policy?: RadarPolicyRule;
  alwaysOn?: boolean;
  exceptionId?: string;
  entity?: RadarEntityReference;
}

export interface ClientRadarPackSummary {
  id: string;
  label: string;
  kind: "base" | "product" | "source";
  productId?: string;
  productName?: string;
  totalChecks: number;
  liveChecks: number;
  critical: number;
  warning: number;
  blind: number;
  learning: number;
}

export interface ClientRadarSnapshot {
  generatedAt: number;
  clientId: string;
  clientName: string;
  healthScore: number | null;
  healthState: "strong" | "watch" | "risk" | "learning";
  confidencePercent: number;
  readinessPercent: number;
  summary: string;
  sourceAvailability: {
    finance: "ready" | "unavailable" | "not-connected";
  };
  lastRecordedAt?: number;
  checks: BusinessRadarCheck[];
  issues: BusinessRadarIssue[];
  packs: ClientRadarPackSummary[];
  totals: {
    total: number;
    live: number;
    passed: number;
    critical: number;
    warning: number;
    watch: number;
    blind: number;
    learning: number;
    inactive: number;
  };
}

export interface RadarDomainSummary {
  domain: AdvisorDomain;
  totalChecks: number;
  passedChecks: number;
  firingChecks: number;
  watchChecks: number;
  blindChecks: number;
  learningChecks: number;
  inactiveChecks: number;
  applicableChecks: number;
  assuredChecks: number;
  coveragePercent: number;
  assurancePercent: number;
  confidencePercent: number;
  readinessPercent: number;
  sourceCount: number;
  lastSignalAt?: number;
}

export interface BusinessRadarIncident extends BusinessRadarIssue {
  issueIds: string[];
  checkIds: string[];
  findingCount: number;
  /** Top-level problem bucket (radar upgrade Stage 5). */
  group: RadarFindingGroup;
}

/** Per-bucket incident roll-up (radar upgrade Stage 5) — "what kind of problem" at a glance. */
export interface RadarFindingGroupSummary {
  group: RadarFindingGroup;
  label: string;
  incidents: number;
  critical: number;
  warning: number;
  watch: number;
}

export interface BusinessRadarConclusion {
  id: string;
  domain: AdvisorDomain;
  severity: BusinessIssueSeverity | "info";
  title: string;
  detail: string;
  href: string;
}

export interface BusinessRadarAdaptiveState {
  operatingStage: RadarPolicyConfiguration["operatingStage"];
  healthScore: number;
  confidencePercent: number;
  readinessPercent: number;
  liveChecks: number;
  learningChecks: number;
  inactiveChecks: number;
  alwaysOnChecks: number;
  calibratingDomains: AdvisorDomain[];
  conclusions: BusinessRadarConclusion[];
  policy: RadarPolicyConfiguration;
}

export interface SpeedToLeadRadar {
  status: BusinessSignalStatus;
  targetMinutes: number;
  warningMinutes: number;
  criticalMinutes: number;
  enquiryCount: number;
  measuredResponseCount: number;
  awaitingResponseCount: number;
  breachedCount: number;
  withinTargetPercent: number | null;
  medianResponseMs: number | null;
  p90ResponseMs: number | null;
  oldestWaitingMs: number | null;
}

export interface RadarMemoryPoint {
  at: number;
  assurancePercent: number;
  firingChecks: number;
  blindChecks: number;
  criticalIssues: number;
}

export interface RadarMemoryDigest {
  status: "first-sweep" | "current" | "delayed";
  totalSweeps: number;
  firstSweepAt?: number;
  lastSweepAt?: number;
  previousSweepAt?: number;
  scanGapMs?: number;
  newIssues: number;
  worseningIssues: number;
  recoveredIssues: number;
  recurringIssues: number;
  newFiringChecks: number;
  recoveredChecks: number;
  flappingSources: number;
  longRunningIssues: number;
  oldestOpenIssueMs?: number;
  assuranceDelta: number;
  firingDelta: number;
  blindDelta: number;
  history: RadarMemoryPoint[];
}

export interface RadarEvidenceMovement {
  id: string;
  domain: AdvisorDomain;
  familyLabel: string;
  current: number;
  baseline: number;
  changePercent: number;
  deviationScore: number;
  adverse: boolean;
}

export interface RadarEvidenceDigest {
  totalSeries: number;
  measurableSeries: number;
  baselineReadySeries: number;
  baselineCoveragePercent: number;
  totalSamples: number;
  anomalousSeries: number;
  recordingGaps: number;
  longestHistoryMs?: number;
  topMovements: RadarEvidenceMovement[];
}

export interface RadarEvidenceSeriesSummary {
  id: string;
  domain: AdvisorDomain;
  familyId: string;
  familyLabel: string;
  sourceId: string;
  expectedDirection: "higher" | "lower" | "neutral";
  firstSeenAt: number;
  lastSeenAt: number;
  totalSamples: number;
  retainedPointCount: number;
  hourlyRollupCount: number;
  latestValue?: number;
  latestStatus?: RadarEvidencePoint["status"];
  /** Rolling/learned baseline — the median of the recent window (Phase 5B). Evolves as the metric grows; `undefined` under 3 points. Additive; does not affect anomaly detection. */
  rollingBaseline?: number;
  recentPoints: RadarEvidencePoint[];
  recentHourly: RadarEvidenceHourlyRollup[];
}

export interface RadarEvidenceInspectionIndex {
  available: boolean;
  totalSamples: number;
  firstRecordedAt?: number;
  lastRecordedAt?: number;
  series: RadarEvidenceSeriesSummary[];
}

export interface RadarEvidenceSeriesInspection extends RadarEvidenceSeriesSummary {
  points: RadarEvidencePoint[];
  hourly: RadarEvidenceHourlyRollup[];
}

export type RadarSourceDatasetStatus = "available" | "empty" | "unavailable";

export interface RadarSourceDatasetSummary {
  id: string;
  domain: AdvisorDomain;
  label: string;
  description: string;
  status: RadarSourceDatasetStatus;
  recordCount: number;
  lastUpdatedAt?: number;
  href: string;
  sourceIds: string[];
  fields: string[];
  unavailableReason?: string;
}

export interface RadarSourceDataIndex {
  generatedAt: number;
  totalDatasets: number;
  availableDatasets: number;
  unavailableDatasets: number;
  totalRecords: number;
  datasets: RadarSourceDatasetSummary[];
}

export interface RadarSourceDatasetInspection extends RadarSourceDatasetSummary {
  generatedAt: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  records: Array<Record<string, unknown>>;
}

export interface BusinessIssueRadar {
  generatedAt: number;
  summary: {
    critical: number;
    warning: number;
    watch: number;
    connectedSources: number;
    totalSources: number;
    blindSpots: number;
    totalChecks: number;
    passedChecks: number;
    firingChecks: number;
    watchChecks: number;
    blindChecks: number;
    learningChecks: number;
    inactiveChecks: number;
    applicableChecks: number;
    assuredChecks: number;
    checksPerDomain: number;
    detectorLenses: number;
    assurancePercent: number;
    correlatedRisks: number;
    catalogChecks: number;
    sentinelChecks: number;
    sourceSentinels: number;
    propertySentinels: number;
    syntheticSentinels: number;
    commercialLifecycleChecks: number;
    historicalChecks: number;
    infraChecks: number;
    watchdogChecks: number;
    monitoredProperties: number;
    syntheticProperties: number;
    failedSyntheticProbes: number;
    evidenceSeries: number;
    baselineReadySeries: number;
    baselineCoveragePercent: number;
    evidenceSamples: number;
    historicalAnomalies: number;
    clientChecks?: number;
    monitoredClients?: number;
    monitoredEntities?: number;
    coverageGaps?: number;
    /**
     * When the OLDEST piece of PROBE evidence behind this Pulse was actually
     * collected (the least recently refreshed synthetic canary, or the Infra
     * snapshot), as opposed to `generatedAt`, which is only when the Pulse was
     * assembled from it. Absent when nothing has ever been probed — never
     * substituted with `now`, which is precisely how day-old evidence used to
     * read as fresh (#170).
     *
     * The oldest rather than the newest, because the canary and Infra sweeps
     * refresh and FAIL independently: `runRadarProbeRefresh` swallows a deep
     * sweep failure and leaves week-old canaries in place beside an Infra
     * snapshot taken seconds earlier in the same cron tick. Reporting the newest
     * there would restate the fresh-timestamp-over-stale-evidence lie this field
     * exists to end. Only the oldest makes "this Pulse's probe evidence is X
     * old" a true sentence.
     */
    probeEvidenceCheckedAt?: number;
  };
  speedToLead: SpeedToLeadRadar;
  commercial: CommercialLifecycleSnapshot;
  issues: BusinessRadarIssue[];
  incidents: BusinessRadarIncident[];
  signals: BusinessMetricSignal[];
  coverage: AdvisorCoverageSource[];
  checks: BusinessRadarCheck[];
  domains: RadarDomainSummary[];
  memory: RadarMemoryDigest;
  evidence: RadarEvidenceDigest;
  adaptive: BusinessRadarAdaptiveState;
  /** Latest Infra sweep snapshot (radar upgrade Stage 4). Absent until an Infra sweep has run. */
  infra?: RadarInfraHealthSnapshot;
  /** Incidents rolled up into top-level problem buckets (radar upgrade Stage 5). */
  findingGroups: RadarFindingGroupSummary[];
  /** Coverage manifest — every monitorable entity resolved to a pack (radar upgrade Stage 6). */
  coverageManifest: RadarCoverageManifest;
}

export type AdvisorRadarDigest = BusinessIssueRadar["summary"] & {
  generatedAt: number;
  speedToLead: SpeedToLeadRadar;
  commercial: CommercialLifecycleSnapshot;
  topIssues: BusinessRadarIssue[];
  topIncidents: BusinessRadarIncident[];
  coverage: AdvisorCoverageSource[];
  domains: RadarDomainSummary[];
  topChecks: BusinessRadarCheck[];
  memory: RadarMemoryDigest;
  evidence: RadarEvidenceDigest;
  adaptive: BusinessRadarAdaptiveState;
};

export function radarDigest(radar: BusinessIssueRadar): AdvisorRadarDigest {
  return {
    ...radar.summary,
    generatedAt: radar.generatedAt,
    speedToLead: radar.speedToLead,
    commercial: radar.commercial,
    topIssues: radar.incidents.slice(0, 6),
    topIncidents: radar.incidents.slice(0, 6),
    coverage: radar.coverage,
    domains: radar.domains,
    topChecks: radar.checks.filter(check => check.status !== "pass").slice(0, 24),
    memory: radar.memory,
    evidence: radar.evidence,
    adaptive: radar.adaptive,
  };
}
