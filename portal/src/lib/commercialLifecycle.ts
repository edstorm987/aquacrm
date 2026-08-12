import type {
  AdvisorDomain,
  BusinessMetricSignal,
  BusinessRadarCheck,
  BusinessRadarIssue,
  RadarCheckStatus,
  RadarRuleLens,
} from "@/lib/businessRadar";
import type { Client } from "@/server/types";

const DAY = 86_400_000;
const STALE_LEAD_AFTER_MS = 14 * DAY;
const RECENT_CHURN_WINDOW_MS = 90 * DAY;
const MINIMUM_SOURCE_SAMPLE = 3;

export interface CommercialLifecycleLead {
  id: string;
  source: string;
  capturedAt: number;
  firstContactedAt?: number;
  lastContactedAt?: number;
  currentStageId?: string;
  stageEnteredAt?: number;
  convertedAt?: number;
  convertedClientId?: string;
}

export interface CommercialSourceCohort {
  key: string;
  label: string;
  leadCount: number;
  convertedLeadCount: number;
  lostLeadCount: number;
  openLeadCount: number;
  conversionRatePercent: number | null;
  activeClientCount: number;
  churnedClientCount: number;
  clientCount: number;
  churnRatePercent: number | null;
  pendingCancellationCount: number;
  medianConversionMs: number | null;
  conversionSampleReady: boolean;
  retentionSampleReady: boolean;
}

export interface CommercialLifecycleSnapshot {
  available: boolean;
  generatedAt: number;
  latestActivityAt?: number;
  leadCount: number;
  recentLeadCount: number;
  convertedLeadCount: number;
  lostLeadCount: number;
  openLeadCount: number;
  staleOpenLeadCount: number;
  unattributedLeadCount: number;
  conversionRatePercent: number | null;
  lostDecisionRatePercent: number | null;
  medianConversionMs: number | null;
  conversionLinkCoveragePercent: number | null;
  activeClientCount: number;
  churnedClientCount: number;
  recentlyChurnedClientCount: number;
  suspendedClientCount: number;
  pendingCancellationCount: number;
  retentionRatePercent: number | null;
  clientSourceCoveragePercent: number | null;
  sourceConcentrationPercent: number | null;
  conversionSpreadPercent: number | null;
  churnSpreadPercent: number | null;
  bestConvertingSource?: CommercialSourceCohort;
  highestChurnSource?: CommercialSourceCohort;
  cohorts: CommercialSourceCohort[];
}

interface BuildCommercialLifecycleInput {
  leads: readonly CommercialLifecycleLead[];
  clients: readonly Client[];
  now?: number;
  available?: boolean;
}

interface MutableCohort {
  key: string;
  label: string;
  leadCount: number;
  convertedLeadCount: number;
  lostLeadCount: number;
  openLeadCount: number;
  activeClientCount: number;
  churnedClientCount: number;
  pendingCancellationCount: number;
  conversionTimes: number[];
}

