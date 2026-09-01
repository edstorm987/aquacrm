// Canonical metric registry — one stable identity and one semantic record for
// every KPI the intelligence layer computes.
//
// ── The problem this solves ───────────────────────────────────────────────
//
// Surveyed 2026-08-30: metric identity, formula text and computation live in
// three unlinked places (`commandIntelligenceService.ts` makeKpi args, its
// `measurementFor()` lookup, and the upstream builders), the flat descriptor
// legacy presentation id space already collides (`campaign-roas` is BOTH a
// command KPI and a commercial formula). Durable references now use canonical
// ids and reject ambiguous new bare writes; at least nine
// business quantities are computed in two to four places, two with genuinely
// different semantics (the response SLA threshold, the conversion
// denominator). Three parallel identity schemes exist: KPI id
// (`lead-conversion`), radar family id (`lead-conversion-rate`), evidence
// series id (`sales:lead-conversion-rate`).
//
// ── What this module is ───────────────────────────────────────────────────
//
// The registry does NOT restate formulas — restating them would create the
// second source of truth this work exists to remove. The computation stays
// exactly where it is; each entry names `computedBy` (the ONE authoritative
// calculation site) and adds the semantics the code cannot carry: a globally
// unique canonical id, grain, dimensions, timezone, freshness, confidence
// semantics, ownership, the radar-family join key, and explicit `overlaps`
// links marking every known competing calculation so none of them can pose
// as independent metrics.
//
// `scripts/smoke-metric-registry.test.ts` enforces it mechanically:
//   • the registry's (kind, id) pairs exactly equal the ids extracted from
//     the two defining source files — a NEW metric cannot ship unregistered,
//     and a retired one cannot linger here;
//   • canonical ids are globally unique;
//   • the bare-id collision set exactly equals KNOWN_DESCRIPTOR_ID_COLLISIONS
//     — the existing collision is pinned, a new one fails the suite;
//   • every overlap link points at a registered metric.
//
// Client-safe and pure.

export type MetricKind = "command" | "commercial";

export type MetricOverlapRelation =
  | "same-quantity" // two metrics claim the same business number — dedup target
  | "related"; // same family, deliberately different question

export interface MetricOverlap {
  /** Canonical id of the other metric. */
  canonicalId: string;
  relation: MetricOverlapRelation;
  note: string;
}

export interface CanonicalMetricEntry {
  /** The descriptor id as computed today (NOT globally unique — see canonicalId). */
  id: string;
  kind: MetricKind;
  /**
   * The globally unique stable id: `<kind>:<id>`. New consumers key on THIS.
   * The bare id stays for compatibility with descriptors, hrefs and saved
   * custom-KPI definitions until the dedup phase completes.
   */
  canonicalId: string;
  name: string;
  /** One-sentence canonical business definition. */
  definition: string;
  /** What one value denotes, e.g. "one value per agency per snapshot". */
  grain: string;
  /** Dimensions along which scoped variants exist (outside the registry today). */
  dimensions: readonly string[];
  /**
   * file:symbol computing the number — the one calculation authority. The
   * formula/numerator/denominator strings live WITH the computation
   * (measurementFor / makeFormula) and are deliberately not restated here.
   */
  computedBy: string;
  /** Radar rule family the metric joins to (evidence series = `<domain>:<family>`). */
  radarFamilyId?: string;
  /** Exclusion rules that matter for interpretation. */
  exclusions?: string;
  timezone: string;
  /** How the reporting window is anchored. */
  window: string;
  direction: "higher" | "lower";
  /** How stale the value can be and what refreshes it. */
  freshness: string;
  /** When the metric reads null/Learning — the honest-absence contract. */
  confidence: string;
  owner: string;
  overlaps?: readonly MetricOverlap[];
}

/**
 * Bare descriptor ids KNOWN to exist under more than one kind. Pinned so the
 * existing collision cannot silently multiply; the dedup phase retires it.
 */
export const KNOWN_DESCRIPTOR_ID_COLLISIONS: readonly string[] = ["campaign-roas"];

const UTC = "UTC (all timestamps epoch ms; windows anchored to the server clock, not a civil timezone)";
const SNAPSHOT_FRESHNESS = "Computed on demand per Command snapshot; history hydrated from the radar evidence vault (probe cron daily — evidence can be up to 24h stale, issue #170).";
const COMMERCIAL_FRESHNESS = "Point-in-time on snapshot build; carries no retained trend of its own.";
const CI = "src/lib/server/commandIntelligenceService.ts";
const COMM = "src/lib/intelligence/commercialIntelligence.ts";
const LIFE = "src/lib/intelligence/commercialLifecycle.ts";
const OWNER_COMMAND = "Command Centre intelligence (lib/server/commandIntelligenceService)";
const OWNER_COMMERCIAL = "Commercial intelligence (lib/intelligence/commercialIntelligence)";

