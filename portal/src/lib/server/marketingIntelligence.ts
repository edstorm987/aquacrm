import "server-only";

// Marketing data spine — the marketing workspace's read model, surfaced read-only.
//
// Marketing was "half-fed": every view computed its own numbers from plugin
// records (campaigns, assets, leads) and the agency's own website counter, so it
// never actually knew its data. The engines that DO know it already exist:
//
//   • the Radar `marketing` domain (12 families) — traffic 24h/7d, traffic
//     movement/surges/drops, form submissions, conversions, conversion rate,
//     campaign attribution, unattributed leads, search visibility, campaign
//     record coverage — all computed from Aqua Tag telemetry;
//   • `server/websiteSources` — which properties actually carry the tag and
//     where their submissions are routed;
//   • `brand_enquiries` (via `lib/server/websiteEnquiries`) — the real demand
//     that arrived, with its source, campaign and brand.
//
// This module does NOT recompute any of that and does NOT touch the Radar,
// KPI-registry or Aqua-Tag engines — it only reshapes what they already produce
// into one snapshot the marketing surfaces can render. Same pattern as
// `server/staffCapacity.ts` over the Radar `team` domain.
//
// Honesty rule: a measure that was never taken is `null` with status
// `"unmeasured"`, so the UI shows "—" rather than a fabricated zero. Enquiries
// are only present when the caller supplies them (a demo session supplies none),
// and that is reported as `available: false`, never as "zero enquiries".