export function buildCommercialLifecycleSnapshot({
  leads,
  clients,
  now = Date.now(),
  available = true,
}: BuildCommercialLifecycleInput): CommercialLifecycleSnapshot {
  const cohorts = new Map<string, MutableCohort>();
  const leadsById = new Map(leads.map(lead => [lead.id, lead]));
  const leadsByClientId = new Map(leads.flatMap(lead => lead.convertedClientId ? [[lead.convertedClientId, lead] as const] : []));
  const convertedLeads = leads.filter(isConvertedLead);
  const lostLeads = leads.filter(isLostLead);
  const openLeads = leads.filter(lead => !isConvertedLead(lead) && !isLostLead(lead));
  const staleOpenLeads = openLeads.filter(lead => now - leadActivityAt(lead) >= STALE_LEAD_AFTER_MS);
  const conversionTimes = convertedLeads.flatMap(lead => lead.convertedAt && lead.convertedAt >= lead.capturedAt
    ? [lead.convertedAt - lead.capturedAt]
    : []);

  for (const lead of leads) {
    const source = normalizeSource(lead.source);
    const cohort = mutableCohort(cohorts, source.key, source.label);
    cohort.leadCount += 1;
    if (isConvertedLead(lead)) {
      cohort.convertedLeadCount += 1;
      if (lead.convertedAt && lead.convertedAt >= lead.capturedAt) cohort.conversionTimes.push(lead.convertedAt - lead.capturedAt);
    } else if (isLostLead(lead)) {
      cohort.lostLeadCount += 1;
    } else {
      cohort.openLeadCount += 1;
    }
  }

  let coveredClientSources = 0;
  let activeClientCount = 0;
  let churnedClientCount = 0;
  let recentlyChurnedClientCount = 0;
  let suspendedClientCount = 0;
  let pendingCancellationCount = 0;
  for (const client of clients) {
    const metadata = client.metadata ?? {};
    const linkedLeadId = stringValue(metadata.leadId) || stringValue(metadata.promotedFromLeadId);
    const linkedLead = (linkedLeadId ? leadsById.get(linkedLeadId) : undefined) ?? leadsByClientId.get(client.id);
    const buyingJourney = recordValue(metadata.buyingJourney);
    const explicitSource = stringValue(metadata.leadSource) || stringValue(buyingJourney?.source);
    const source = normalizeSource(explicitSource || linkedLead?.source || "");
    const churned = client.stage === "churned" || client.status === "archived";
    const churnedAt = numberValue(metadata.churnedAt) ?? numberValue(metadata.archivedAt) ?? client.updatedAt;
    const active = client.status === "active" && client.stage !== "churned";
    const pending = pendingCancellationRequests(metadata).length;

    if (source.key !== "unattributed") coveredClientSources += 1;
    if (active) activeClientCount += 1;
    if (churned) {
      churnedClientCount += 1;
      if (churnedAt >= now - RECENT_CHURN_WINDOW_MS) recentlyChurnedClientCount += 1;
    }
    if (client.status === "suspended") suspendedClientCount += 1;
    pendingCancellationCount += pending;

    const cohort = mutableCohort(cohorts, source.key, source.label);
    if (active) cohort.activeClientCount += 1;
    if (churned) cohort.churnedClientCount += 1;
    cohort.pendingCancellationCount += pending;
  }

  const sourceCohorts = [...cohorts.values()]
    .map(finalizeCohort)
    .sort((left, right) => right.leadCount + right.clientCount - (left.leadCount + left.clientCount) || left.label.localeCompare(right.label));
  const attributedLeadCount = leads.filter(lead => normalizeSource(lead.source).key !== "unattributed").length;
  const attributedCohorts = sourceCohorts.filter(cohort => cohort.key !== "unattributed");
  const conversionReady = attributedCohorts.filter(cohort => cohort.conversionSampleReady && cohort.conversionRatePercent !== null);
  const retentionReady = attributedCohorts.filter(cohort => cohort.retentionSampleReady && cohort.churnRatePercent !== null);
  const linkedConversions = convertedLeads.filter(lead => Boolean(lead.convertedClientId && clients.some(client => client.id === lead.convertedClientId))
    || clients.some(client => stringValue(client.metadata?.leadId) === lead.id || stringValue(client.metadata?.promotedFromLeadId) === lead.id)).length;
  const portfolioSize = activeClientCount + churnedClientCount;
  const bestConvertingSource = [...conversionReady].sort((left, right) => (right.conversionRatePercent ?? 0) - (left.conversionRatePercent ?? 0))[0];
  const highestChurnSource = [...retentionReady].sort((left, right) => (right.churnRatePercent ?? 0) - (left.churnRatePercent ?? 0))[0];

  return {
    available,
    generatedAt: now,
    latestActivityAt: newest([
      ...leads.map(lead => Math.max(lead.capturedAt, lead.stageEnteredAt ?? 0, lead.lastContactedAt ?? 0, lead.convertedAt ?? 0)),
      ...clients.map(client => client.updatedAt),
    ]),
    leadCount: leads.length,
    recentLeadCount: leads.filter(lead => lead.capturedAt >= now - 30 * DAY).length,
    convertedLeadCount: convertedLeads.length,
    lostLeadCount: lostLeads.length,
    openLeadCount: openLeads.length,
    staleOpenLeadCount: staleOpenLeads.length,
    unattributedLeadCount: leads.length - attributedLeadCount,
    conversionRatePercent: percentage(convertedLeads.length, leads.length),
    lostDecisionRatePercent: percentage(lostLeads.length, convertedLeads.length + lostLeads.length),
    medianConversionMs: median(conversionTimes),
    conversionLinkCoveragePercent: percentage(linkedConversions, convertedLeads.length),
    activeClientCount,
    churnedClientCount,
    recentlyChurnedClientCount,
    suspendedClientCount,
    pendingCancellationCount,
    retentionRatePercent: percentage(activeClientCount, portfolioSize),
    clientSourceCoveragePercent: percentage(coveredClientSources, clients.length),
    sourceConcentrationPercent: leads.length
      ? Math.round(Math.max(0, ...attributedCohorts.map(cohort => cohort.leadCount)) / leads.length * 100)
      : null,
    conversionSpreadPercent: spread(conversionReady.map(cohort => cohort.conversionRatePercent)),
    churnSpreadPercent: spread(retentionReady.map(cohort => cohort.churnRatePercent)),
    bestConvertingSource,
    highestChurnSource,
    cohorts: sourceCohorts,
  };
}

