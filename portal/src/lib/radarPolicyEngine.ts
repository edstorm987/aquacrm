import type {
  AdvisorCoverageSource,
  AdvisorDomain,
  BusinessIssueRadar,
  BusinessMetricSignal,
  BusinessRadarAdaptiveState,
  BusinessRadarCheck,
  BusinessRadarConclusion,
  BusinessRadarIncident,
  BusinessRadarIssue,
  RadarCheckStatus,
} from "@/lib/businessRadar";
import { summarizeRadarChecks } from "@/lib/radarCheckEngine";
import type { RadarPolicyConfiguration, RadarPolicyRule } from "@/server/types";

const DAY = 86_400_000;
const DYNAMIC_LENSES = new Set(["baseline", "trend", "anomaly", "forecast", "volatility"]);
const INACTIVE_STATES = new Set(["paused", "not-applicable", "retired"]);
const ALWAYS_ON_PATTERN = /security|breach|server|runtime|outage|error|payment|invoice|cash|tax|insurance|legal|contract|compliance|payroll|backup|synthetic|watchdog|canary/i;

export interface RadarBusinessContext {
  currency: string;
  monthRevenueCents: number;
  monthlyRevenueTargetCents: number;
  revenueGapCents: number;
  leadCount: number;
  activeClientCount: number;
  meetingsThisMonth: number;
  estimatedCallsNeeded: number;
}

interface AdaptiveRadarInput {
  checks: BusinessRadarCheck[];
  issues: BusinessRadarIssue[];
  signals: BusinessMetricSignal[];
  coverage: AdvisorCoverageSource[];
  policy: RadarPolicyConfiguration;
  business: RadarBusinessContext;
  enquiryCount: number;
  now: number;
}

export interface AdaptiveRadarResult {
  checks: BusinessRadarCheck[];
  issues: BusinessRadarIssue[];
  incidents: BusinessRadarIncident[];
  domains: BusinessIssueRadar["domains"];
  adaptive: BusinessRadarAdaptiveState;
}

export interface ResolvedRadarPolicy extends RadarPolicyRule {
  state: Exclude<NonNullable<RadarPolicyRule["state"]>, "inherit">;
  activationCondition: NonNullable<RadarPolicyRule["activationCondition"]>;
  baselineStrategy: NonNullable<RadarPolicyRule["baselineStrategy"]>;
  warningTolerancePercent: number;
  criticalTolerancePercent: number;
  minimumSampleSize: number;
  learningPeriodDays: number;
  evaluationWindow: NonNullable<RadarPolicyRule["evaluationWindow"]>;
  businessHoursOnly: boolean;
  notificationCadence: NonNullable<RadarPolicyRule["notificationCadence"]>;
}

export function resolveRadarPolicy(
  configuration: RadarPolicyConfiguration,
  domain: AdvisorDomain,
  familyId?: string,
  checkId?: string,
): ResolvedRadarPolicy {
  const domainRule = configuration.domainPolicies[domain] ?? {};
  const familyRule = familyId
    ? configuration.metricPolicies[`${domain}:${familyId}`] ?? configuration.metricPolicies[familyId] ?? {}
    : {};
  const checkRule = checkId ? configuration.metricPolicies[checkId] ?? {} : {};
  const merged = { ...configuration.defaultPolicy, ...domainRule, ...familyRule, ...checkRule };
  return {
    ...merged,
    state: merged.state && merged.state !== "inherit" ? merged.state : "learning",
    activationCondition: merged.activationCondition ?? "on-first-activity",
    baselineStrategy: merged.baselineStrategy ?? "target-and-baseline",
    warningTolerancePercent: merged.warningTolerancePercent ?? 15,
    criticalTolerancePercent: Math.max(merged.warningTolerancePercent ?? 15, merged.criticalTolerancePercent ?? 30),
    minimumSampleSize: merged.minimumSampleSize ?? 12,
    learningPeriodDays: merged.learningPeriodDays ?? 30,
    evaluationWindow: merged.evaluationWindow ?? "daily",
    businessHoursOnly: merged.businessHoursOnly ?? false,
    notificationCadence: merged.notificationCadence ?? "daily",
  };
}