import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { buildCommandIntelligenceSnapshot } from "@/lib/server/commandIntelligenceService";
import { inspectRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import { describeCommandKpis, type KpiDescriptor } from "@/lib/performance/kpiRegistry";
import { listWebsiteSources, normalizeHost } from "@/server/websiteSources";
import { INJECTION_PROVIDERS, listInjections } from "@/server/websiteInjections";
import { listIntegrationConnections } from "@/lib/server/integrations/integrationConnections";
import type { BusinessIssueRadar, BusinessRadarCheck, RadarCheckStatus, RadarDomainSummary } from "@/engines/data/radar/businessRadar";
import type { WebsiteSource } from "@/server/websiteSources";
import type { CommercialSourcePerformance } from "@/lib/intelligence/commandIntelligence";

/** The 12 Radar `marketing` families, in the order the workspace reads them. */
export const MARKETING_MEASURE_IDS = [
  "traffic-24h",
  "traffic-7d",
  "traffic-change",
  "traffic-surges",
  "traffic-drops",
  "form-submissions",
  "conversions",
  "conversion-rate",
  "campaign-attribution",
  "unattributed-leads",
  "search-visibility",
  "campaign-records",
] as const;

export type MarketingMeasureId = (typeof MARKETING_MEASURE_IDS)[number];

/** A measure that was never taken — distinct from one measured at zero. */
export type MarketingMeasureStatus = RadarCheckStatus | "unmeasured";

/**
 * One marketing measure, lifted verbatim from its Radar check. Every field is
 * the check's own — nothing here is re-derived, so the workspace can only ever
 * show what the Radar already proved.
 */
export interface MarketingMeasure {
  id: MarketingMeasureId;
  label: string;
  /** `null` when the check never produced a reading — render "—", not 0. */
  value: number | null;
  previousValue: number | null;
  status: MarketingMeasureStatus;
  title: string;
  detail: string;
  evidence: string[];
  href: string;
  measuredAt: number | null;
  lastSignalAt: number | null;
  /** True when a real reading exists (the check ran and carried a value). */
  measured: boolean;
}

/** Does marketing actually know its data? Tag reach, not tag config. */
export interface MarketingTagCoverage {
  /** Website sources registered in the Aqua Tag routing registry. */
  registeredSources: number;
  /** Sources routed to a client inbox or a trading company (vs the default agency inbox). */
  routedSources: number;
  /** Properties the Radar is actually monitoring for telemetry. */
  monitoredProperties: number;
  /** Radar sources currently reporting, out of all it expects. */
  connectedSources: number;
  totalSources: number;
  /** Newest marketing-domain signal, or `null` when nothing has ever reported. */
  lastSignalAt: number | null;
  /** True when at least one property is monitored and reporting. */
  connected: boolean;
}

/** The minimum an enquiry needs to feed marketing. `WebsiteEnquiry` satisfies it. */
export interface MarketingEnquiryInput {
  submittedAt: number;
  /** The site the enquiry arrived from — the link into the tag routing registry. */
  siteHost?: string;
  source?: string;
  campaign?: string;
  brand?: string;
  brandName?: string;
  channel?: string;
}

export interface MarketingEnquiryGroup {
  key: string;
  label: string;
  total: number;
  last7d: number;
  last30d: number;
  latestAt: number | null;
}

/**
 * Real demand from `brand_enquiries`. `available: false` means the caller did
 * not supply enquiries (a demo session, or the live read failed) — it never
 * means "no enquiries arrived".
 */
export interface MarketingEnquiryFeed {
  available: boolean;
  /**
   * The trading company these enquiries were narrowed to, or `null` for all.
   * Scoping is not a guess: an enquiry's `siteHost` is matched through the Aqua
   * Tag routing registry to the company Ed routed that site to.
   */
  scopedToCompanyId: string | null;
  /** Enquiries excluded because their site isn't registered — never silently dropped. */
  unroutedEnquiries: number;
  total: number;
  last7d: number;
  last30d: number;
  /** Carrying a campaign or a source beyond the generic `website:<brand>` fallback. */
  attributed: number;
  unattributed: number;
  attributionPercent: number | null;
  bySource: MarketingEnquiryGroup[];
  byBrand: MarketingEnquiryGroup[];
  byCampaign: MarketingEnquiryGroup[];
  latestAt: number | null;
}

export interface MarketingSpineHealth {
  coveragePercent: number;
  confidencePercent: number;
  readinessPercent: number;
  totalChecks: number;
  passedChecks: number;
  firingChecks: number;
  watchChecks: number;
  blindChecks: number;
  lastSignalAt: number | null;
}

export interface MarketingDataSpine {
  /** False when the Radar could not build — the workspace degrades, it doesn't break. */
  available: boolean;
  generatedAt: number;
  /** Every marketing family, measured or not, in `MARKETING_MEASURE_IDS` order. */
  measures: MarketingMeasure[];
  traffic: {
    last24h: number | null;
    last7d: number | null;
    previous7d: number | null;
    changePercent: number | null;
  };
  forms7d: number | null;
  conversions7d: number | null;
  conversionRatePercent: number | null;
  tag: MarketingTagCoverage;
  enquiries: MarketingEnquiryFeed;
  health: MarketingSpineHealth | null;
  /** Firing marketing checks, most severe first — the actionable watch list. */
  attention: MarketingMeasure[];
  /** What marketing is plugged into — and, honestly, what it still can't see. */
  sources: MarketingSourceConnection[];
}

const DAY = 86_400_000;
const FIRING_STATUSES: RadarCheckStatus[] = ["critical", "warning", "watch"];
/**
 * Statuses where the check actually assessed something. `blind` (no data
 * source), `learning` (not enough evidence yet) and `inactive` (not applicable)
 * all still emit `value: 0` from the Radar — an untracked agency reports zero
 * pageviews the same way a tracked-but-quiet one does. Treating those zeros as
 * readings is exactly the fabricated number this module exists to prevent, so a
 * value only counts when its own lens made an assessment.
 */
const ASSESSED_STATUSES: RadarCheckStatus[] = ["pass", "critical", "warning", "watch"];
const SEVERITY_RANK: Record<MarketingMeasureStatus, number> = {
  critical: 0, warning: 1, watch: 2, blind: 3, learning: 4, pass: 5, inactive: 6, unmeasured: 7,
};

const MEASURE_LABELS: Record<MarketingMeasureId, string> = {
  "traffic-24h": "Website traffic in 24 hours",
  "traffic-7d": "Website traffic in 7 days",
  "traffic-change": "Traffic movement",
  "traffic-surges": "Traffic surges",
  "traffic-drops": "Traffic drops",
  "form-submissions": "Form submissions",
  conversions: "Tracked conversions",
  "conversion-rate": "Website conversion rate",
  "campaign-attribution": "Campaign attribution",
  "unattributed-leads": "Unattributed leads",
  "search-visibility": "Search visibility",
  "campaign-records": "Campaign record coverage",
};

const EMPTY_ENQUIRIES: MarketingEnquiryFeed = {
  available: false,
  scopedToCompanyId: null,
  unroutedEnquiries: 0,
  total: 0,
  last7d: 0,
  last30d: 0,
  attributed: 0,
  unattributed: 0,
  attributionPercent: null,
  bySource: [],
  byBrand: [],
  byCampaign: [],
  latestAt: null,
};

const EMPTY_TAG: MarketingTagCoverage = {
  registeredSources: 0,
  routedSources: 0,
  monitoredProperties: 0,
  connectedSources: 0,
  totalSources: 0,
  lastSignalAt: null,
  connected: false,
};

/** A family the Radar never reported on — measured: false, value: null. */
function unmeasured(id: MarketingMeasureId): MarketingMeasure {
  return {
    id,
    label: MEASURE_LABELS[id],
    value: null,
    previousValue: null,
    status: "unmeasured",
    title: MEASURE_LABELS[id],
    detail: "Not measured yet — no Aqua Tag signal has reached this check.",
    evidence: [],
    href: "/portal/agency/marketing",
    measuredAt: null,
    lastSignalAt: null,
    measured: false,
  };
}

/**
 * Reduce a family's checks (12 lenses each) to one measure: the reading comes
 * from whichever lens carried a value, the status from the most severe lens, so
 * the workspace sees the family's worst news rather than a lucky lens.
 */
function toMeasure(id: MarketingMeasureId, checks: BusinessRadarCheck[]): MarketingMeasure {
  if (!checks.length) return unmeasured(id);
  const worst = [...checks].sort((a, b) => SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status])[0];
  // Only a lens that assessed something can supply the reading — see ASSESSED_STATUSES.
  const valued = checks.find(check => typeof check.value === "number" && ASSESSED_STATUSES.includes(check.status));
  const previous = checks.find(check => typeof check.previousValue === "number" && ASSESSED_STATUSES.includes(check.status));
  const lastSignalAt = checks.reduce<number | null>(
    (newest, check) => (typeof check.lastSeenAt === "number" && (newest === null || check.lastSeenAt > newest) ? check.lastSeenAt : newest),
    null,
  );
  return {
    id,
    label: checks[0].familyLabel || MEASURE_LABELS[id],
    value: valued?.value ?? null,
    previousValue: previous?.previousValue ?? null,
    status: worst.status,
    title: worst.title,
    detail: worst.detail,
    evidence: worst.evidence,
    href: worst.href,
    measuredAt: worst.measuredAt,
    lastSignalAt,
    measured: valued !== undefined,
  };
}