export function buildCommercialLifecycleChecks(snapshot: CommercialLifecycleSnapshot): BusinessRadarCheck[] {
  const lastSeenAt = snapshot.latestActivityAt;
  const sourceId = "commercial:lifecycle";
  const checks: BusinessRadarCheck[] = [];
  const add = (input: CheckInput) => checks.push(lifecycleCheck({ ...input, sourceId, lastSeenAt, measuredAt: snapshot.generatedAt }));
  const closedDecisions = snapshot.convertedLeadCount + snapshot.lostLeadCount;
  const portfolio = snapshot.activeClientCount + snapshot.churnedClientCount;
  const conversionCohorts = snapshot.cohorts.filter(cohort => cohort.conversionSampleReady).length;
  const retentionCohorts = snapshot.cohorts.filter(cohort => cohort.retentionSampleReady).length;
  const leadAttributionPercent = percentage(snapshot.leadCount - snapshot.unattributedLeadCount, snapshot.leadCount);

  add({ domain: "sales", familyId: "lead-conversion-rate", familyLabel: "Lead-to-client conversion", lens: "threshold", status: rateStatus(snapshot.conversionRatePercent, snapshot.leadCount, 5, 20, 10), value: snapshot.conversionRatePercent, sampleSize: snapshot.leadCount, expectedDirection: "higher", target: "20% or above after 5 leads", detail: `${snapshot.convertedLeadCount} of ${snapshot.leadCount} retained leads converted to clients.`, evidence: [`Converted ${snapshot.convertedLeadCount}`, `Open ${snapshot.openLeadCount}`, `Lost ${snapshot.lostLeadCount}`] });
  add({ domain: "sales", familyId: "lost-decision-rate", familyLabel: "Closed-deal loss rate", lens: "threshold", status: inverseRateStatus(snapshot.lostDecisionRatePercent, closedDecisions, 5, 35, 60), value: snapshot.lostDecisionRatePercent, sampleSize: closedDecisions, expectedDirection: "lower", target: "Below 35% of closed decisions", detail: "Measures lost outcomes among leads with a recorded won or lost decision.", evidence: [`Won ${snapshot.convertedLeadCount}`, `Lost ${snapshot.lostLeadCount}`, displayPercent(snapshot.lostDecisionRatePercent)] });
  add({ domain: "sales", familyId: "stale-open-leads", familyLabel: "Stale open leads", lens: "threshold", status: countStatus(snapshot.staleOpenLeadCount, snapshot.leadCount, 1, 5), value: snapshot.staleOpenLeadCount, sampleSize: snapshot.openLeadCount, expectedDirection: "lower", target: "0 open leads untouched for 14 days", detail: "Open leads whose latest contact or stage movement is at least 14 days old.", evidence: [`Stale ${snapshot.staleOpenLeadCount}`, `Open ${snapshot.openLeadCount}`, "Guardrail 14 days"] });
  add({ domain: "sales", familyId: "conversion-linkage", familyLabel: "Converted-client linkage", lens: "integrity", status: rateStatus(snapshot.conversionLinkCoveragePercent, snapshot.convertedLeadCount, 1, 100, 80), value: snapshot.conversionLinkCoveragePercent, sampleSize: snapshot.convertedLeadCount, expectedDirection: "higher", target: "100% of conversions linked to a client", detail: "Confirms every won lead can be traced into its client record.", evidence: [displayPercent(snapshot.conversionLinkCoveragePercent), `${snapshot.convertedLeadCount} converted leads`] });
  add({ domain: "sales", familyId: "conversion-cycle", familyLabel: "Lead conversion cycle", lens: "threshold", status: durationStatus(snapshot.medianConversionMs, snapshot.convertedLeadCount, 3, 45 * DAY, 90 * DAY), value: snapshot.medianConversionMs, sampleSize: snapshot.convertedLeadCount, expectedDirection: "lower", target: "Median below 45 days", detail: "Median time from lead capture to recorded client conversion.", evidence: [displayDuration(snapshot.medianConversionMs), `${snapshot.convertedLeadCount} conversions`] });
  add({ domain: "sales", familyId: "source-conversion-spread", familyLabel: "Source conversion spread", lens: "volatility", status: spreadStatus(snapshot.conversionSpreadPercent, conversionCohorts, 35, 60), value: snapshot.conversionSpreadPercent, sampleSize: conversionCohorts, expectedDirection: "lower", target: "Less than 35 points between mature sources", detail: "Compares conversion rates only across lead sources with at least three retained leads.", evidence: [displayPercent(snapshot.conversionSpreadPercent), `${conversionCohorts} mature source cohorts`] });

  add({ domain: "marketing", familyId: "lead-source-attribution", familyLabel: "Lead source attribution", lens: "integrity", status: rateStatus(leadAttributionPercent, snapshot.leadCount, 3, 85, 60), value: leadAttributionPercent, sampleSize: snapshot.leadCount, expectedDirection: "higher", target: "At least 85% of leads attributed", detail: "Leads without a usable original source cannot support channel conversion or ROI decisions.", evidence: [displayPercent(leadAttributionPercent), `Unattributed ${snapshot.unattributedLeadCount}`, `${snapshot.leadCount} total leads`] });
  add({ domain: "marketing", familyId: "source-concentration", familyLabel: "Acquisition source concentration", lens: "resilience", status: rateStatusInverseCeiling(snapshot.sourceConcentrationPercent, snapshot.leadCount, 10, 70, 85), value: snapshot.sourceConcentrationPercent, sampleSize: snapshot.leadCount, expectedDirection: "lower", target: "No source above 70% of lead flow", detail: "Shows dependency on the largest retained acquisition source.", evidence: [displayPercent(snapshot.sourceConcentrationPercent), `${snapshot.cohorts.length} source cohorts`] });
  add({ domain: "marketing", familyId: "source-outcome-depth", familyLabel: "Source outcome evidence", lens: "confidence", status: conversionCohorts ? "pass" : snapshot.leadCount ? "learning" : "learning", value: conversionCohorts, sampleSize: snapshot.leadCount, expectedDirection: "higher", target: "At least one source with 3 or more leads", detail: "Source rankings stay in learning until a cohort has enough leads to compare responsibly.", evidence: [`${conversionCohorts} mature source cohorts`, `${snapshot.cohorts.length} cohorts recorded`] });
  add({ domain: "marketing", familyId: "winning-source", familyLabel: "Best converting source", lens: "forecast", status: snapshot.bestConvertingSource ? "pass" : "learning", value: snapshot.bestConvertingSource?.conversionRatePercent ?? null, sampleSize: snapshot.bestConvertingSource?.leadCount ?? 0, expectedDirection: "higher", target: "A statistically usable winning source", detail: snapshot.bestConvertingSource ? `${snapshot.bestConvertingSource.label} currently has the strongest mature conversion rate.` : "No lead source has enough retained outcomes to rank yet.", evidence: snapshot.bestConvertingSource ? [`${snapshot.bestConvertingSource.label} ${displayPercent(snapshot.bestConvertingSource.conversionRatePercent)}`, `${snapshot.bestConvertingSource.leadCount} leads`] : ["Minimum 3 leads per source"] });

  add({ domain: "clients", familyId: "portfolio-retention", familyLabel: "Recorded portfolio retention", lens: "threshold", status: rateStatus(snapshot.retentionRatePercent, portfolio, 3, 80, 60), value: snapshot.retentionRatePercent, sampleSize: portfolio, expectedDirection: "higher", target: "80% or above", detail: "Active clients as a share of active plus recorded churned or archived relationships.", evidence: [`Active ${snapshot.activeClientCount}`, `Churned ${snapshot.churnedClientCount}`, displayPercent(snapshot.retentionRatePercent)] });
  add({ domain: "clients", familyId: "recent-client-churn", familyLabel: "Recent recorded churn", lens: "threshold", status: countStatus(snapshot.recentlyChurnedClientCount, portfolio, 1, 3), value: snapshot.recentlyChurnedClientCount, sampleSize: portfolio, expectedDirection: "lower", target: "0 churned clients in 90 days", detail: "Clients marked churned or archived during the last 90 days.", evidence: [`Recent churn ${snapshot.recentlyChurnedClientCount}`, `Portfolio sample ${portfolio}`, "Window 90 days"] });
  add({ domain: "clients", familyId: "pending-cancellations", familyLabel: "Pending cancellation risk", lens: "threshold", status: countStatus(snapshot.pendingCancellationCount, clientsObserved(snapshot), 1, 1), value: snapshot.pendingCancellationCount, sampleSize: clientsObserved(snapshot), expectedDirection: "lower", target: "0 open cancellation or provider-move requests", detail: "Open or reviewed cancellation and provider handover requests require immediate retention action.", evidence: [`Pending ${snapshot.pendingCancellationCount}`, `${clientsObserved(snapshot)} client records`] });
  add({ domain: "clients", familyId: "client-source-coverage", familyLabel: "Client acquisition trace", lens: "integrity", status: rateStatus(snapshot.clientSourceCoveragePercent, clientsObserved(snapshot), 3, 85, 60), value: snapshot.clientSourceCoveragePercent, sampleSize: clientsObserved(snapshot), expectedDirection: "higher", target: "85% or above", detail: "Client records retaining a lead source or a link to their originating lead.", evidence: [displayPercent(snapshot.clientSourceCoveragePercent), `${clientsObserved(snapshot)} client records`] });
  add({ domain: "clients", familyId: "source-churn-spread", familyLabel: "Churn by acquisition source", lens: "volatility", status: spreadStatus(snapshot.churnSpreadPercent, retentionCohorts, 20, 40), value: snapshot.churnSpreadPercent, sampleSize: retentionCohorts, expectedDirection: "lower", target: "Less than 20 points between mature source cohorts", detail: "Compares churn only where a source has at least three active or churned clients.", evidence: [displayPercent(snapshot.churnSpreadPercent), `${retentionCohorts} mature client cohorts`] });
  add({ domain: "clients", familyId: "highest-churn-source", familyLabel: "Highest-churn source", lens: "forecast", status: snapshot.highestChurnSource ? inverseRateStatus(snapshot.highestChurnSource.churnRatePercent, snapshot.highestChurnSource.clientCount, MINIMUM_SOURCE_SAMPLE, 20, 40) : "learning", value: snapshot.highestChurnSource?.churnRatePercent ?? null, sampleSize: snapshot.highestChurnSource?.clientCount ?? 0, expectedDirection: "lower", target: "Source churn below 20%", detail: snapshot.highestChurnSource ? `${snapshot.highestChurnSource.label} has the highest mature recorded churn rate.` : "No source has enough client outcomes to compare churn yet.", evidence: snapshot.highestChurnSource ? [`${snapshot.highestChurnSource.label} ${displayPercent(snapshot.highestChurnSource.churnRatePercent)}`, `${snapshot.highestChurnSource.clientCount} clients`] : ["Minimum 3 clients per source"] });
  add({ domain: "clients", familyId: "suspended-clients", familyLabel: "Suspended client state", lens: "integrity", status: snapshot.suspendedClientCount ? "watch" : clientsObserved(snapshot) ? "pass" : "learning", value: snapshot.suspendedClientCount, sampleSize: clientsObserved(snapshot), expectedDirection: "lower", target: "Every suspended relationship reviewed", detail: "Suspended clients are kept distinct from active and churned cohorts so they cannot disappear from retention reporting.", evidence: [`Suspended ${snapshot.suspendedClientCount}`] });

  return checks.map(check => snapshot.available ? check : { ...check, status: "blind" as const, detail: `${check.detail} Lead pipeline evidence is currently unavailable.` });
}