export function applyAdaptiveRadarPolicy(input: AdaptiveRadarInput): AdaptiveRadarResult {
  const sourceByDomain = groupCoverage(input.coverage);
  const activeExceptions = input.policy.exceptions.filter(exception => exception.expiresAt > input.now);
  const checks = input.checks.map(check => {
    const policy = resolveRadarPolicy(input.policy, check.domain, check.familyId, check.id);
    const alwaysOn = isAlwaysOnCheck(check);
    const exception = activeExceptions.find(item => item.domain === check.domain && (!item.metricId || item.metricId === check.id || item.metricId === check.familyId || item.metricId === `${check.domain}:${check.familyId}`));
    let status = applyConfiguredTarget(check, policy);
    const sources = sourceByDomain.get(check.domain) ?? [];
    const hasActivity = sources.some(source => source.recordCount > 0) || (check.sampleSize ?? 0) > 0 || typeof check.value === "number" && check.value !== 0;
    const historical = check.scope === "history" || DYNAMIC_LENSES.has(check.lens);
    const enoughSamples = (check.historySamples ?? check.sampleSize ?? 0) >= policy.minimumSampleSize;
    const enoughTime = policy.learningPeriodDays === 0 || (check.historySpanMs ?? 0) >= policy.learningPeriodDays * DAY;
    const seasonalActive = policy.state !== "seasonal" || !policy.activeMonths?.length || policy.activeMonths.includes(new Date(input.now).getMonth() + 1);
    const explicitlyInactive = INACTIVE_STATES.has(policy.state) || !seasonalActive || (input.policy.operatingStage === "paused" && !alwaysOn);

    if (!alwaysOn && (explicitlyInactive || exception?.effect === "pause-check")) {
      status = "inactive";
    } else if (!alwaysOn && policy.baselineStrategy === "target-only" && historical) {
      status = "inactive";
    } else if (!alwaysOn && policy.activationCondition === "manual" && policy.state !== "live") {
      status = "inactive";
    } else if (!alwaysOn && historical && (!enoughSamples || !enoughTime)) {
      status = "learning";
    } else if (!alwaysOn && policy.activationCondition !== "immediate" && !hasActivity && !isAuthoritativeFailure(check, status, policy)) {
      status = "learning";
    } else if (!alwaysOn && policy.state === "learning" && !enoughSamples && !isAuthoritativeFailure(check, status, policy)) {
      status = "learning";
    }

    if (!alwaysOn && exception?.effect === "downgrade-to-watch" && (status === "critical" || status === "warning")) status = "watch";
    return { ...check, status, policy, alwaysOn, exceptionId: exception?.id };
  });

  const conclusions = buildConclusions(input, checks);
  const conclusionIssues = conclusions.flatMap(conclusion => conclusion.severity === "info" ? [] : [{
    id: `conclusion:${conclusion.id}`,
    severity: conclusion.severity,
    domain: conclusion.domain,
    title: conclusion.title,
    detail: conclusion.detail,
    evidence: ["Adaptive Radar operating policy"],
    href: conclusion.href,
    detectedAt: input.now,
    sourceIds: [`adaptive:${conclusion.id}`],
  } satisfies BusinessRadarIssue]);
  const issues = dedupeIssues([...input.issues, ...conclusionIssues]
    .flatMap(issue => applyIssuePolicy(issue, input.policy, activeExceptions, input.now)));
  const incidents = groupIncidents(issues, checks);
  const domains = summarizeRadarChecks(checks, input.coverage);
  const applicableChecks = checks.filter(check => check.status !== "inactive");
  const learningChecks = checks.filter(check => check.status === "learning").length;
  const inactiveChecks = checks.filter(check => check.status === "inactive").length;
  const blindChecks = checks.filter(check => check.status === "blind").length;
  const confidentChecks = applicableChecks.filter(check => check.status !== "learning" && check.status !== "blind").length;
  const sourceConfidence = input.coverage.length
    ? input.coverage.reduce((total, source) => total + (source.status === "connected" ? 1 : source.status === "empty" ? 0.2 : 0), 0) / input.coverage.length
    : 0;
  const checkConfidence = applicableChecks.length ? (confidentChecks + learningChecks * 0.25) / applicableChecks.length : 0;
  const confidencePercent = clampScore((sourceConfidence * 0.55 + checkConfidence * 0.45) * 100);
  const domainReadiness = domains.length ? domains.reduce((total, domain) => total + domain.readinessPercent, 0) / domains.length : 0;
  const readinessPercent = clampScore(domainReadiness);
  const companyHealth = input.signals.find(signal => signal.id === "metric:company-health")?.value;
  const incidentHealth = clampScore(100 - incidents.reduce((total, incident) => total + (incident.severity === "critical" ? 18 : incident.severity === "warning" ? 7 : 2), 0));
  const healthScore = clampScore(typeof companyHealth === "number" ? companyHealth * 0.7 + incidentHealth * 0.3 : incidentHealth);
  const calibratingDomains = domains.filter(domain => domain.learningChecks > 0).map(domain => domain.domain);

  return {
    checks,
    issues,
    incidents,
    domains,
    adaptive: {
      operatingStage: input.policy.operatingStage,
      healthScore,
      confidencePercent,
      readinessPercent,
      liveChecks: applicableChecks.length - learningChecks - blindChecks,
      learningChecks,
      inactiveChecks,
      alwaysOnChecks: checks.filter(check => check.alwaysOn).length,
      calibratingDomains,
      conclusions,
      policy: input.policy,
    },
  };
}