function command(
  id: string,
  name: string,
  definition: string,
  extra: Partial<Pick<CanonicalMetricEntry, "grain" | "dimensions" | "computedBy" | "radarFamilyId" | "exclusions" | "window" | "direction" | "confidence" | "overlaps" | "freshness">> = {},
): CanonicalMetricEntry {
  return {
    id,
    kind: "command",
    canonicalId: `command:${id}`,
    name,
    definition,
    grain: extra.grain ?? "one value per agency per snapshot",
    dimensions: extra.dimensions ?? ["company", "client", "property (scoped readings, outside the registry today)"],
    computedBy: extra.computedBy ?? `${CI} makeKpi("${id}")`,
    radarFamilyId: extra.radarFamilyId,
    exclusions: extra.exclusions,
    timezone: UTC,
    window: extra.window ?? "current snapshot",
    direction: extra.direction ?? "higher",
    freshness: extra.freshness ?? SNAPSHOT_FRESHNESS,
    confidence: extra.confidence ?? "null value renders as Learning/blind, never a fabricated zero.",
    owner: OWNER_COMMAND,
    overlaps: extra.overlaps,
  };
}

function commercial(
  id: string,
  name: string,
  definition: string,
  extra: Partial<Pick<CanonicalMetricEntry, "grain" | "dimensions" | "radarFamilyId" | "exclusions" | "window" | "direction" | "confidence" | "overlaps">> = {},
): CanonicalMetricEntry {
  return {
    id,
    kind: "commercial",
    canonicalId: `commercial:${id}`,
    name,
    definition,
    grain: extra.grain ?? "one value per agency per snapshot",
    dimensions: extra.dimensions ?? ["source cohort", "pipeline stage (companion rows in the same snapshot)"],
    computedBy: `${COMM} makeFormula("${id}")`,
    radarFamilyId: extra.radarFamilyId,
    exclusions: extra.exclusions,
    timezone: UTC,
    window: extra.window ?? "retained lifecycle history at snapshot time",
    direction: extra.direction ?? "higher",
    freshness: COMMERCIAL_FRESHNESS,
    confidence: extra.confidence ?? "null under the activation threshold (Learning) — descriptors emit no fabricated series point.",
    owner: OWNER_COMMERCIAL,
    overlaps: extra.overlaps,
  };
}