export function buildCommercialLifecycleIssues(snapshot: CommercialLifecycleSnapshot, checks: readonly BusinessRadarCheck[]): BusinessRadarIssue[] {
  if (!snapshot.available) return [];
  return checks
    .filter(check => (check.status === "critical" || check.status === "warning") && (check.lens === "threshold" || check.lens === "integrity"))
    .map(check => ({
      id: `commercial:${check.domain}:${check.familyId}`,
      severity: check.status as "critical" | "warning",
      domain: check.domain,
      title: check.familyLabel,
      detail: check.detail,
      evidence: check.evidence,
      href: check.href,
      detectedAt: snapshot.generatedAt,
      sourceIds: [check.sourceId],
    }));
}

export function buildCommercialLifecycleSignals(snapshot: CommercialLifecycleSnapshot): BusinessMetricSignal[] {
  return [
    signal(snapshot, "sales", "lead-conversion", "Lead-to-client conversion", snapshot.conversionRatePercent, displayPercent(snapshot.conversionRatePercent), "20% or above", rateSignal(snapshot.conversionRatePercent, snapshot.leadCount, 5, 20, 10), `${snapshot.convertedLeadCount} converted from ${snapshot.leadCount} retained leads.`, snapshot.leadCount),
    signal(snapshot, "clients", "portfolio-retention", "Portfolio retention", snapshot.retentionRatePercent, displayPercent(snapshot.retentionRatePercent), "80% or above", rateSignal(snapshot.retentionRatePercent, snapshot.activeClientCount + snapshot.churnedClientCount, 3, 80, 60), `${snapshot.activeClientCount} active and ${snapshot.churnedClientCount} churned relationships.`, snapshot.activeClientCount + snapshot.churnedClientCount),
    signal(snapshot, "clients", "pending-cancellations", "Pending cancellations", snapshot.pendingCancellationCount, String(snapshot.pendingCancellationCount), "0 pending", snapshot.pendingCancellationCount ? "critical" : clientsObserved(snapshot) ? "healthy" : "unknown", "Open cancellation and provider-move requests.", clientsObserved(snapshot)),
    signal(snapshot, "marketing", "source-attribution", "Lead source attribution", percentage(snapshot.leadCount - snapshot.unattributedLeadCount, snapshot.leadCount), displayPercent(percentage(snapshot.leadCount - snapshot.unattributedLeadCount, snapshot.leadCount)), "85% or above", attributionSignal(snapshot), `${snapshot.cohorts.length} acquisition cohorts are retained.`, snapshot.leadCount),
  ];
}

