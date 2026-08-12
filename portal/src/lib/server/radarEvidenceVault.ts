import "server-only";

import type {
  AdvisorDomain,
  BusinessIssueRadar,
  BusinessRadarCheck,
  BusinessRadarIssue,
  RadarCheckStatus,
  RadarEvidenceDigest,
  RadarEvidenceInspectionIndex,
  RadarEvidenceMovement,
  RadarEvidenceSeriesInspection,
  RadarEvidenceSeriesSummary,
  RadarRuleLens,
} from "@/lib/businessRadar";
import type { RadarObservation } from "@/lib/radarCheckEngine";
import { resolveRadarPolicy } from "@/lib/radarPolicyEngine";
import { getState, mutate } from "@/server/storage";
import type { RadarEvidencePoint, RadarEvidenceSeries, RadarEvidenceState, RadarPolicyConfiguration } from "@/server/types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const FIVE_MINUTES = 5 * MINUTE;
const RECENT_POINT_LIMIT = 288;
const HOURLY_ROLLUP_LIMIT = 24 * 30;
const DEFAULT_BASELINE_POINTS = 12;
const DEFAULT_BASELINE_SPAN_MS = 30 * DAY;

interface EvidenceAssessment {
  observation: RadarObservation;
  series?: RadarEvidenceSeries;
  history: RadarEvidencePoint[];
  baselineReady: boolean;
  baseline?: number;
  previous?: number;
  changePercent?: number;
  deviationScore: number;
  adverse: boolean;
  recordingGapMs?: number;
}

export interface RadarEvidenceLayer {
  digest: RadarEvidenceDigest;
  checks: BusinessRadarCheck[];
  issues: BusinessRadarIssue[];
}

export function applyRadarEvidenceBaselines(
  agencyId: string,
  observations: readonly RadarObservation[],
): RadarObservation[] {
  const series = getState().radarEvidence[agencyId]?.series ?? {};
  return observations.map(observation => {
    const evidence = series[seriesId(observation.domain, observation.familyId)];
    const previous = observation.previous ?? evidence?.points.at(-1)?.value;
    return {
      ...observation,
      previous,
      historySamples: evidence?.totalSamples ?? 0,
      historySpanMs: evidence?.firstSeenAt && evidence.lastSeenAt ? Math.max(0, evidence.lastSeenAt - evidence.firstSeenAt) : 0,
    };
  });
}

export function buildRadarEvidenceLayer(
  agencyId: string,
  observations: readonly RadarObservation[],
  now: number,
  policy?: RadarPolicyConfiguration,
): RadarEvidenceLayer {
  const state = getState().radarEvidence[agencyId];
  const assessments = observations.map(observation => assess(observation, state?.series[seriesId(observation.domain, observation.familyId)], now, policy));
  const measurable = assessments.filter(item => typeof item.observation.current === "number" && Number.isFinite(item.observation.current));
  const baselineReady = measurable.filter(item => item.baselineReady);
  const anomalies = baselineReady.filter(item => anomalyStatus(item) === "critical" || anomalyStatus(item) === "warning");
  const movements = measurable.flatMap(item => movement(item)).sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 8);
  const earliest = Object.values(state?.series ?? {}).flatMap(series => series.firstSeenAt ? [series.firstSeenAt] : []);
  const digest: RadarEvidenceDigest = {
    totalSeries: observations.length,
    measurableSeries: measurable.length,
    baselineReadySeries: baselineReady.length,
    baselineCoveragePercent: measurable.length ? Math.round(baselineReady.length / measurable.length * 100) : 0,
    totalSamples: (state?.totalSamples ?? 0) + measurable.length,
    anomalousSeries: anomalies.length,
    recordingGaps: measurable.filter(item => (item.recordingGapMs ?? 0) > 15 * MINUTE).length,
    longestHistoryMs: earliest.length ? Math.max(0, now - Math.min(...earliest)) : undefined,
    topMovements: movements,
  };
  return {
    digest,
    checks: assessments.flatMap(item => evidenceChecks(item, now)),
    issues: evidenceIssues(assessments, state, now),
  };
}