export const CANONICAL_METRICS: readonly CanonicalMetricEntry[] = [
  // ── Command KPIs (20) — defined in commandIntelligenceService.ts ─────────
  command("business-health", "Business health", "Executive 100-point index blending the company index (70%) with incident health (30%); incident health alone until the company index is measurable.", {
    computedBy: "src/engines/data/radar/radarPolicyEngine.ts healthScore (companyHealth × 0.7 + incidentHealth × 0.3)",
    radarFamilyId: "overall-health",
    window: "latest Radar sweep",
  }),
  command("revenue-target", "Revenue target attainment", "Recorded paid monthly income as a share of the approved monthly revenue target.", {
    radarFamilyId: "target-progress", window: "current calendar month",
    computedBy: "src/engines/data/server/kpi/companyHealthSnapshot.ts (company actuals vs profile target)",
  }),
  command("mrr", "Monthly recurring revenue", "Sum of active recurring plan monthly value across allocated clients.", {
    radarFamilyId: "mrr", window: "current plan assignments",
    computedBy: "src/built-ins/modules/agency-finance/src/server/pnl.ts mrrCents (via companyHealthSnapshot)",
  }),
  command("revenue-gap", "Revenue gap", "Income still required this month: max(0, monthly target − recorded paid income).", {
    radarFamilyId: "cash-gap", direction: "lower", window: "current calendar month",
    computedBy: "src/engines/data/server/kpi/companyHealthSnapshot.ts revenueGapCents",
    overlaps: [{ canonicalId: "command:revenue-target", relation: "related", note: "The additive complement of target attainment; also recomputed verbatim in battleTablePayload.server.ts and _CompanyWorkspace.tsx — consolidation target." }],
  }),
  command("recent-leads", "New leads in 30 days", "Count of lead records captured in the rolling 30-day window.", {
    radarFamilyId: "enquiries-30d", window: "rolling 30 days",
    computedBy: `${LIFE} recentLeadCount`,
    overlaps: [{ canonicalId: "commercial:new-leads-30d", relation: "same-quantity", note: "Same business number computed twice (commercialLifecycle vs commercialIntelligence row filters). Dedup target: one computation, two projections." }],
  }),
  command("lead-conversion", "Lead-to-client conversion", "Converted lead records as a share of all retained lead records.", {
    radarFamilyId: "lead-conversion-rate", window: "retained lifecycle history",
    computedBy: `${LIFE} percentage(convertedLeads, leads)`,
    overlaps: [{ canonicalId: "commercial:lead-to-client", relation: "same-quantity", note: "Four implementations exist (commercialLifecycle, commercialIntelligence, agency-marketing reports (0–1 ratio!), marketingIntelligence funnel). Canonical: this entry's computedBy. Dedup phase folds the rest." }],
  }),
  command("speed-to-lead", "Speed to lead (SLA compliance)", "Share of measurable enquiry responses inside the CONFIGURED SLA (guardrails.speedToLeadTargetMinutes).", {
    radarFamilyId: "median-response", window: "current retained enquiry set",
    computedBy: "src/engines/data/server/radar/businessIssueRadar.ts buildSpeedToLeadRadar (configured SLA, median, p90)",
    exclusions: "Enquiries with no recorded response are excluded from the ratio and surfaced separately as awaiting/breached.",
    overlaps: [{ canonicalId: "commercial:response-sla", relation: "same-quantity", note: "response-sla HARDCODES a 5-minute threshold while this uses the configured SLA — two 'response compliance' numbers can disagree in one explorer. Dedup: response-sla must read the configured guardrail." }],
  }),
  command("source-attribution", "Source attribution coverage", "Share of retained leads carrying a usable original source.", {
    radarFamilyId: "source-attribution", window: "retained lifecycle history",
    overlaps: [{ canonicalId: "commercial:source-coverage", relation: "same-quantity", note: "Same coverage question computed from different row sets." }],
  }),
  command("active-campaigns", "Active campaigns", "Count of campaigns in an operating state (active, scheduled, sending).", { radarFamilyId: "campaign-activity", window: "current campaign state" }),
  command("campaign-outcomes", "Campaign outcome linkage", "Share of launched campaigns with a source, lead or revenue path.", { radarFamilyId: "campaign-outcomes", window: "retained campaign history" }),
  command("marketing-spend", "Marketing spend", "Sum of recorded campaign spend.", { radarFamilyId: "marketing-spend", direction: "lower", window: "current workspace records" }),
  command("campaign-roas", "Portfolio campaign ROAS", "Attributed campaign revenue divided by recorded campaign spend, over rows built by buildCampaignRows (zero-clamped, rounded 2dp).", {
    radarFamilyId: "campaign-roas", window: "retained campaign records",
    computedBy: `${CI} buildCampaignRows + portfolio roll-up`,
    overlaps: [{ canonicalId: "commercial:campaign-roas", relation: "same-quantity", note: "LEGACY PRESENTATION-ID COLLISION (pinned in KNOWN_DESCRIPTOR_ID_COLLISIONS): the commercial twin computes unrounded over raw campaign records. Durable references are canonical and ambiguity-safe; the dedup phase still folds the calculations." }],
  }),
  command("traffic-7d", "Website traffic (7d)", "Count of Aqua Tag pageview events across selected monitored properties in the rolling 7 days.", {
    radarFamilyId: "traffic-7d", window: "rolling 7 days",
    computedBy: "src/lib/server/clients/clientTelemetryService.ts events (source: Client.metadata.telemetryEvents — see metadataContracts 'telemetry')",
    confidence: "null when no Aqua Tag reading exists — never a fabricated zero (demandFlow contract).",
  }),
  command("revenue-growth", "Revenue growth", "Percent change of paid income, current month vs preceding month.", { radarFamilyId: "revenue-growth", window: "current month vs preceding month" }),
  command("forms-7d", "Tracked forms (7d)", "Count of tracked form events across selected monitored properties in the rolling 7 days.", {
    radarFamilyId: "forms-7d", window: "rolling 7 days",
    confidence: "null when unmeasured, not 'no forms' (CommandDemandFlow contract).",
  }),
  command("website-conversion", "Website conversion rate", "Tracked conversion events as a share of tracked pageviews over the rolling 7 days.", {
    radarFamilyId: "website-conversion", window: "rolling 7 days",
    computedBy: "src/engines/data/server/radar/radarObservations.ts (conversions7d / pageviews7d)",
    exclusions: "Conversion event predicate: type conversion|form|interaction-with-metric-conversion — currently TRIPLICATED verbatim (radarTelemetry, commandIntelligenceService.scopedConversion, performanceAnalytics); consolidation target.",
    overlaps: [{ canonicalId: "commercial:pageview-to-form", relation: "related", note: "pageview-to-form uses FORMS as numerator, not conversions — a different question that reads confusingly similar; keep both, label loudly." }],
  }),
  command("audience-confidence", "Audience confidence", "Validated active customer profiles as a share of active profiles.", { radarFamilyId: "audience-confidence", window: "current profile state" }),
  command("active-clients", "Active clients", "Active client workspaces excluding churned and archived records.", { radarFamilyId: "active-clients", window: "current relationship state" }),
  command("retention", "Portfolio retention", "Active clients as a share of active plus churned client relationships.", {
    radarFamilyId: "retention", window: "retained lifecycle history",
    computedBy: `${LIFE} retentionRatePercent`,
    overlaps: [{ canonicalId: "commercial:portfolio-retention", relation: "same-quantity", note: "Same number computed twice; both declare target 80%+. Dedup target." }],
  }),
  command("client-attention", "Clients needing attention", "Count of active clients with an ownership, contact, request, milestone or telemetry concern.", { radarFamilyId: "client-attention", direction: "lower", window: "latest health evaluation" }),

  // ── Commercial formulas (40) — defined in commercialIntelligence.ts ──────
  commercial("lead-to-client", "Lead-to-client conversion", "Converted leads / all retained leads × 100.", {
    radarFamilyId: "lead-conversion-rate",
    overlaps: [{ canonicalId: "command:lead-conversion", relation: "same-quantity", note: "See command twin — canonical computation is commercialLifecycle's." }],
  }),
  commercial("decision-win", "Decision win rate", "Won decisions / (won + lost decisions) × 100 — sales effectiveness excluding open pipeline."),
  commercial("portfolio-retention", "Portfolio retention", "Active clients / (active + churned clients) × 100.", {
    overlaps: [{ canonicalId: "command:retention", relation: "same-quantity", note: "Duplicate of the command KPI." }],
  }),
  commercial("portfolio-churn", "Portfolio churn", "Churned clients / (active + churned clients) × 100.", { direction: "lower" }),
  commercial("revenue-per-lead", "Attributed revenue per lead", "Attributed campaign revenue / retained leads; activates only when campaign revenue is recorded."),
  commercial("open-pipeline", "Open pipeline", "Count of leads excluding won/lost terminal states.", { window: "current pipeline state" }),
  commercial("new-leads-30d", "New leads in 30 days", "Lead capture timestamps within the trailing 30 days.", {
    window: "rolling 30 days",
    overlaps: [{ canonicalId: "command:recent-leads", relation: "same-quantity", note: "Duplicate of the command KPI." }],
  }),
  commercial("contact-rate", "Contacted rate", "Leads with a contact or progressed stage / all leads × 100."),
  commercial("meeting-rate", "Meeting progression", "Leads reaching meeting or later / all leads × 100."),
  commercial("proposal-rate", "Proposal progression", "Leads reaching proposal or later / all leads × 100."),
  commercial("median-response", "Median speed to lead", "Median(first response time − latest enquiry time) over measured responses.", {
    direction: "lower", radarFamilyId: "median-response",
    overlaps: [{ canonicalId: "command:speed-to-lead", relation: "related", note: "The command KPI is SLA compliance; this is the median latency. Both derive from buildSpeedToLeadRadar's sample set — the median is ALSO computed there (medianResponseMs); dedup folds this recompute." }],
  }),
  commercial("response-sla", "Five-minute response compliance", "Responses within 5 minutes / measured responses × 100 — threshold HARDCODED at 5 minutes.", {
    overlaps: [{ canonicalId: "command:speed-to-lead", relation: "same-quantity", note: "Must read the configured guardrail instead of the hardcoded 5 minutes; until then the two compliance numbers can disagree." }],
  }),
  commercial("median-conversion", "Median conversion cycle", "Median(convertedAt − capturedAt) over converted leads.", { direction: "lower" }),
  commercial("median-open-age", "Median open pipeline age", "Median(now − latest stage entry) for open leads.", { direction: "lower" }),
  commercial("stale-open", "Stale open lead rate", "Open leads unchanged 14+ days / open leads × 100.", { direction: "lower" }),
  commercial("enquiries-per-lead", "Enquiries per lead", "Recorded enquiries / retained leads — repeat-demand depth."),
  commercial("touches-per-lead", "Commercial touches per lead", "Contact, meeting and stage events / retained leads."),
  commercial("zero-touch-open", "Untouched open leads", "Open leads with no contact timestamp or contact event.", { direction: "lower" }),
  commercial("source-coverage", "Lead source coverage", "Leads with a usable source / all leads × 100.", {
    overlaps: [{ canonicalId: "command:source-attribution", relation: "same-quantity", note: "Duplicate of the command KPI." }],
  }),
  commercial("campaign-coverage", "Campaign linkage coverage", "Leads matching a campaign source key / all leads × 100."),
  commercial("stage-coverage", "Pipeline stage coverage", "Leads linked to a pipeline stage / all leads × 100."),
  commercial("conversion-linkage", "Converted client linkage", "Converted leads linked to a client / converted leads × 100."),
  commercial("contactability", "Lead contactability", "Leads with a usable email / all leads × 100."),
  commercial("cost-per-lead", "Cost per acquired lead", "Recorded campaign spend / campaign-linked leads.", { direction: "lower" }),
  commercial("customer-acquisition-cost", "Customer acquisition cost", "Recorded campaign spend / linked converted clients.", { direction: "lower" }),
  commercial("campaign-roas", "Campaign return on spend", "Attributed campaign revenue / recorded campaign spend, unrounded over raw campaign records.", {
    radarFamilyId: "campaign-roas",
    overlaps: [{ canonicalId: "command:campaign-roas", relation: "same-quantity", note: "The pinned bare-id collision — see the command twin." }],
  }),
  commercial("pageview-to-form", "Pageview-to-form conversion", "Tracked forms / tracked pageviews × 100.", {
    overlaps: [{ canonicalId: "command:website-conversion", relation: "related", note: "Different numerator (forms vs conversions) — a different question." }],
  }),
  commercial("form-to-lead", "Form-to-lead retention", "Retained lead records / tracked forms × 100; can exceed 100% (repeat forms, non-web leads) — directional only."),
  commercial("lead-loss-rate", "Recorded lead loss rate", "Lost decisions / (won + lost decisions) × 100.", { direction: "lower" }),
  commercial("decision-coverage", "Pipeline decision coverage", "Won or lost decisions / all retained leads × 100."),
  commercial("repeat-enquiry-rate", "Repeat enquiry rate", "Leads with 2+ enquiries / all leads × 100."),
  commercial("response-measurement", "Response measurement coverage", "Enquiry leads with a valid response clock / leads with enquiries × 100 — separates performance from missing evidence."),
  commercial("source-concentration", "Largest-source concentration", "Leads from the largest source cohort / all leads × 100.", { direction: "lower" }),
  commercial("source-diversity", "Acquisition source diversity", "Distinct attributed source cohorts with at least one retained lead."),
  commercial("meeting-to-proposal", "Meeting-to-proposal progression", "Leads reaching proposal / leads reaching meeting × 100."),
  commercial("proposal-close-rate", "Proposal close rate", "Converted leads / leads reaching proposal × 100."),
  commercial("client-source-coverage", "Client source coverage", "Clients with a linked lead or explicit source / all clients × 100."),
  commercial("orphan-clients", "Clients without lead linkage", "Client records whose acquisition history cannot be traced.", { direction: "lower" }),
  commercial("campaign-budget-use", "Campaign budget utilisation", "Recorded campaign spend / funded campaign budget × 100.", { direction: "lower" }),
  commercial("revenue-per-client", "Attributed revenue per converted client", "Attributed campaign revenue / linked converted clients."),
] as const;