function applyConfiguredTarget(check: BusinessRadarCheck, policy: ResolvedRadarPolicy): RadarCheckStatus {
  if (check.lens !== "threshold" || typeof policy.targetValue !== "number" || typeof check.value !== "number") return check.status;
  const direction = policy.expectedDirection ?? check.expectedDirection ?? "neutral";
  if (direction === "neutral") return check.status;
  const target = policy.targetValue;
  const distance = direction === "higher" ? target - check.value : check.value - target;
  if (distance <= 0) return "pass";
  const breachPercent = Math.abs(target) > 0 ? distance / Math.abs(target) * 100 : distance > 0 ? 100 : 0;
  if (breachPercent >= policy.criticalTolerancePercent) return "critical";
  if (breachPercent >= policy.warningTolerancePercent) return "warning";
  return "watch";
}

function isAuthoritativeFailure(check: BusinessRadarCheck, status: RadarCheckStatus, policy: ResolvedRadarPolicy): boolean {
  if (status !== "critical" && status !== "warning") return false;
  return check.lens === "threshold" || typeof policy.targetValue === "number";
}

function isAlwaysOnCheck(check: BusinessRadarCheck): boolean {
  return check.domain === "systems"
    || check.domain === "compliance"
    || check.scope === "synthetic"
    || check.scope === "watchdog"
    || ALWAYS_ON_PATTERN.test(`${check.id} ${check.familyId} ${check.title}`);
}

function isAlwaysOnIssue(issue: BusinessRadarIssue): boolean {
  return issue.domain === "systems" || issue.domain === "compliance" || ALWAYS_ON_PATTERN.test(`${issue.id} ${issue.title}`);
}