function isGenericSource(source: string | undefined): boolean {
  if (!source) return true;
  const value = source.trim().toLowerCase();
  return value === "" || value === "unknown" || value.startsWith("website:");
}

function groupEnquiries(
  enquiries: readonly MarketingEnquiryInput[],
  now: number,
  keyOf: (enquiry: MarketingEnquiryInput) => { key: string; label: string } | null,
): MarketingEnquiryGroup[] {
  const groups = new Map<string, MarketingEnquiryGroup>();
  for (const enquiry of enquiries) {
    const identity = keyOf(enquiry);
    if (!identity) continue;
    const row = groups.get(identity.key) ?? { key: identity.key, label: identity.label, total: 0, last7d: 0, last30d: 0, latestAt: null };
    row.total += 1;
    if (now - enquiry.submittedAt <= 7 * DAY) row.last7d += 1;
    if (now - enquiry.submittedAt <= 30 * DAY) row.last30d += 1;
    if (row.latestAt === null || enquiry.submittedAt > row.latestAt) row.latestAt = enquiry.submittedAt;
    groups.set(identity.key, row);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * Narrow enquiries to one trading company using the Aqua Tag routing registry.
 *
 * This is a **lookup, not a guess**: the registry already records which site
 * belongs to which company, because Ed configured it to route that site's
 * submissions there. Brand slugs are *not* used — a trading company's slug
 * (`milesy-media`) and a trading brand slug (`milesymedia`) live in different
 * spaces, so matching on them would silently report zero.
 *
 * Enquiries from a host with no registry entry can't be placed, so they are
 * excluded from a company scope and counted in `unroutedEnquiries` — visible,
 * never silently dropped.
 */
export interface MarketingEnquiryScope {
  companyId: string;
  /** Registered sites routed to that company, by normalised host. */
  hosts: readonly string[];
}

function scopeEnquiries(
  enquiries: readonly MarketingEnquiryInput[],
  scope: MarketingEnquiryScope | null,
): { rows: MarketingEnquiryInput[]; unrouted: number } {
  if (!scope) return { rows: [...enquiries], unrouted: 0 };
  const hosts = new Set(scope.hosts);
  let unrouted = 0;
  const rows = enquiries.filter(enquiry => {
    const host = normalizeHost(enquiry.siteHost ?? "");
    if (!host) { unrouted += 1; return false; }
    return hosts.has(host);
  });
  return { rows, unrouted };
}

/** Reshape supplied enquiries into the marketing feed. Pure. */
export function shapeMarketingEnquiries(
  allEnquiries: readonly MarketingEnquiryInput[] | null | undefined,
  now = Date.now(),
  scope: MarketingEnquiryScope | null = null,
): MarketingEnquiryFeed {
  if (!allEnquiries) return EMPTY_ENQUIRIES;
  const { rows: enquiries, unrouted } = scopeEnquiries(allEnquiries, scope);
  const attributed = enquiries.filter(enquiry => Boolean(enquiry.campaign?.trim()) || !isGenericSource(enquiry.source)).length;
  return {
    available: true,
    scopedToCompanyId: scope?.companyId ?? null,
    unroutedEnquiries: unrouted,
    total: enquiries.length,
    last7d: enquiries.filter(enquiry => now - enquiry.submittedAt <= 7 * DAY).length,
    last30d: enquiries.filter(enquiry => now - enquiry.submittedAt <= 30 * DAY).length,
    attributed,
    unattributed: enquiries.length - attributed,
    attributionPercent: enquiries.length ? Math.round(attributed / enquiries.length * 1000) / 10 : null,
    bySource: groupEnquiries(enquiries, now, enquiry => {
      const source = enquiry.source?.trim();
      return { key: source && !isGenericSource(source) ? source : "unattributed", label: source && !isGenericSource(source) ? source : "Unattributed" };
    }),
    byBrand: groupEnquiries(enquiries, now, enquiry => {
      const brand = enquiry.brand?.trim();
      return brand ? { key: brand, label: enquiry.brandName?.trim() || brand } : null;
    }),
    byCampaign: groupEnquiries(enquiries, now, enquiry => {
      const campaign = enquiry.campaign?.trim();
      return campaign ? { key: campaign, label: campaign } : null;
    }),
    latestAt: enquiries.reduce<number | null>((newest, enquiry) => (newest === null || enquiry.submittedAt > newest ? enquiry.submittedAt : newest), null),
  };
}

export interface ShapeMarketingSpineInput {
  /** Provider roster; omit in a test that doesn't care about connections. */
  connections?: readonly MarketingSourceInput[];
  /** Narrow the enquiry half to one trading company via the tag routing registry. */
  enquiryScope?: MarketingEnquiryScope | null;
  checks: readonly BusinessRadarCheck[];
  domain: RadarDomainSummary | null;
  summary: Pick<BusinessIssueRadar["summary"], "monitoredProperties" | "connectedSources" | "totalSources"> | null;
  sources: readonly WebsiteSource[];
  enquiries: readonly MarketingEnquiryInput[] | null;
  generatedAt: number;
  now?: number;
}

/**
 * Pure reshaping of the marketing-domain radar checks + tag registry + enquiries
 * into the spine. Separated from the fetch so it can be unit-tested with
 * synthetic checks without building the whole radar.
 */
export function shapeMarketingSpine(input: ShapeMarketingSpineInput): MarketingDataSpine {
  const { checks, domain, summary, sources, enquiries, generatedAt } = input;
  const now = input.now ?? generatedAt;
  const byFamily = new Map<string, BusinessRadarCheck[]>();
  for (const check of checks) {
    const rows = byFamily.get(check.familyId) ?? [];
    rows.push(check);
    byFamily.set(check.familyId, rows);
  }
  const measures = MARKETING_MEASURE_IDS.map(id => toMeasure(id, byFamily.get(id) ?? []));
  const measureOf = (id: MarketingMeasureId) => measures.find(measure => measure.id === id) ?? unmeasured(id);
  const traffic7d = measureOf("traffic-7d");
  const lastSignalAt = measures.reduce<number | null>(
    (newest, measure) => (measure.lastSignalAt !== null && (newest === null || measure.lastSignalAt > newest) ? measure.lastSignalAt : newest),
    domain?.lastSignalAt ?? null,
  );

  return {
    available: true,
    generatedAt,
    measures,
    traffic: {
      last24h: measureOf("traffic-24h").value,
      last7d: traffic7d.value,
      previous7d: traffic7d.previousValue,
      changePercent: measureOf("traffic-change").value,
    },
    forms7d: measureOf("form-submissions").value,
    conversions7d: measureOf("conversions").value,
    conversionRatePercent: measureOf("conversion-rate").value,
    tag: {
      registeredSources: sources.length,
      routedSources: sources.filter(source => source.destinationClientId || source.destinationCompanyId).length,
      monitoredProperties: summary?.monitoredProperties ?? 0,
      connectedSources: summary?.connectedSources ?? 0,
      totalSources: summary?.totalSources ?? 0,
      lastSignalAt,
      connected: Boolean(summary?.monitoredProperties) && lastSignalAt !== null,
    },
    enquiries: shapeMarketingEnquiries(enquiries, now, input.enquiryScope ?? null),
    health: domain
      ? {
          coveragePercent: domain.coveragePercent,
          confidencePercent: domain.confidencePercent,
          readinessPercent: domain.readinessPercent,
          totalChecks: domain.totalChecks,
          passedChecks: domain.passedChecks,
          firingChecks: domain.firingChecks,
          watchChecks: domain.watchChecks,
          blindChecks: domain.blindChecks,
          lastSignalAt: domain.lastSignalAt ?? null,
        }
      : null,
    attention: measures
      .filter(measure => FIRING_STATUSES.includes(measure.status as RadarCheckStatus))
      .sort((a, b) => SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status]),
    sources: shapeMarketingSources(input.connections ?? []),
  };
}

/** The spine when the Radar can't build — every surface degrades honestly. */
export function emptyMarketingSpine(generatedAt = Date.now()): MarketingDataSpine {
  return {
    available: false,
    generatedAt,
    measures: MARKETING_MEASURE_IDS.map(unmeasured),
    traffic: { last24h: null, last7d: null, previous7d: null, changePercent: null },
    forms7d: null,
    conversions7d: null,
    conversionRatePercent: null,
    tag: EMPTY_TAG,
    enquiries: EMPTY_ENQUIRIES,
    health: null,
    attention: [],
    sources: [],
  };
}

/**
 * Count, per injectable provider, how many of the agency's registered sites
 * actually carry it (enabled injections only), and pair it with the read-back
 * integration's last successful sync where one exists. Read-only over the
 * aqua-tag store — this worker consumes those files, never edits them.
 */
function gatherMarketingSources(agencyId: string, sources: readonly WebsiteSource[]): MarketingSourceInput[] {
  const perKind = new Map<string, number>();
  for (const source of sources) {
    const kinds = new Set(listInjections(agencyId, source.id).filter(injection => injection.enabled).map(injection => injection.kind));
    for (const kind of kinds) perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
  }
  const connections = listIntegrationConnections(agencyId);
  const syncOf = (provider: string): number | null => {
    const stamps = connections
      .filter(connection => connection.provider === provider)
      .map(connection => Number(connection.config?.lastSyncAt))
      .filter(stamp => Number.isFinite(stamp) && stamp > 0);
    return stamps.length ? Math.max(...stamps) : null;
  };
  return INJECTION_PROVIDERS.map(provider => ({
    kind: provider.kind,
    label: provider.label,
    injectedSites: perKind.get(provider.kind) ?? 0,
    totalSites: sources.length,
    lastSyncAt: provider.kind === "gsc-verification" ? syncOf("google-search-console") : null,
  }));
}

/**
 * Resolve the routed hosts for one trading company, from the tag registry.
 * This is the lookup that makes brand scoping a fact rather than a guess.
 */
function enquiryScopeFor(companyId: string | null | undefined, sources: readonly WebsiteSource[]): MarketingEnquiryScope | null {
  if (!companyId) return null;
  return {
    companyId,
    hosts: sources.filter(source => source.destinationCompanyId === companyId).map(source => normalizeHost(source.host)),
  };
}

export interface MarketingDataSpineOptions {
  /**
   * Narrow the enquiry half to one trading company. Traffic and the radar stay
   * agency-wide — the Radar monitors properties, not brand scopes — so the UI
   * must keep saying so rather than implying a filtered traffic number.
   */
  companyId?: string | null;
  /**
   * Enquiries from `listWebsiteEnquiries()`. Omit (or pass `null`) for a demo
   * session — the feed then reports `available: false` rather than "0 enquiries".
   */
  enquiries?: readonly MarketingEnquiryInput[] | null;
  now?: number;
}

/**
 * Build the marketing data spine for an agency: read the cached Radar, the tag
 * routing registry and the supplied enquiries, and reshape them. Never throws —
 * a Radar failure degrades to `emptyMarketingSpine()`.
 */
export async function marketingDataSpine(
  agencyId: string,
  options: MarketingDataSpineOptions = {},
): Promise<MarketingDataSpine> {
  const now = options.now ?? Date.now();
  try {
    const radar = await getCachedBusinessIssueRadar(agencyId, now);
    const websiteSources = listWebsiteSources(agencyId);
    return shapeMarketingSpine({
      checks: radar.checks.filter(check => check.domain === "marketing"),
      domain: radar.domains.find(summary => summary.domain === "marketing") ?? null,
      summary: radar.summary,
      sources: websiteSources,
      connections: gatherMarketingSources(agencyId, websiteSources),
      enquiries: options.enquiries ?? null,
      enquiryScope: enquiryScopeFor(options.companyId, websiteSources),
      generatedAt: radar.generatedAt,
      now,
    });
  } catch {
    return emptyMarketingSpine(now);
  }
}

// ── Phase 2–4: the marketing command model ────────────────────────────────────
//
// The pulse, the radar watch and the funnel are all *projections of engines that
// already ran*: the KPI registry (`lib/kpiRegistry`) over the command-
// intelligence snapshot, and `commercialIntelligence.lineage`, which has always
// computed the pageview→form→lead→meeting→won chain — marketing simply never
// surfaced it. Nothing here recomputes a metric or edits the registry.

/** One marketing KPI, ready to plot: the registry descriptor plus target maths. */
export interface MarketingPulseMetric {
  id: string;
  label: string;
  shortLabel: string;
  format: KpiDescriptor["format"];
  unit: string;
  value: number | null;
  display: string;
  status: KpiDescriptor["status"];
  detail: string;
  href: string;
  formulaText: string;
  window: string;
  planSource: string;
  target: number | null;
  baseline: number | null;
  direction: KpiDescriptor["direction"];
  measuredAt: number;
  /** The plottable history the registry carried, verbatim (never extrapolated). */
  series: KpiDescriptor["series"];
  /** Signed distance from target as a percentage; `null` without both numbers. */
  deviationPercent: number | null;
  /** `null` when there is no target to be on track against. */
  onTrack: boolean | null;
  /**
   * Whether this KPI's number can be trusted as a reading.
   *
   * A KPI reaches the registry with its value already collapsed — the
   * command-intelligence builder writes `checkValue(...) ?? 0`, so an agency
   * with **nothing monitored** arrives carrying `0`, not `null`, and its status
   * is `learning` or `blind`. Rendering that `0` is the same fabricated number
   * the spine guards against, just via a different path. Only an assessed
   * status (`healthy`/`warning`/`critical`) carries a real measurement.
   */
  measured: boolean;
}

/**
 * The marketing-scoped KPI set: every registry descriptor whose category is the
 * Radar `marketing` domain, in the registry's own rank order. Read-only — the
 * registry is the KPI worker's file and stays untouched.
 */
export function shapeMarketingPulse(descriptors: readonly KpiDescriptor[]): MarketingPulseMetric[] {
  return descriptors
    .filter(descriptor => descriptor.category === "marketing")
    .map(descriptor => {
      const { value, target, direction } = descriptor;
      const comparable = value !== null && target !== null && target !== 0;
      const rawDeviation = comparable ? (value - target) / Math.abs(target) * 100 : null;
      return {
        id: descriptor.id,
        label: descriptor.label,
        shortLabel: descriptor.shortLabel,
        format: descriptor.format,
        unit: descriptor.unit,
        value,
        display: descriptor.display,
        status: descriptor.status,
        detail: descriptor.detail,
        href: descriptor.href,
        formulaText: descriptor.formulaText,
        window: descriptor.window,
        planSource: descriptor.planSource,
        target,
        baseline: descriptor.baseline,
        direction,
        measuredAt: descriptor.measuredAt,
        series: descriptor.series,
        // Signed so the sign always means "good/bad", whichever way is good.
        deviationPercent: rawDeviation === null ? null : Math.round((direction === "lower" ? -rawDeviation : rawDeviation) * 10) / 10,
        onTrack: value === null || target === null ? null : direction === "lower" ? value <= target : value >= target,
        measured: descriptor.status !== "learning" && descriptor.status !== "blind",
      };
    });
}

/** One step of the demand funnel, with its own conversion from the step above. */
export interface MarketingFunnelStage {
  id: string;
  label: string;
  value: number | null;
  /** Conversion from the previous stage, as a percentage. `null` when either side is unmeasured. */
  conversionPercent: number | null;
  /** Records lost between the previous stage and this one. */
  dropFromPrevious: number | null;
  /** False when the number is absent rather than genuinely zero. */
  measured: boolean;
  evidence: string;
  href: string;
}

export interface MarketingFunnelInput {
  /** `null` = no Aqua Tag reading for the window (the lineage type carries measuredness). */
  pageviews: number | null;
  forms: number | null;
  leads: number;
  contacted: number;
  meetings: number;
  proposals: number;
  won: number;
  activeClients: number;
  churnedClients: number;
}

/**
 * The live funnel from `commercialIntelligence.lineage`.
 *
 * The telemetry stages are only trustworthy when the tag actually reported —
 * `lineage` defaults an unmeasured reading to 0, which would read as "nobody
 * visited". `trafficMeasured`/`formsMeasured` (from the spine) let those two
 * stages say "not measured" instead of claiming a zero.
 */
export function shapeMarketingFunnel(
  lineage: MarketingFunnelInput,
  opts: { trafficMeasured?: boolean; formsMeasured?: boolean } = {},
): MarketingFunnelStage[] {
  const stages: Array<Omit<MarketingFunnelStage, "conversionPercent" | "dropFromPrevious">> = [
    { id: "pageviews", label: "Pageviews", value: opts.trafficMeasured === false ? null : lineage.pageviews, measured: opts.trafficMeasured !== false && lineage.pageviews !== null, evidence: "Aqua Tag telemetry, rolling 7 days", href: "/portal/agency/marketing?view=radar" },
    { id: "forms", label: "Form submissions", value: opts.formsMeasured === false ? null : lineage.forms, measured: opts.formsMeasured !== false && lineage.forms !== null, evidence: "Tracked website form events", href: "/portal/agency/marketing?view=radar" },
    { id: "leads", label: "Leads", value: lineage.leads, measured: true, evidence: "Retained lead records", href: "/portal/agency/pipelines/leads" },
    { id: "contacted", label: "Contacted", value: lineage.contacted, measured: true, evidence: "A touch or stage progress recorded", href: "/portal/agency/pipelines/leads" },
    { id: "meetings", label: "Meetings", value: lineage.meetings, measured: true, evidence: "Meeting stage or later", href: "/portal/agency/pipelines/leads" },
    { id: "proposals", label: "Proposals", value: lineage.proposals, measured: true, evidence: "Proposal stage or later", href: "/portal/agency/pipelines/leads" },
    { id: "won", label: "Won", value: lineage.won, measured: true, evidence: "Conversion record", href: "/portal/clients?view=journey" },
    { id: "active-clients", label: "Active clients", value: lineage.activeClients, measured: true, evidence: "Active portfolio", href: "/portal/clients" },
  ];
  return stages.map((stage, index) => {
    const previous = index === 0 ? null : stages[index - 1];
    const comparable = previous !== null && previous.value !== null && stage.value !== null && previous.value > 0;
    return {
      ...stage,
      conversionPercent: comparable ? Math.round(stage.value! / previous!.value! * 1000) / 10 : null,
      dropFromPrevious: previous !== null && previous.value !== null && stage.value !== null ? Math.max(0, previous.value - stage.value) : null,
    };
  });
}

/** Everything the marketing command surface renders, from one radar read. */
export interface MarketingCommandModel {
  available: boolean;
  generatedAt: number;
  spine: MarketingDataSpine;
  pulse: MarketingPulseMetric[];
  funnel: MarketingFunnelStage[];
  /** Per-source commercial performance, already computed by the lifecycle engine. */
  sources: CommercialSourcePerformance[];
}

/**
 * Build the marketing command model: one cached-radar read feeds the spine, the
 * command-intelligence snapshot feeds the KPI registry (pulse) and the lineage
 * funnel. Never throws — a failure degrades to an honest empty model.
 */
export async function marketingCommandModel(
  agencyId: string,
  options: MarketingDataSpineOptions = {},
): Promise<MarketingCommandModel> {
  const now = options.now ?? Date.now();
  try {
    const radar = await getCachedBusinessIssueRadar(agencyId, now);
    const websiteSources = listWebsiteSources(agencyId);
    const spine = shapeMarketingSpine({
      checks: radar.checks.filter(check => check.domain === "marketing"),
      domain: radar.domains.find(summary => summary.domain === "marketing") ?? null,
      summary: radar.summary,
      sources: websiteSources,
      connections: gatherMarketingSources(agencyId, websiteSources),
      enquiries: options.enquiries ?? null,
      enquiryScope: enquiryScopeFor(options.companyId, websiteSources),
      generatedAt: radar.generatedAt,
      now,
    });
    const snapshot = await buildCommandIntelligenceSnapshot({
      agencyId,
      radar,
      evidence: inspectRadarEvidence(agencyId),
      now,
    });
    const trafficMeasured = spine.measures.find(measure => measure.id === "traffic-7d")?.measured ?? false;
    const formsMeasured = spine.measures.find(measure => measure.id === "form-submissions")?.measured ?? false;
    return {
      available: true,
      generatedAt: snapshot.generatedAt,
      spine,
      pulse: shapeMarketingPulse(describeCommandKpis(snapshot)),
      funnel: shapeMarketingFunnel(snapshot.commercialIntelligence.lineage, { trafficMeasured, formsMeasured }),
      sources: snapshot.commercialIntelligence.sources,
    };
  } catch {
    return {
      available: false,
      generatedAt: now,
      spine: emptyMarketingSpine(now),
      pulse: [],
      funnel: [],
      sources: [],
    };
  }
}

// ── Real campaign attribution (from enquiries, not assumptions) ───────────────
//
// A campaign row already counts its *leads* and *clients*. What it never showed
// is the demand that actually arrived carrying its name: `brand_enquiries` rows
// carry both a `campaign` and a `source`, straight off the tagged site. Matching
// those to campaign records is the only place in this module that makes a
// judgement, so it follows the house rule — **guess, then human-confirm**:
// an exact key match is stated as fact, a name match is flagged `confident:
// false` so the UI can present it as a suggestion, and anything that matches
// nothing is reported as a gap rather than quietly absorbed.

export interface MarketingCampaignRecord {
  id: string;
  name: string;
  sourceKey?: string;
}

export interface MarketingCampaignAttribution {
  campaignId: string;
  campaignName: string;
  /** The enquiry group key that matched, or `null` when nothing did. */
  matchedKey: string | null;
  /** How the match was made — `key` is proven, `name` is a suggestion to confirm. */
  matchedOn: "key" | "name" | null;
  /** True only for an exact key match. A name match is a guess awaiting confirmation. */
  confident: boolean;
  enquiries: number;
  last7d: number;
  last30d: number;
  latestAt: number | null;
}

export interface MarketingAttributionGap {
  key: string;
  label: string;
  enquiries: number;
  last30d: number;
}

export interface MarketingCampaignAttributionResult {
  available: boolean;
  campaigns: MarketingCampaignAttribution[];
  /** Campaign/source names arriving on real enquiries with no campaign record behind them. */
  gaps: MarketingAttributionGap[];
  /** Enquiries carrying no campaign and no usable source at all. */
  unattributed: number;
}

/** Loose comparison key: case- and punctuation-insensitive. */
function matchKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Attribute real enquiries to campaign records.
 *
 * Reads the feed's already-grouped `byCampaign` and `bySource` rows, so no
 * enquiry is re-scanned. A campaign matches at most one group, and a group is
 * consumed by at most one campaign — first by `sourceKey` (proven), then by
 * name (a suggestion). Whatever is left over is a gap worth acting on.
 */
export function attributeEnquiriesToCampaigns(
  campaigns: readonly MarketingCampaignRecord[],
  feed: MarketingEnquiryFeed,
): MarketingCampaignAttributionResult {
  if (!feed.available) {
    return { available: false, campaigns: [], gaps: [], unattributed: 0 };
  }
  const groups = new Map<string, MarketingEnquiryGroup & { kind: "campaign" | "source" }>();
  for (const row of feed.byCampaign) groups.set(matchKey(row.key), { ...row, kind: "campaign" });
  // A source row only fills a slot no campaign row already claimed.
  for (const row of feed.bySource) {
    if (row.key === "unattributed") continue;
    const key = matchKey(row.key);
    if (!groups.has(key)) groups.set(key, { ...row, kind: "source" });
  }

  const claimed = new Set<string>();
  const attributed = campaigns.map<MarketingCampaignAttribution>(campaign => {
    const byKey = campaign.sourceKey ? matchKey(campaign.sourceKey) : null;
    const byName = matchKey(campaign.name);
    const hit = byKey && groups.has(byKey) && !claimed.has(byKey)
      ? { key: byKey, matchedOn: "key" as const }
      : groups.has(byName) && !claimed.has(byName)
        ? { key: byName, matchedOn: "name" as const }
        : null;
    if (!hit) {
      return { campaignId: campaign.id, campaignName: campaign.name, matchedKey: null, matchedOn: null, confident: false, enquiries: 0, last7d: 0, last30d: 0, latestAt: null };
    }
    claimed.add(hit.key);
    const group = groups.get(hit.key)!;
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      matchedKey: group.key,
      matchedOn: hit.matchedOn,
      confident: hit.matchedOn === "key",
      enquiries: group.total,
      last7d: group.last7d,
      last30d: group.last30d,
      latestAt: group.latestAt,
    };
  });

  const gaps = [...groups.entries()]
    .filter(([key, group]) => !claimed.has(key) && group.kind === "campaign")
    .map(([, group]) => ({ key: group.key, label: group.label, enquiries: group.total, last30d: group.last30d }))
    .sort((a, b) => b.enquiries - a.enquiries);

  return {
    available: true,
    campaigns: attributed.sort((a, b) => b.enquiries - a.enquiries || a.campaignName.localeCompare(b.campaignName)),
    gaps,
    unattributed: feed.unattributed,
  };
}