const BY_CANONICAL_ID: ReadonlyMap<string, CanonicalMetricEntry> = new Map(
  CANONICAL_METRICS.map(entry => [entry.canonicalId, entry]),
);

export type DynamicKpiKind = "evidence" | "custom";
export type KpiReferenceMode = "strict" | "legacy";

/** A user-facing validation error for a KPI reference that cannot be resolved safely. */
export class KpiReferenceError extends Error {
  constructor(
    public readonly code: "missing" | "unknown" | "ambiguous",
    public readonly reference: string,
    message: string,
  ) {
    super(message);
    this.name = "KpiReferenceError";
  }
}

function isDynamicKpiReference(reference: string, allowed: readonly DynamicKpiKind[]): boolean {
  const separator = reference.indexOf(":");
  if (separator <= 0 || separator === reference.length - 1 || reference.length > 140) return false;
  const kind = reference.slice(0, separator) as DynamicKpiKind;
  const id = reference.slice(separator + 1);
  return allowed.includes(kind) && !/\s/.test(id);
}

/**
 * Resolve any persisted KPI reference to its globally unique identity.
 *
 * New writes use `strict`: a legacy bare id remains compatible only when it is
 * unambiguous. Migration code uses `legacy`, which maps the one historical
 * collision to the command descriptor because that is how the old picker
 * resolved `.find()`; this makes backfill deterministic without making new
 * ambiguous writes legal.
 */
