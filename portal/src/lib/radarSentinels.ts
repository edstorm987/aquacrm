import type {
  AdvisorCoverageSource,
  AdvisorDomain,
  BusinessRadarCheck,
  BusinessRadarIssue,
  RadarCoverageManifest,
  RadarEvidenceDigest,
  RadarCheckScope,
  RadarCheckStatus,
  RadarRuleLens,
} from "@/lib/businessRadar";
import type { RadarTelemetryProperty, RadarTelemetrySnapshot } from "@/lib/server/radarTelemetry";
import { isoDateTimeValue } from "@/lib/formatDateTime";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const EXPECTED_CATALOG_CHECKS = 1_728;
const EXPECTED_DOMAIN_FLOOR = 144;

export function buildSourceSentinelChecks(
  coverage: readonly AdvisorCoverageSource[],
  now: number,
): BusinessRadarCheck[] {
  return coverage.flatMap(source => {
    const cadence = sourceCadence(source.domain);
    const age = source.lastActivityAt ? Math.max(0, now - source.lastActivityAt) : null;
    const disconnected = source.status === "disconnected" || source.status === "unavailable";
    const siblings = coverage.filter(candidate => candidate.domain === source.domain && candidate.id !== source.id && candidate.status !== "disconnected" && candidate.status !== "unavailable");
    const structuralIntegrity = Number.isFinite(source.recordCount) && source.recordCount >= 0 && (!source.lastActivityAt || Number.isFinite(source.lastActivityAt));
    const route = domainRoute(source.domain);
    const common = {
      domain: source.domain,
      familyId: `source:${source.id}`,
      familyLabel: source.label,
      scope: "source" as const,
      href: route,
      sourceId: source.id,
      measuredAt: now,
      lastSeenAt: source.lastActivityAt,
    };

    return [
      sentinel(common, "connection", disconnected ? "blind" : source.status === "empty" ? "watch" : "pass", disconnected ? `${source.label} is not available to the radar.` : source.status === "empty" ? `${source.label} is connected but has not produced a retained record.` : `${source.label} is connected and readable.`, [`Connection ${source.status}`, `${source.recordCount} records`]),
      sentinel(common, "freshness", disconnected ? "blind" : age === null ? "watch" : age > cadence * 3 ? "critical" : age > cadence ? "warning" : "pass", age === null ? `${source.label} has no trustworthy activity timestamp.` : age > cadence ? `${source.label} is reporting outside its freshness agreement.` : `${source.label} is inside its freshness agreement.`, [age === null ? "Last activity unavailable" : `Last activity ${duration(age)} ago`, `Freshness agreement ${duration(cadence)}`]),
      sentinel(common, "threshold", disconnected ? "blind" : source.recordCount === 0 ? "watch" : "pass", source.recordCount === 0 ? `${source.label} has no retained data flow to evaluate.` : `${source.label} is producing readable business records.`, [`Records ${source.recordCount}`, `Source state ${source.status}`]),
      sentinel(common, "integrity", disconnected ? "blind" : structuralIntegrity ? "pass" : "warning", structuralIntegrity ? `${source.label} metadata is structurally valid.` : `${source.label} returned invalid record or timestamp metadata.`, [`Record count ${source.recordCount}`, source.lastActivityAt ? `Timestamp ${isoDateTimeValue(source.lastActivityAt) ?? "needs review"}` : "Timestamp absent"]),
      sentinel(common, "continuity", disconnected ? "blind" : age === null ? "watch" : age > cadence * 2 ? "critical" : age > cadence ? "warning" : "pass", age === null ? `${source.label} continuity cannot be proved yet.` : age > cadence ? `${source.label} has a break in expected reporting continuity.` : `${source.label} reporting continuity is intact.`, [age === null ? "No continuity timestamp" : `Signal age ${duration(age)}`, `Continuity window ${duration(cadence)}`]),
      sentinel(common, "baseline", disconnected ? "blind" : source.recordCount >= 10 ? "pass" : "watch", source.recordCount >= 10 ? `${source.label} has enough retained records for a basic operating baseline.` : `${source.label} needs more retained history before normal behaviour can be established confidently.`, [`Records ${source.recordCount}`, "Baseline floor 10"]),
      sentinel(common, "confidence", disconnected ? "blind" : source.recordCount >= 5 ? "pass" : "watch", source.recordCount >= 5 ? `${source.label} has enough evidence for source-level conclusions.` : `${source.label} has a low evidence volume, so source-level conclusions remain provisional.`, [`Records ${source.recordCount}`, "Confidence floor 5"]),
      sentinel(common, "resilience", disconnected ? "blind" : siblings.length ? "pass" : "watch", siblings.length ? `${source.label} belongs to a domain with another available evidence path.` : `${source.label} is currently a single point of observability for ${readable(source.domain)}.`, [`${siblings.length} alternate domain source${siblings.length === 1 ? "" : "s"}`, `Primary ${source.id}`]),
    ];
  });
}