function applyIssuePolicy(
  issue: BusinessRadarIssue,
  configuration: RadarPolicyConfiguration,
  exceptions: RadarPolicyConfiguration["exceptions"],
  now: number,
): BusinessRadarIssue[] {
  const familyId = issue.id.split(":").slice(1, 3).join(":");
  const policy = resolveRadarPolicy(configuration, issue.domain, familyId, issue.id);
  const alwaysOn = isAlwaysOnIssue(issue) || issue.id === "metric:company-health-below-target" || issue.id.startsWith("conclusion:");
  const exception = exceptions.find(item => item.domain === issue.domain && (!item.metricId || item.metricId === issue.id || item.metricId === familyId));
  const seasonalActive = policy.state !== "seasonal" || !policy.activeMonths?.length || policy.activeMonths.includes(new Date(now).getMonth() + 1);
  if (!alwaysOn && (INACTIVE_STATES.has(policy.state) || !seasonalActive || configuration.operatingStage === "paused" || exception?.effect === "pause-check")) return [];
  const shouldCalibrate = !alwaysOn && policy.state === "learning" && /coverage|baseline|evidence|correlation|memory/i.test(issue.id);
  const downgraded = shouldCalibrate || exception?.effect === "downgrade-to-watch";
  return [{ ...issue, severity: downgraded ? "watch" : issue.severity }];
}

function buildConclusions(input: AdaptiveRadarInput, checks: BusinessRadarCheck[]): BusinessRadarConclusion[] {
  const conclusions: BusinessRadarConclusion[] = [];
  const target = input.business.monthlyRevenueTargetCents;
  if (target > 0 && input.business.monthRevenueCents === 0 && input.business.leadCount === 0 && input.business.activeClientCount === 0) {
    conclusions.push({
      id: "commercial-engine-not-established",
      domain: "company",
      severity: "critical",
      title: "Commercial engine not yet established",
      detail: "Revenue, active clients, and pipeline are all at zero. This is an operating gap against the plan, not a healthy baseline.",
      href: "/portal/agency?station=battle",
    });
  }
  if (target > 0 && input.business.revenueGapCents > 0 && input.business.meetingsThisMonth < input.business.estimatedCallsNeeded) {
    conclusions.push({
      id: "pipeline-below-revenue-plan",
      domain: "sales",
      severity: "warning",
      title: `${formatMoney(target, input.business.currency)} monthly target lacks sufficient pipeline`,
      detail: `${input.business.estimatedCallsNeeded} sales calls are estimated for the current revenue gap; ${input.business.meetingsThisMonth} are currently booked this month.`,
      href: "/portal/clients?view=journey",
    });
  }
  const forms = input.signals.find(signal => signal.id === "metric:form-submissions")?.value ?? 0;
  const traffic = input.signals.find(signal => signal.id === "metric:traffic-7d")?.value ?? 0;
  if (forms === 0 && traffic === 0) {
    conclusions.push({
      id: "marketing-demand-not-measurable",
      domain: "marketing",
      severity: "watch",
      title: "Marketing is not producing measurable demand",
      detail: "No tracked traffic or form submissions are available in the current window. Connect acquisition sources or launch activity before expecting conversion conclusions.",
      href: "/portal/agency/marketing",
    });
  }
  if (input.enquiryCount === 0) {
    conclusions.push({
      id: "lead-clock-not-started",
      domain: "sales",
      severity: "info",
      title: "No enquiry SLA breach",
      detail: "No enquiry has entered the response clock yet. Speed-to-lead monitoring will activate on the first enquiry.",
      href: "/portal/agency/inbox?view=forms",
    });
  }
  const calibrating = new Set(checks.filter(check => check.status === "learning").map(check => check.domain));
  if (calibrating.size) {
    conclusions.push({
      id: "domains-calibrating",
      domain: "systems",
      severity: "info",
      title: `${calibrating.size} business area${calibrating.size === 1 ? " is" : "s are"} calibrating`,
      detail: `${[...calibrating].map(readable).join(", ")} will gain trend and anomaly confidence as independent evidence accumulates.`,
      href: "/portal/agency#radar-policy",
    });
  }
  return conclusions;
}