export function canonicalKpiReference(
  value: string,
  options: { mode?: KpiReferenceMode; allowDynamicKinds?: readonly DynamicKpiKind[] } = {},
): string {
  const reference = value.trim();
  if (!reference) throw new KpiReferenceError("missing", reference, "KPI id is required.");
  if (BY_CANONICAL_ID.has(reference)) return reference;

  const dynamicKinds = options.allowDynamicKinds ?? ["evidence", "custom"];
  if (isDynamicKpiReference(reference, dynamicKinds)) return reference;
  if (reference.includes(":")) {
    throw new KpiReferenceError("unknown", reference, `Unknown KPI id "${reference}".`);
  }

  const command = BY_CANONICAL_ID.get(`command:${reference}`);
  const commercial = BY_CANONICAL_ID.get(`commercial:${reference}`);
  if (command && commercial) {
    if (options.mode === "legacy") return command.canonicalId;
    throw new KpiReferenceError(
      "ambiguous",
      reference,
      `KPI id "${reference}" is ambiguous; use "${command.canonicalId}" or "${commercial.canonicalId}".`,
    );
  }
  const resolved = command ?? commercial;
  if (resolved) return resolved.canonicalId;
  throw new KpiReferenceError("unknown", reference, `Unknown KPI id "${reference}".`);
}

