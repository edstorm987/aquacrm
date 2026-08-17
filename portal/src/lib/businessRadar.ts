import type {
  RadarEvidenceHourlyRollup,
  RadarEvidencePoint,
  RadarPolicyConfiguration,
  RadarPolicyRule,
} from "@/server/types";
import type { CommercialLifecycleSnapshot } from "@/lib/commercialLifecycle";

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
export type RadarCheckScope = "kpi" | "source" | "property" | "synthetic" | "history" | "watchdog";
export type RadarEntityType = "client" | "product" | "property";
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