function groupIncidents(issues: BusinessRadarIssue[], checks: BusinessRadarCheck[]): BusinessRadarIncident[] {
  const groups = new Map<string, BusinessRadarIssue[]>();
  for (const issue of issues) {
    const key = `${issue.domain}:${issueCategory(issue)}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  return [...groups.entries()].map(([key, findings]) => {
    const sorted = [...findings].sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || right.detectedAt - left.detectedAt);
    const primary = sorted[0]!;
    const matchingChecks = exactIncidentChecks(findings, checks);
    return {
      ...primary,
      id: `incident:${key}`,
      detail: findings.length > 1 ? `${primary.detail} ${findings.length - 1} related finding${findings.length === 2 ? " is" : "s are"} grouped here.` : primary.detail,
      evidence: [...new Set(findings.flatMap(finding => finding.evidence))].slice(0, 8),
      sourceIds: [...new Set(findings.flatMap(finding => finding.sourceIds))],
      issueIds: findings.map(finding => finding.id),
      checkIds: matchingChecks.map(check => check.id),
      findingCount: findings.length + matchingChecks.length,
    };
  }).sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || right.findingCount - left.findingCount);
}

function exactIncidentChecks(findings: BusinessRadarIssue[], checks: BusinessRadarCheck[]): BusinessRadarCheck[] {
  const selected = new Map<string, BusinessRadarCheck>();
  for (const finding of findings) {
    const blindDomain = finding.id.match(/^coverage:([a-z-]+)-check-blindness$/)?.[1];
    if (blindDomain) {
      for (const check of checks) {
        if (check.domain === blindDomain && check.status === "blind") selected.set(check.id, check);
      }
      continue;
    }

    for (const check of checks) {
      if (check.domain !== finding.domain || !["critical", "warning", "watch", "blind"].includes(check.status)) continue;
      if (finding.sourceIds.some(sourceId => referencesCheck(sourceId, check))) selected.set(check.id, check);
    }
  }
  return [...selected.values()].sort((left, right) => checkStatusRank(left.status) - checkStatusRank(right.status) || left.title.localeCompare(right.title));
}

function referencesCheck(sourceId: string, check: BusinessRadarCheck): boolean {
  const candidates = [check.id, check.sourceId, check.familyId, `${check.domain}:${check.familyId}`];
  return candidates.some(candidate => candidate === sourceId || candidate.endsWith(`:${sourceId}`) || sourceId.endsWith(`:${candidate}`));
}

function checkStatusRank(status: RadarCheckStatus): number {
  if (status === "critical" || status === "blind") return 0;
  if (status === "warning") return 1;
  if (status === "watch") return 2;
  return 3;
}

function issueCategory(issue: BusinessRadarIssue): string {
  if (issue.id.startsWith("conclusion:")) return issue.id;
  if (/coverage|blind|connection/.test(issue.id)) return "coverage";
  if (/evidence|baseline|anomaly|memory/.test(issue.id)) return "evidence";
  if (/correlation/.test(issue.id)) return "compound-risk";
  if (/speed-to-lead|enquiry|lead/.test(issue.id)) return "lead-response";
  if (/health/.test(issue.id)) return "health";
  if (/synthetic|probe|runtime|server|outage|error/.test(issue.id)) return "reliability";
  return issue.id.split(":").slice(0, 2).join(":");
}

function groupCoverage(coverage: AdvisorCoverageSource[]): Map<AdvisorDomain, AdvisorCoverageSource[]> {
  const grouped = new Map<AdvisorDomain, AdvisorCoverageSource[]>();
  for (const source of coverage) grouped.set(source.domain, [...(grouped.get(source.domain) ?? []), source]);
  return grouped;
}

function dedupeIssues(issues: BusinessRadarIssue[]): BusinessRadarIssue[] {
  return [...new Map(issues.map(issue => [issue.id, issue])).values()].sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || right.detectedAt - left.detectedAt);
}

function severityRank(severity: BusinessRadarIssue["severity"]): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}