export function recordRadarEvidence(agencyId: string, radar: BusinessIssueRadar): void {
  const now = radar.generatedAt;
  const samples = radar.checks.filter(check => check.scope === "kpi" && check.lens === "threshold" && typeof check.value === "number" && Number.isFinite(check.value));
  mutate(state => {
    state.radarEvidence ??= {};
    const evidence = state.radarEvidence[agencyId] ?? emptyEvidence(agencyId, now);
    for (const check of samples) {
      const id = seriesId(check.domain, check.familyId);
      const existing = evidence.series[id];
      const point: RadarEvidencePoint = { at: now, value: check.value!, status: check.status === "learning" || check.status === "inactive" ? "watch" : check.status };
      const series: RadarEvidenceSeries = existing ?? {
        id,
        agencyId,
        domain: check.domain,
        familyId: check.familyId,
        familyLabel: check.familyLabel,
        sourceId: check.sourceId,
        expectedDirection: check.expectedDirection ?? "neutral",
        firstSeenAt: now,
        lastSeenAt: now,
        totalSamples: 0,
        points: [],
        hourly: [],
      };
      const pointBucket = Math.floor(now / FIVE_MINUTES);
      const previousPoint = series.points.at(-1);
      series.points = previousPoint && Math.floor(previousPoint.at / FIVE_MINUTES) === pointBucket
        ? [...series.points.slice(0, -1), point]
        : [...series.points, point].slice(-RECENT_POINT_LIMIT);
      series.hourly = updateHourly(series.hourly, point).slice(-HOURLY_ROLLUP_LIMIT);
      series.familyLabel = check.familyLabel;
      series.sourceId = check.sourceId;
      series.expectedDirection = check.expectedDirection ?? series.expectedDirection;
      series.lastSeenAt = now;
      series.totalSamples += 1;
      evidence.series[id] = series;
    }
    evidence.totalSamples += samples.length;
    evidence.lastRecordedAt = now;
    state.radarEvidence[agencyId] = evidence;
  });
}

export function inspectRadarEvidence(agencyId: string): RadarEvidenceInspectionIndex {
  const evidence = getState().radarEvidence[agencyId];
  if (!evidence) return { available: false, totalSamples: 0, series: [] };
  return {
    available: true,
    totalSamples: evidence.totalSamples,
    firstRecordedAt: evidence.firstRecordedAt,
    lastRecordedAt: evidence.lastRecordedAt,
    series: Object.values(evidence.series)
      .map(evidenceSeriesSummary)
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt || left.familyLabel.localeCompare(right.familyLabel)),
  };
}

export function inspectRadarEvidenceSeries(agencyId: string, id: string): RadarEvidenceSeriesInspection | null {
  const series = getState().radarEvidence[agencyId]?.series[id];
  if (!series) return null;
  return {
    ...evidenceSeriesSummary(series),
    points: series.points.map(point => ({ ...point })),
    hourly: series.hourly.map(rollup => ({ ...rollup })),
  };
}

function evidenceSeriesSummary(series: RadarEvidenceSeries): RadarEvidenceSeriesSummary {
  const latest = series.points.at(-1);
  return {
    id: series.id,
    domain: series.domain as AdvisorDomain,
    familyId: series.familyId,
    familyLabel: series.familyLabel,
    sourceId: series.sourceId,
    expectedDirection: series.expectedDirection,
    firstSeenAt: series.firstSeenAt,
    lastSeenAt: series.lastSeenAt,
    totalSamples: series.totalSamples,
    retainedPointCount: series.points.length,
    hourlyRollupCount: series.hourly.length,
    latestValue: latest?.value,
    latestStatus: latest?.status,
    recentPoints: series.points.slice(-24).map(point => ({ ...point })),
    recentHourly: series.hourly.slice(-24).map(rollup => ({ ...rollup })),
  };
}

function assess(
  observation: RadarObservation,
  series: RadarEvidenceSeries | undefined,
  now: number,
  configuration?: RadarPolicyConfiguration,
): EvidenceAssessment {
  const history = historicalPoints(series);
  const values = history.map(point => point.value);
  const policy = configuration ? resolveRadarPolicy(configuration, observation.domain, observation.familyId) : undefined;
  const requiredPoints = Math.max(1, policy?.minimumSampleSize ?? DEFAULT_BASELINE_POINTS);
  const requiredSpan = policy ? Math.max(0, policy.learningPeriodDays) * DAY : DEFAULT_BASELINE_SPAN_MS;
  const baselineReady = values.length >= requiredPoints && history.length > 0 && history.at(-1)!.at - history[0]!.at >= requiredSpan;
  const baseline = baselineReady ? median(values) : undefined;
  const previous = series?.points.at(-1)?.value ?? series?.hourly.at(-1)?.last;
  const changePercent = percentageChange(observation.current, previous);
  const mad = baselineReady && baseline !== undefined ? median(values.map(value => Math.abs(value - baseline))) : 0;
  const current = observation.current;
  const deviationScore = baselineReady && baseline !== undefined && typeof current === "number"
    ? mad > 0 ? 0.6745 * Math.abs(current - baseline) / mad : current === baseline ? 0 : 99
    : 0;
  const direction = observation.expectedDirection ?? series?.expectedDirection ?? "neutral";
  const adverse = changePercent === undefined ? false : direction === "higher" ? changePercent < 0 : direction === "lower" ? changePercent > 0 : false;
  return {
    observation,
    series,
    history,
    baselineReady,
    baseline,
    previous,
    changePercent,
    deviationScore,
    adverse,
    recordingGapMs: series?.lastSeenAt ? Math.max(0, now - series.lastSeenAt) : undefined,
  };
}