export function buildPropertySentinelChecks(
  telemetry: RadarTelemetrySnapshot,
  now: number,
): BusinessRadarCheck[] {
  return telemetry.properties.flatMap(property => propertyChecks(property, now));
}

export function buildRadarWatchdogChecks(input: {
  checks: readonly BusinessRadarCheck[];
  coverage: readonly AdvisorCoverageSource[];
  telemetry: RadarTelemetrySnapshot;
  correlationIssues: readonly BusinessRadarIssue[];
  evidence?: RadarEvidenceDigest;
  /** Entity coverage manifest (radar upgrade Stage 6). When present, adds the coverage-gaps self-check. */
  coverageManifest?: RadarCoverageManifest;
  now: number;
}): BusinessRadarCheck[] {
  const { checks, coverage, telemetry, correlationIssues, evidence, coverageManifest, now } = input;
  const ids = checks.map(check => check.id);
  const uniqueIds = new Set(ids);
  const domains = new Map<AdvisorDomain, number>();
  for (const check of checks) domains.set(check.domain, (domains.get(check.domain) ?? 0) + 1);
  const domainFloorFailures = [...domains].filter(([, count]) => count < EXPECTED_DOMAIN_FLOOR);
  const incompleteEvidence = checks.filter(check => !check.detail.trim() || !check.evidence.length);
  const missingRoutes = checks.filter(check => !check.href.startsWith("/"));
  const missingSources = checks.filter(check => !check.sourceId.trim());
  const invalidTimestamps = checks.filter(check => !Number.isFinite(check.measuredAt) || check.measuredAt <= 0 || check.measuredAt > now + 5 * 60_000);
  const blindChecks = checks.filter(check => check.status === "blind");
  const unavailableSources = coverage.filter(source => source.status === "disconnected" || source.status === "unavailable");
  const expectedProperties = telemetry.properties.filter(property => property.expectedLive);
  const propertySentinels = checks.filter(check => check.scope === "property");
  const syntheticSentinels = checks.filter(check => check.scope === "synthetic");
  const staleCanaries = syntheticSentinels.filter(check => check.lens === "freshness" && check.status !== "pass");
  const historicalChecks = checks.filter(check => check.scope === "history");
  const rules: Array<{ id: string; label: string; lens: RadarRuleLens; status: RadarCheckStatus; detail: string; evidence: string[] }> = [
    { id: "catalog-floor", label: "KPI catalogue floor", lens: "integrity", status: checks.filter(check => check.scope === "kpi").length >= EXPECTED_CATALOG_CHECKS ? "pass" : "critical", detail: "Confirms that the complete deterministic KPI catalogue loaded into this sweep.", evidence: [`${checks.filter(check => check.scope === "kpi").length} KPI checks`, `Expected at least ${EXPECTED_CATALOG_CHECKS}`] },
    { id: "unique-check-ids", label: "Check identity integrity", lens: "integrity", status: uniqueIds.size === ids.length ? "pass" : "critical", detail: "Ensures no detector overwrites another detector in the ledger.", evidence: [`${ids.length} checks`, `${uniqueIds.size} unique IDs`] },
    { id: "domain-floor", label: "Domain coverage floor", lens: "connection", status: domainFloorFailures.length ? "critical" : "pass", detail: "Ensures every business domain retains its minimum independent detector count.", evidence: domainFloorFailures.length ? domainFloorFailures.map(([domain, count]) => `${readable(domain)} ${count}`) : [`Every domain has at least ${EXPECTED_DOMAIN_FLOOR} checks`] },
    { id: "evidence-completeness", label: "Evidence completeness", lens: "confidence", status: incompleteEvidence.length ? "warning" : "pass", detail: "Checks that every detector carries an explanation and inspectable evidence.", evidence: [`${incompleteEvidence.length} incomplete checks`, `${checks.length} checked`] },
    { id: "route-completeness", label: "Evidence route completeness", lens: "resilience", status: missingRoutes.length ? "warning" : "pass", detail: "Checks that every detector can route the operator toward supporting evidence.", evidence: [`${missingRoutes.length} missing routes`, `${checks.length} checked`] },
    { id: "source-attribution", label: "Detector source attribution", lens: "integrity", status: missingSources.length ? "warning" : "pass", detail: "Checks that every result names the source that produced it.", evidence: [`${missingSources.length} unattributed checks`, `${checks.length} checked`] },
    { id: "timestamp-integrity", label: "Sweep timestamp integrity", lens: "freshness", status: invalidTimestamps.length ? "critical" : "pass", detail: "Rejects impossible, missing, or future detector timestamps.", evidence: [`${invalidTimestamps.length} invalid timestamps`, `Sweep ${new Date(now).toISOString()}`] },
    { id: "source-registration", label: "Source registration", lens: "connection", status: coverage.length ? "pass" : "blind", detail: "Confirms the radar received a source manifest for this workspace.", evidence: [`${coverage.length} registered sources`] },
    { id: "property-registration", label: "Property sentinel registration", lens: "connection", status: expectedProperties.length === 0 ? "watch" : propertySentinels.length >= expectedProperties.length * 12 ? "pass" : "critical", detail: "Confirms every expected live property received its own twelve-check sentinel pack.", evidence: [`${expectedProperties.length} expected live properties`, `${propertySentinels.length} property checks`] },
    { id: "synthetic-registration", label: "Synthetic canary registration", lens: "connection", status: expectedProperties.length === 0 ? "watch" : syntheticSentinels.length >= expectedProperties.length * 12 ? "pass" : "critical", detail: "Confirms every expected live property received an independent twelve-check public canary pack.", evidence: [`${expectedProperties.length} expected live properties`, `${syntheticSentinels.length} synthetic checks`] },
    { id: "synthetic-freshness", label: "Synthetic canary freshness", lens: "freshness", status: staleCanaries.some(check => check.status === "blind" || check.status === "critical") ? "critical" : staleCanaries.some(check => check.status === "warning") ? "warning" : staleCanaries.length ? "watch" : "pass", detail: staleCanaries.length ? "One or more active property probes are absent or outside their freshness agreement." : "Every registered active property probe is inside its freshness agreement.", evidence: [`${staleCanaries.length} stale or missing canaries`, `${expectedProperties.length} expected live properties`] },
    { id: "history-registration", label: "Evidence-vault detector registration", lens: "connection", status: historicalChecks.length >= EXPECTED_CATALOG_CHECKS / 3 ? "pass" : "critical", detail: "Confirms every KPI family received baseline, velocity, anomaly, and recording-continuity detectors.", evidence: [`${historicalChecks.length} historical checks`, `Expected at least ${EXPECTED_CATALOG_CHECKS / 3}`] },
    { id: "history-baselines", label: "Historical baseline coverage", lens: "baseline", status: !evidence ? "blind" : evidence.baselineCoveragePercent >= 90 ? "pass" : evidence.baselineCoveragePercent >= 50 ? "watch" : "warning", detail: !evidence ? "The evidence-vault digest was not available to the self-watchdog." : `${evidence.baselineReadySeries}/${evidence.measurableSeries} measurable KPI streams have decision-grade retained baselines.`, evidence: evidence ? [`Baseline coverage ${evidence.baselineCoveragePercent}%`, `${evidence.totalSamples} retained samples`] : ["Evidence digest unavailable"] },
    { id: "zero-blindness", label: "Zero-blindness guardrail", lens: "threshold", status: blindChecks.length ? "critical" : "pass", detail: blindChecks.length ? "At least one detector cannot prove health. Blindness is being escalated as a command-level incident." : "Every detector has an observable evidence path in this sweep.", evidence: [`${blindChecks.length} blind checks`, "Tolerance 0"] },
    { id: "correlation-engine", label: "Correlation engine execution", lens: "continuity", status: "pass", detail: "Confirms compound-risk and domain-cluster evaluation completed during this sweep.", evidence: [`${correlationIssues.length} correlated risks emitted`, "Correlation engine completed"] },
    { id: "source-availability", label: "Source availability guardrail", lens: "resilience", status: unavailableSources.length ? "critical" : "pass", detail: unavailableSources.length ? "One or more registered evidence sources are disconnected or unavailable." : "Every registered source is connected or explicitly reporting an empty state.", evidence: unavailableSources.length ? unavailableSources.map(source => `${source.label}: ${source.status}`) : [`${coverage.length} sources available`] },
  ];

  // Coverage-gaps self-check (radar upgrade Stage 6) — proves the seeder covers
  // every monitorable entity. Added only when a manifest is supplied so existing
  // watchdog callers keep their check count.
  if (coverageManifest) {
    const { entries, gaps, fallback, calibrating } = coverageManifest;
    rules.push({
      id: "coverage-gaps",
      label: "Entity coverage completeness",
      lens: "connection",
      status: gaps > 0 ? "critical" : fallback > 0 ? "watch" : "pass",
      detail: gaps > 0
        ? `${gaps} active entit${gaps === 1 ? "y has" : "ies have"} no radar pack — a blind spot in coverage seeding.`
        : fallback > 0
          ? `${fallback} entit${fallback === 1 ? "y is" : "ies are"} covered by the generic fallback pack; a bespoke template would monitor them better.`
          : `All ${entries.length} monitorable entit${entries.length === 1 ? "y resolves" : "ies resolve"} to a radar detector pack.`,
      evidence: [`${entries.length} entities`, `${coverageManifest.covered} bespoke`, `${fallback} fallback`, `${gaps} gaps`, `${calibrating} calibrating`],
    });
  }

  return rules.map(rule => sentinel({
    domain: "systems",
    familyId: `watchdog:${rule.id}`,
    familyLabel: rule.label,
    scope: "watchdog",
    href: "/portal/agency/company?view=connections",
    sourceId: "radar:self-watchdog",
    measuredAt: now,
    lastSeenAt: now,
  }, rule.lens, rule.status, rule.detail, rule.evidence));
}