// ── What marketing is actually plugged into ──────────────────────────────────
//
// "Marketing knows its data" cuts both ways: it has to know what it *cannot*
// see. The Aqua Tag can inject seven analytics tools, but injecting a tool only
// sends data *out* — reading it back needs a server-side integration. Today
// exactly one marketing source reads back: **Google Search Console** (a real API
// sync writing `type: "search"` telemetry, which is what feeds the radar's
// `search-visibility` family). PostHog is injectable and would carry the
// geography and demographics the people-map wants, but nothing reads it back
// yet.
//
// So this reports both halves per provider — injected (data flowing out) and
// reads-back (data flowing in) — instead of letting a green "PostHog ✓" imply
// AquaCRM can see anything. When the PostHog read-back lands, only
// `READ_BACK_PROVIDERS` changes.

/** Injection kinds that also have a server-side read-back into AquaCRM. */
const READ_BACK_PROVIDERS: Record<string, { integrationProvider: string; feeds: string }> = {
  "gsc-verification": { integrationProvider: "google-search-console", feeds: "Radar search-visibility" },
};

export interface MarketingSourceConnection {
  kind: string;
  label: string;
  /** Sites carrying this tool through the tag, out of all registered sites. */
  injectedSites: number;
  totalSites: number;
  /** True when a server-side integration pulls this tool's data back into AquaCRM. */
  readsBack: boolean;
  /** What the read-back feeds, when there is one. */
  feeds: string | null;
  /** Newest successful sync of the read-back integration, if any. */
  lastSyncAt: number | null;
  /** One honest sentence for the UI. */
  state: "reading" | "connected-outbound" | "not-connected";
}