function evidenceChecks(assessment: EvidenceAssessment, now: number): BusinessRadarCheck[] {
  const { observation, series, baselineReady, baseline, previous, changePercent, deviationScore, adverse, recordingGapMs } = assessment;
  const current = observation.current;
  const common = {
    domain: observation.domain,
    familyId: observation.familyId,
    familyLabel: observation.familyId ? observationLabel(observation) : observation.familyId,
    scope: "history" as const,
    href: observation.href,
    sourceId: `evidence:${observation.domain}:${observation.familyId}`,
    measuredAt: now,
    lastSeenAt: series?.lastSeenAt,
    value: current ?? undefined,
    previousValue: previous,
    historySamples: assessment.history.length,
    historySpanMs: assessment.history.length > 1 ? assessment.history.at(-1)!.at - assessment.history[0]!.at : 0,
    expectedDirection: observation.expectedDirection,
  };
  const noValue = current === null || !Number.isFinite(current);
  const velocityStatus: RadarCheckStatus = noValue ? "blind" : changePercent === undefined ? "watch" : adverse && Math.abs(changePercent) >= 75 ? "critical" : adverse && Math.abs(changePercent) >= 35 ? "warning" : Math.abs(changePercent) >= 75 ? "watch" : "pass";
  const continuityStatus: RadarCheckStatus = noValue ? "blind" : !series ? "watch" : recordingGapMs! > 60 * MINUTE ? "critical" : recordingGapMs! > 15 * MINUTE ? "warning" : "pass";
  return [
    historical(common, "baseline", noValue ? "blind" : baselineReady ? "pass" : "watch", baselineReady ? `${common.familyLabel} has a durable comparison baseline.` : `${common.familyLabel} is still accumulating independent time-series depth.`, [`${assessment.history.length} retained time points`, baseline === undefined ? "Baseline pending" : `Median ${formatNumber(baseline)}`]),
    historical(common, "trend", velocityStatus, changePercent === undefined ? `${common.familyLabel} needs a prior recorded value before velocity can be measured.` : `${common.familyLabel} moved ${signed(changePercent)}% from its latest retained value.`, [`Current ${formatNumber(current)}`, previous === undefined ? "Previous unavailable" : `Previous ${formatNumber(previous)}`]),
    historical(common, "anomaly", noValue ? "blind" : anomalyStatus(assessment), !baselineReady ? `${common.familyLabel} needs more retained history before statistical deviation is trusted.` : `${common.familyLabel} is ${deviationScore.toFixed(1)} robust deviations from its retained median.`, [baseline === undefined ? "Median pending" : `Median ${formatNumber(baseline)}`, `Deviation score ${deviationScore.toFixed(1)}`]),
    historical(common, "continuity", continuityStatus, !series ? `${common.familyLabel} has not been written to the evidence vault yet.` : recordingGapMs! > 15 * MINUTE ? `${common.familyLabel} evidence recording is outside its continuity agreement.` : `${common.familyLabel} evidence recording is current.`, [series ? `Last retained ${duration(recordingGapMs ?? 0)} ago` : "No retained sample", "Continuity agreement 15m"]),
  ];
}

function evidenceIssues(assessments: EvidenceAssessment[], state: RadarEvidenceState | undefined, now: number): BusinessRadarIssue[] {
  const issues: BusinessRadarIssue[] = [];
  if (state?.lastRecordedAt && now - state.lastRecordedAt > 60 * MINUTE) {
    issues.push({
      id: "evidence:vault-recording-gap",
      severity: "critical",
      domain: "systems",
      title: "Radar evidence vault has stopped recording",
      detail: "Current business values can still be read, but durable historical comparison has fallen outside its continuity agreement.",
      evidence: [`Last recorded ${duration(now - state.lastRecordedAt)} ago`, "Continuity agreement 15m"],
      href: "/portal/agency/company?view=connections",
      detectedAt: state.lastRecordedAt,
      sourceIds: ["radar:evidence-vault"],
    });
  }
  for (const assessment of assessments.filter(item => ["critical", "warning"].includes(anomalyStatus(item))).slice(0, 16)) {
    const severity = anomalyStatus(assessment) as "critical" | "warning";
    const current = assessment.observation.current as number;
    issues.push({
      id: `evidence:anomaly:${assessment.observation.domain}:${assessment.observation.familyId}`,
      severity,
      domain: assessment.observation.domain,
      title: `${observationLabel(assessment.observation)} broke its historical pattern`,
      detail: `The current value is ${assessment.deviationScore.toFixed(1)} robust deviations from its retained median${assessment.adverse ? " and is moving against the desired direction" : ""}.`,
      evidence: [`Current ${formatNumber(current)}`, `Median ${formatNumber(assessment.baseline)}`, `Change ${signed(assessment.changePercent ?? 0)}%`],
      href: assessment.observation.href,
      detectedAt: now,
      sourceIds: [`evidence:${assessment.observation.domain}:${assessment.observation.familyId}`, assessment.observation.sourceId],
    });
  }
  return issues;
}