function propertyChecks(property: RadarTelemetryProperty, now: number): BusinessRadarCheck[] {
  const age = property.lastSeenAt ? Math.max(0, now - property.lastSeenAt) : null;
  const eventIds = property.events.map(event => event.id).filter(Boolean);
  const invalidEvents = property.events.filter(event => !Number.isFinite(event.occurredAt) || !event.type || event.occurredAt > now + 5 * 60_000);
  const duplicateEvents = eventIds.length - new Set(eventIds).size;
  const trafficDelta = percentageChange(property.current7d, property.previous7d);
  const trafficMagnitude = Math.abs(trafficDelta ?? 0);
  const trafficDrop = property.previous7d >= 5 && property.current7d <= property.previous7d * 0.5;
  const trafficSurge = property.current7d >= 20 && property.current7d >= Math.max(1, property.previous7d) * 2;
  const missingLiveTag = property.expectedLive && !property.lastSeenAt;
  const common = {
    familyId: `property:${property.id}`,
    familyLabel: property.label,
    scope: "property" as const,
    href: property.href,
    sourceId: `property:${property.id}`,
    measuredAt: now,
    lastSeenAt: property.lastSeenAt,
  };
  const development = { ...common, domain: "development" as const };
  const marketing = { ...common, domain: "marketing" as const };

  return [
    sentinel(development, "connection", missingLiveTag ? "blind" : property.tagDeclared || property.lastSeenAt ? "pass" : "watch", missingLiveTag ? `${property.label} is expected live but has no telemetry path.` : `${property.label} telemetry is declared or reporting.`, [`Expected live ${property.expectedLive ? "yes" : "no"}`, `Tag declared ${property.tagDeclared ? "yes" : "no"}`]),
    sentinel(development, "freshness", missingLiveTag ? "blind" : age === null ? "watch" : age > 7 * DAY ? "critical" : age > 2 * DAY ? "warning" : "pass", age === null ? `${property.label} has no event timestamp.` : age > 2 * DAY ? `${property.label} telemetry is stale.` : `${property.label} telemetry is fresh.`, [age === null ? "Last event unavailable" : `Last event ${duration(age)} ago`, "Freshness agreement 2d"]),
    sentinel(development, "threshold", missingLiveTag ? "blind" : property.errors24h >= 5 || (property.averageLoadMs ?? 0) > 5_000 ? "critical" : property.errors24h > 0 || (property.averageLoadMs ?? 0) > 2_500 ? "warning" : "pass", `${property.label} runtime errors and load performance are checked together.`, [`Errors 24h ${property.errors24h}`, `Average load ${property.averageLoadMs ?? "no sample"}ms`]),
    sentinel(marketing, "trend", property.previous7d < 5 ? "watch" : trafficDrop && trafficMagnitude >= 75 ? "critical" : trafficDrop ? "warning" : "pass", property.previous7d < 5 ? `${property.label} needs more traffic history for a dependable trend.` : `${property.label} traffic moved ${signed(trafficDelta ?? 0)}% against the previous week.`, [`Current ${property.current7d}`, `Previous ${property.previous7d}`]),
    sentinel(marketing, "anomaly", property.previous7d < 5 ? "watch" : trafficDrop ? "warning" : trafficSurge ? "watch" : "pass", trafficDrop || trafficSurge ? `${property.label} crossed a traffic pattern-break guardrail.` : `${property.label} has no material traffic anomaly.`, [`Traffic change ${signed(trafficDelta ?? 0)}%`, `Current ${property.current7d}`]),
    sentinel(development, "integrity", invalidEvents.length ? "critical" : duplicateEvents ? "warning" : "pass", invalidEvents.length || duplicateEvents ? `${property.label} has malformed, future, or duplicate telemetry events.` : `${property.label} retained telemetry has valid identity and timestamps.`, [`Invalid events ${invalidEvents.length}`, `Duplicate IDs ${duplicateEvents}`, `Events ${property.events.length}`]),
    sentinel(development, "continuity", missingLiveTag ? "blind" : !property.expectedLive ? "watch" : property.heartbeats24h > 0 || (age !== null && age <= DAY) ? "pass" : "warning", property.heartbeats24h > 0 ? `${property.label} emitted a heartbeat in the last day.` : `${property.label} has no recent heartbeat, so continuous operation is not proved.`, [`Heartbeats 24h ${property.heartbeats24h}`, age === null ? "Signal age unavailable" : `Signal age ${duration(age)}`]),
    sentinel(marketing, "baseline", property.previous7d >= 5 && property.events.length >= 20 ? "pass" : "watch", property.previous7d >= 5 && property.events.length >= 20 ? `${property.label} has enough retained history for a traffic baseline.` : `${property.label} needs more retained history before normal acquisition behaviour is established.`, [`Previous traffic ${property.previous7d}`, `Events ${property.events.length}`]),
    sentinel(marketing, "confidence", invalidEvents.length ? "warning" : property.events.length >= 50 ? "pass" : "watch", property.events.length >= 50 ? `${property.label} has a decision-grade telemetry sample.` : `${property.label} conclusions remain provisional while the sample grows.`, [`Events ${property.events.length}`, "Confidence floor 50"]),
    sentinel(marketing, "forecast", property.current7d >= 20 && property.forms7d === 0 && property.conversions7d === 0 ? "warning" : trafficDrop ? "warning" : property.previous7d < 5 ? "watch" : "pass", property.current7d >= 20 && property.forms7d === 0 && property.conversions7d === 0 ? `${property.label} traffic is not currently producing a visible conversion path.` : `${property.label} acquisition trajectory has been evaluated against traffic and conversion evidence.`, [`Pageviews 7d ${property.current7d}`, `Forms 7d ${property.forms7d}`, `Conversions 7d ${property.conversions7d}`]),
    sentinel(marketing, "volatility", property.previous7d < 5 ? "watch" : trafficMagnitude >= 200 ? "warning" : trafficMagnitude >= 75 ? "watch" : "pass", property.previous7d < 5 ? `${property.label} needs a larger baseline before volatility can be trusted.` : `${property.label} traffic volatility is ${trafficMagnitude.toFixed(1)}%.`, [`Change ${signed(trafficDelta ?? 0)}%`, `Baseline ${property.previous7d}`]),
    sentinel(development, "resilience", missingLiveTag ? "blind" : property.tagDeclared && property.lastSeenAt && property.heartbeats24h > 0 ? "pass" : property.lastSeenAt ? "watch" : "blind", property.tagDeclared && property.lastSeenAt && property.heartbeats24h > 0 ? `${property.label} has declaration, event flow, and heartbeat evidence.` : `${property.label} lacks one or more independent observability proofs.`, [`Tag ${property.tagDeclared ? "declared" : "missing"}`, `Event ${property.lastSeenAt ? "seen" : "missing"}`, `Heartbeat ${property.heartbeats24h ? "seen" : "missing"}`]),
  ];
}