export interface MarketingSourceInput {
  kind: string;
  label: string;
  /** Injections of this kind, one entry per site that carries it (enabled only). */
  injectedSites: number;
  totalSites: number;
  /** `lastSyncAt` of the matching integration connection, when one exists. */
  lastSyncAt?: number | null;
}

/** Pure: classify each provider by what it can actually give marketing. */
export function shapeMarketingSources(inputs: readonly MarketingSourceInput[]): MarketingSourceConnection[] {
  return inputs
    .map<MarketingSourceConnection>(input => {
      const readBack = READ_BACK_PROVIDERS[input.kind];
      const lastSyncAt = input.lastSyncAt ?? null;
      // "Reading" needs both halves: the tool on the site AND a sync that ran.
      const reading = Boolean(readBack) && lastSyncAt !== null;
      return {
        kind: input.kind,
        label: input.label,
        injectedSites: input.injectedSites,
        totalSites: input.totalSites,
        readsBack: Boolean(readBack),
        feeds: readBack?.feeds ?? null,
        lastSyncAt,
        state: reading ? "reading" : input.injectedSites > 0 ? "connected-outbound" : "not-connected",
      };
    })
    .sort((a, b) => {
      const rank = { reading: 0, "connected-outbound": 1, "not-connected": 2 } as const;
      return rank[a.state] - rank[b.state] || b.injectedSites - a.injectedSites || a.label.localeCompare(b.label);
    });
}