/** Non-throwing resolver for migration/read paths. */
export function tryCanonicalKpiReference(
  value: string,
  options: { mode?: KpiReferenceMode; allowDynamicKinds?: readonly DynamicKpiKind[] } = {},
): string | undefined {
  try {
    return canonicalKpiReference(value, options);
  } catch {
    return undefined;
  }
}

/** Deterministically migrate, validate, de-duplicate and retain order. */
export function migrateLegacyKpiReferenceIds(
  values: readonly string[],
  options: { allowDynamicKinds?: readonly DynamicKpiKind[] } = {},
): string[] {
  const migrated = values
    .filter((value): value is string => typeof value === "string")
    .map(value => tryCanonicalKpiReference(value, { ...options, mode: "legacy" }))
    .filter((value): value is string => Boolean(value));
  return [...new Set(migrated)];
}

/** Look up by globally unique canonical id (`command:mrr`). */
export function canonicalMetric(canonicalId: string): CanonicalMetricEntry | undefined {
  return BY_CANONICAL_ID.get(canonicalId);
}

/**
 * Resolve a bare descriptor id to its canonical entry. For the pinned
 * collision this is ambiguous — pass `kind` to disambiguate; without it the
 * command entry wins (matching the picker's `.find()` behaviour, so the
 * ambiguity is at least consistent while the dedup phase runs).
 */
export function canonicalMetricForDescriptor(descriptorId: string, kind?: MetricKind): CanonicalMetricEntry | undefined {
  if (kind) return BY_CANONICAL_ID.get(`${kind}:${descriptorId}`);
  return BY_CANONICAL_ID.get(`command:${descriptorId}`) ?? BY_CANONICAL_ID.get(`commercial:${descriptorId}`);
}

/** Every pair of metrics registered as claiming the same business quantity. */
export function sameQuantityPairs(): ReadonlyArray<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  for (const entry of CANONICAL_METRICS) {
    for (const overlap of entry.overlaps ?? []) {
      if (overlap.relation !== "same-quantity") continue;
      const pair = [entry.canonicalId, overlap.canonicalId].sort() as [string, string];
      if (!pairs.some(existing => existing[0] === pair[0] && existing[1] === pair[1])) pairs.push(pair);
    }
  }
  return pairs;
}