function sentinel(
  common: {
    domain: AdvisorDomain;
    familyId: string;
    familyLabel: string;
    scope: RadarCheckScope;
    href: string;
    sourceId: string;
    measuredAt: number;
    lastSeenAt?: number;
  },
  lens: RadarRuleLens,
  status: RadarCheckStatus,
  detail: string,
  evidence: string[],
): BusinessRadarCheck {
  return {
    id: `sentinel:${common.scope}:${slug(common.familyId)}:${lens}`,
    ruleId: `sentinel:${common.scope}:${lens}`,
    ...common,
    lens,
    lensLabel: readable(lens),
    status,
    title: `${common.familyLabel}: ${readable(lens).toLowerCase()}`,
    detail,
    evidence,
  };
}

function sourceCadence(domain: AdvisorDomain): number {
  if (domain === "compliance") return 90 * DAY;
  if (["company", "clients", "finance", "delivery", "team"].includes(domain)) return 7 * DAY;
  return 2 * DAY;
}

function domainRoute(domain: AdvisorDomain): string {
  if (domain === "sales" || domain === "clients") return "/portal/clients?view=journey";
  if (domain === "inbox") return "/portal/agency/inbox";
  if (domain === "finance" || domain === "compliance") return "/portal/agency/agency-finance";
  if (domain === "delivery") return "/portal/agency/fulfilment";
  if (domain === "marketing") return "/portal/agency/marketing";
  if (domain === "operations" || domain === "team") return "/portal/agency/actions";
  if (domain === "development") return "/portal/agency/fulfilment/technical/performance";
  if (domain === "systems") return "/portal/agency/company?view=connections";
  return "/portal/agency?station=battle";
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous) * 100;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function duration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < HOUR) return `${Math.round(milliseconds / 60_000)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / HOUR)}h`;
  return `${Math.round(milliseconds / DAY)}d`;
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}