interface CheckInput {
  domain: AdvisorDomain;
  familyId: string;
  familyLabel: string;
  lens: RadarRuleLens;
  status: RadarCheckStatus;
  value: number | null;
  sampleSize: number;
  expectedDirection: "higher" | "lower" | "neutral";
  target: string;
  detail: string;
  evidence: string[];
}

function lifecycleCheck(input: CheckInput & { sourceId: string; lastSeenAt?: number; measuredAt: number }): BusinessRadarCheck {
  return {
    id: `commercial:${input.domain}:${input.familyId}:${input.lens}`,
    ruleId: `commercial:${input.familyId}`,
    domain: input.domain,
    familyId: input.familyId,
    familyLabel: input.familyLabel,
    lens: input.lens,
    lensLabel: readable(input.lens),
    scope: "kpi",
    status: input.status,
    title: `${input.familyLabel}: ${readable(input.lens).toLowerCase()}`,
    detail: input.detail,
    evidence: [...input.evidence, `Target ${input.target}`],
    href: input.domain === "marketing" ? "/portal/agency/marketing" : "/portal/clients?view=journey",
    sourceId: input.sourceId,
    measuredAt: input.measuredAt,
    lastSeenAt: input.lastSeenAt,
    value: input.value ?? undefined,
    sampleSize: input.sampleSize,
    expectedDirection: input.expectedDirection,
  };
}

