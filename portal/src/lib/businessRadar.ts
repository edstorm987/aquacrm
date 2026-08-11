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
export type RadarCheckStatus = "pass" | BusinessIssueSeverity | "blind";
export type RadarCheckScope = "kpi" | "source" | "property" | "synthetic" | "history" | "watchdog";
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
  expectedDirection?: "higher" | "lower" | "neutral";
}

export interface RadarDomainSummary {
  domain: AdvisorDomain;
  totalChecks: number;
  passedChecks: number;
  firingChecks: number;
  watchChecks: number;
  blindChecks: number;
  assuredChecks: number;
  coveragePercent: number;
  assurancePercent: number;
  sourceCount: number;
  lastSignalAt?: number;
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
  };
  speedToLead: SpeedToLeadRadar;
  issues: BusinessRadarIssue[];
  signals: BusinessMetricSignal[];
  coverage: AdvisorCoverageSource[];
  checks: BusinessRadarCheck[];
  domains: RadarDomainSummary[];
  memory: RadarMemoryDigest;
  evidence: RadarEvidenceDigest;
}

export type AdvisorRadarDigest = BusinessIssueRadar["summary"] & {
  generatedAt: number;
  speedToLead: SpeedToLeadRadar;
  topIssues: BusinessRadarIssue[];
  coverage: AdvisorCoverageSource[];
  domains: RadarDomainSummary[];
  topChecks: BusinessRadarCheck[];
  memory: RadarMemoryDigest;
  evidence: RadarEvidenceDigest;
};

export function radarDigest(radar: BusinessIssueRadar): AdvisorRadarDigest {
  return {
    ...radar.summary,
    generatedAt: radar.generatedAt,
    speedToLead: radar.speedToLead,
    topIssues: radar.issues.slice(0, 6),
    coverage: radar.coverage,
    domains: radar.domains,
    topChecks: radar.checks.filter(check => check.status !== "pass").slice(0, 24),
    memory: radar.memory,
    evidence: radar.evidence,
  };
}