function anomalyStatus(assessment: EvidenceAssessment): RadarCheckStatus {
  if (assessment.observation.current === null || !Number.isFinite(assessment.observation.current)) return "blind";
  if (!assessment.baselineReady || assessment.changePercent === undefined) return "watch";
  const magnitude = Math.abs(assessment.changePercent);
  if (assessment.deviationScore >= 6 && magnitude >= 50) return "critical";
  if (assessment.deviationScore >= 3.5 && magnitude >= 20) return "warning";
  if (assessment.deviationScore >= 2.5 && magnitude >= 10) return "watch";
  return "pass";
}

function movement(assessment: EvidenceAssessment): RadarEvidenceMovement[] {
  const current = assessment.observation.current;
  if (!assessment.baselineReady || assessment.baseline === undefined || typeof current !== "number" || assessment.changePercent === undefined) return [];
  return [{
    id: seriesId(assessment.observation.domain, assessment.observation.familyId),
    domain: assessment.observation.domain,
    familyLabel: observationLabel(assessment.observation),
    current,
    baseline: assessment.baseline,
    changePercent: assessment.changePercent,
    deviationScore: assessment.deviationScore,
    adverse: assessment.adverse,
  }];
}

function historical(
  common: Omit<BusinessRadarCheck, "id" | "ruleId" | "lens" | "lensLabel" | "status" | "title" | "detail" | "evidence">,
  lens: RadarRuleLens,
  status: RadarCheckStatus,
  detail: string,
  evidence: string[],
): BusinessRadarCheck {
  return {
    ...common,
    id: `history:${common.domain}:${common.familyId}:${lens}`,
    ruleId: `history:${lens}`,
    lens,
    lensLabel: readable(lens),
    status,
    title: `${common.familyLabel}: historical ${readable(lens).toLowerCase()}`,
    detail,
    evidence,
  };
}

function historicalPoints(series?: RadarEvidenceSeries): RadarEvidencePoint[] {
  if (!series) return [];
  const byTimestamp = new Map<number, RadarEvidencePoint>();
  const earliestRecent = series.points[0]?.at;
  for (const hour of series.hourly.slice(-72)) {
    if (earliestRecent !== undefined && hour.hour + HOUR > earliestRecent) continue;
    byTimestamp.set(hour.hour, { at: hour.hour, value: hour.average, status: "pass" });
  }
  for (const point of series.points) byTimestamp.set(point.at, point);
  return [...byTimestamp.values()].sort((a, b) => a.at - b.at).slice(-360);
}

function updateHourly(hourly: RadarEvidenceSeries["hourly"], point: RadarEvidencePoint): RadarEvidenceSeries["hourly"] {
  const hour = Math.floor(point.at / HOUR) * HOUR;
  const existing = hourly.at(-1);
  if (existing?.hour !== hour) return [...hourly, { hour, samples: 1, minimum: point.value, maximum: point.value, average: point.value, last: point.value }];
  const samples = existing.samples + 1;
  return [...hourly.slice(0, -1), {
    hour,
    samples,
    minimum: Math.min(existing.minimum, point.value),
    maximum: Math.max(existing.maximum, point.value),
    average: (existing.average * existing.samples + point.value) / samples,
    last: point.value,
  }];
}

function emptyEvidence(agencyId: string, now: number): RadarEvidenceState {
  return { agencyId, totalSamples: 0, firstRecordedAt: now, lastRecordedAt: now, series: {} };
}

function seriesId(domain: AdvisorDomain, familyId: string): string {
  return `${domain}:${familyId}`;
}

function observationLabel(observation: RadarObservation): string {
  return observation.familyId.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function percentageChange(current: number | null, previous?: number): number | undefined {
  if (current === null || previous === undefined) return undefined;
  if (previous === 0) return current === 0 ? 0 : 100;
  return (current - previous) / Math.abs(previous) * 100;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "unavailable";
  return Math.abs(value) >= 1_000 ? value.toLocaleString("en-GB", { maximumFractionDigits: 1 }) : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function duration(milliseconds: number): string {
  if (milliseconds < MINUTE) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < HOUR) return `${Math.round(milliseconds / MINUTE)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / HOUR)}h`;
  return `${Math.round(milliseconds / DAY)}d`;
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