function signal(snapshot: CommercialLifecycleSnapshot, domain: AdvisorDomain, id: string, label: string, value: number | null, display: string, target: string, status: BusinessMetricSignal["status"], detail: string, sampleSize: number): BusinessMetricSignal {
  return { id: `metric:${id}`, domain, label, value, display, target, status: snapshot.available ? status : "unknown", detail, href: domain === "marketing" ? "/portal/agency/marketing" : "/portal/clients?view=journey", measuredAt: snapshot.generatedAt, sampleSize };
}

function mutableCohort(cohorts: Map<string, MutableCohort>, key: string, label: string): MutableCohort {
  const existing = cohorts.get(key);
  if (existing) return existing;
  const created: MutableCohort = { key, label, leadCount: 0, convertedLeadCount: 0, lostLeadCount: 0, openLeadCount: 0, activeClientCount: 0, churnedClientCount: 0, pendingCancellationCount: 0, conversionTimes: [] };
  cohorts.set(key, created);
  return created;
}

function finalizeCohort(cohort: MutableCohort): CommercialSourceCohort {
  const clientCount = cohort.activeClientCount + cohort.churnedClientCount;
  return {
    key: cohort.key,
    label: cohort.label,
    leadCount: cohort.leadCount,
    convertedLeadCount: cohort.convertedLeadCount,
    lostLeadCount: cohort.lostLeadCount,
    openLeadCount: cohort.openLeadCount,
    activeClientCount: cohort.activeClientCount,
    churnedClientCount: cohort.churnedClientCount,
    pendingCancellationCount: cohort.pendingCancellationCount,
    clientCount,
    conversionRatePercent: percentage(cohort.convertedLeadCount, cohort.leadCount),
    churnRatePercent: percentage(cohort.churnedClientCount, clientCount),
    medianConversionMs: median(cohort.conversionTimes),
    conversionSampleReady: cohort.leadCount >= MINIMUM_SOURCE_SAMPLE,
    retentionSampleReady: clientCount >= MINIMUM_SOURCE_SAMPLE,
  };
}

function isConvertedLead(lead: CommercialLifecycleLead): boolean {
  return Boolean(lead.convertedAt || lead.convertedClientId || stageValue(lead) === "won");
}

function isLostLead(lead: CommercialLifecycleLead): boolean {
  return /^(lost|closed-lost|disqualified|unqualified|dead|declined|not-a-fit)$/.test(stageValue(lead));
}

function stageValue(lead: CommercialLifecycleLead): string {
  return (lead.currentStageId ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function leadActivityAt(lead: CommercialLifecycleLead): number {
  return Math.max(lead.capturedAt, lead.firstContactedAt ?? 0, lead.lastContactedAt ?? 0, lead.stageEnteredAt ?? 0);
}

function normalizeSource(value: string): { key: string; label: string } {
  const cleaned = value.trim();
  if (!cleaned || /^(unknown|unattributed|none|not[- ]?set|n\/a)$/i.test(cleaned)) return { key: "unattributed", label: "Unattributed" };
  const key = cleaned.toLowerCase().replace(/\s+/g, " ");
  return { key, label: cleaned.replace(/^csv:/i, "CSV - ").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()) };
}

function pendingCancellationRequests(metadata: Record<string, unknown>): Record<string, unknown>[] {
  const requests = Array.isArray(metadata.clientRequests) ? metadata.clientRequests.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  return requests.filter(request => ["cancel", "move-provider"].includes(stringValue(request.type)) && ["open", "reviewed"].includes(stringValue(request.status)));
}

function rateStatus(value: number | null, sample: number, minimumSample: number, warningBelow: number, criticalBelow: number): RadarCheckStatus {
  if (sample < minimumSample || value === null) return "learning";
  return value < criticalBelow ? "critical" : value < warningBelow ? "warning" : "pass";
}

function rateSignal(value: number | null, sample: number, minimumSample: number, warningBelow: number, criticalBelow: number): BusinessMetricSignal["status"] {
  const status = rateStatus(value, sample, minimumSample, warningBelow, criticalBelow);
  if (status === "critical" || status === "warning" || status === "watch") return status;
  return status === "pass" ? "healthy" : "unknown";
}

function inverseRateStatus(value: number | null, sample: number, minimumSample: number, warningAbove: number, criticalAbove: number): RadarCheckStatus {
  if (sample < minimumSample || value === null) return "learning";
  return value >= criticalAbove ? "critical" : value >= warningAbove ? "warning" : "pass";
}

function rateStatusInverseCeiling(value: number | null, sample: number, minimumSample: number, warningAbove: number, criticalAbove: number): RadarCheckStatus {
  return inverseRateStatus(value, sample, minimumSample, warningAbove, criticalAbove);
}

function countStatus(value: number, sample: number, warningAt: number, criticalAt: number): RadarCheckStatus {
  if (!sample) return "learning";
  return value >= criticalAt ? "critical" : value >= warningAt ? "warning" : "pass";
}

function durationStatus(value: number | null, sample: number, minimumSample: number, warningAt: number, criticalAt: number): RadarCheckStatus {
  if (sample < minimumSample || value === null) return "learning";
  return value >= criticalAt ? "critical" : value >= warningAt ? "warning" : "pass";
}

function spreadStatus(value: number | null, cohortCount: number, warningAt: number, criticalAt: number): RadarCheckStatus {
  if (cohortCount < 2 || value === null) return "learning";
  return value >= criticalAt ? "critical" : value >= warningAt ? "warning" : "pass";
}

function attributionSignal(snapshot: CommercialLifecycleSnapshot): BusinessMetricSignal["status"] {
  const rate = percentage(snapshot.leadCount - snapshot.unattributedLeadCount, snapshot.leadCount);
  if (snapshot.leadCount < 3 || rate === null) return "unknown";
  return rate < 60 ? "critical" : rate < 85 ? "warning" : "healthy";
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(numerator / denominator * 1_000) / 10 : null;
}

function spread(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length >= 2 ? Math.round((Math.max(...valid) - Math.min(...valid)) * 10) / 10 : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function clientsObserved(snapshot: CommercialLifecycleSnapshot): number {
  return snapshot.activeClientCount + snapshot.churnedClientCount + snapshot.suspendedClientCount;
}

function displayPercent(value: number | null): string {
  return value === null ? "Learning" : `${value}%`;
}

function displayDuration(value: number | null): string {
  if (value === null) return "Learning";
  if (value < DAY) return `${Math.max(1, Math.round(value / 3_600_000))}h`;
  return `${Math.round(value / DAY)}d`;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function newest(values: number[]): number | undefined {
  const valid = values.filter(value => Number.isFinite(value) && value > 0);
  return valid.length ? Math.max(...valid) : undefined;
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
