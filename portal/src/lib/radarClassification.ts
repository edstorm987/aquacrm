import type {
  AdvisorDomain,
  RadarCheckScope,
  RadarCheckTier,
  RadarDataDependency,
  RadarFindingGroup,
  RadarRuleLens,
} from "@/lib/businessRadar";

/**
 * Radar check classification (radar upgrade Stage 2).
 *
 * Additive metadata over the existing 2,040-rule catalogue and every sentinel /
 * history / synthetic check — *not* a catalogue rewrite. Two independent axes:
 *
 *  - **tier** — which sweep refreshes the check. Scope-driven, because scope
 *    already records how a check is produced: the KPI matrix + sentinels +
 *    watchdog are assembled in-state by the Pulse (`instant`); the synthetic
 *    canaries are a live network round-trip run by the Deep sweep (`probe`);
 *    the evidence-layer checks need retained history from the Evidence sweep
 *    (`rollup`). The scheduler maps tier → sweep (`RADAR_TIER_TO_SWEEP`).
 *
 *  - **dataDependency** — what the check's *answer* relies on, so "why is this
 *    blind?" is answerable (external dependency down vs. not-yet-instrumented).
 *
 * @see docs/development/plans/radar-upgrade.md — Part B.
 */

/** Scope → tier. Scope is the authoritative record of how a check is produced. */
export const RADAR_TIER_BY_SCOPE: Record<RadarCheckScope, RadarCheckTier> = {
  kpi: "instant",
  source: "instant",
  property: "instant",
  watchdog: "instant",
  synthetic: "probe",
  infra: "probe",
  history: "rollup",
};

/**
 * Lenses whose verdict needs retained history rather than the current value
 * alone — trend/anomaly compare periods, baseline/forecast/volatility need a
 * distribution. On an `instant`/`in-state` scope these still flag a `derived`
 * dependency (they lean on the evidence rollup having accrued).
 */
const HISTORY_DEPENDENT_LENSES: ReadonlySet<RadarRuleLens> = new Set<RadarRuleLens>([
  "trend",
  "anomaly",
  "baseline",
  "forecast",
  "volatility",
]);

/** The shape needed to classify — every RadarCheck and catalogue rule has these. */
export interface RadarClassifiable {
  scope: RadarCheckScope;
  lens: RadarRuleLens;
}

export function radarCheckTier(scope: RadarCheckScope): RadarCheckTier {
  return RADAR_TIER_BY_SCOPE[scope];
}

export function radarDataDependency(check: RadarClassifiable): RadarDataDependency {
  // A live probe (network or DB) or tag telemetry — the answer comes from outside AquaCRM's in-state model.
  if (check.scope === "synthetic" || check.scope === "property" || check.scope === "infra") return "external";
  // Retained evidence history.
  if (check.scope === "history") return "derived";
  // In-state scope, but the lens leans on accrued history.
  if (HISTORY_DEPENDENT_LENSES.has(check.lens)) return "derived";
  return "in-state";
}

export interface RadarClassification {
  tier: RadarCheckTier;
  dataDependency: RadarDataDependency;
}

export function classifyRadarCheck(check: RadarClassifiable): RadarClassification {
  return { tier: radarCheckTier(check.scope), dataDependency: radarDataDependency(check) };
}

// ─── Finding grouping (radar upgrade Stage 5) ───────────────────────────────
// Six top-level "what kind of problem" buckets (Ed's choice) above the existing
// {domain}:{category} grouping. Order matters — the first two are cross-domain
// overrides (a reliability/observability problem or a platform problem reads as
// such regardless of which domain raised it), then domain-driven defaults.

/** Human labels for the finding groups. */
export const RADAR_FINDING_GROUP_LABELS: Record<RadarFindingGroup, string> = {
  infrastructure: "Infrastructure",
  commercial: "Commercial",
  compliance: "Compliance",
  delivery: "Delivery",
  reliability: "Reliability",
  people: "People",
};

// Is it running and observable? (uptime, errors, webhooks, probes, blind spots) — overrides domain.
const RELIABILITY_ID = /synthetic|canary|probe|outage|runtime|-errors?\b|error-rate|heartbeat|monitoring|uptime|webhook|connection-error|sync-fresh|blind|coverage|check-blindness/;
// The platform itself (DB / storage / systems / ingestion / integrations) — overrides domain.
const INFRASTRUCTURE_ID = /infra:|database|storage|telemetry|ingestion|integration|module-health|module-data|data-freshness|automation-fail/;
// People / capacity concerns within the team domain or by id.
const PEOPLE_ID = /hiring|capacity|onboarding|payroll|commission|leave|shift|training|workload|role-integrity|employment|candidate/;

const DOMAIN_GROUP: Record<AdvisorDomain, RadarFindingGroup> = {
  systems: "infrastructure",
  development: "infrastructure",
  team: "people",
  compliance: "compliance",
  delivery: "delivery",
  operations: "delivery",
  sales: "commercial",
  marketing: "commercial",
  finance: "commercial",
  company: "commercial",
  clients: "commercial",
  inbox: "commercial",
};

/**
 * Classify a finding (issue or incident) into its top-level problem bucket.
 * Reliability and Infrastructure are cross-domain overrides applied first (a
 * blind spot or a DB outage is that kind of problem wherever it surfaces); then
 * the domain default, with team/People and compliance id fallbacks.
 */
export function radarFindingGroup(input: { domain: AdvisorDomain; id: string }): RadarFindingGroup {
  const id = input.id.toLowerCase();
  if (RELIABILITY_ID.test(id)) return "reliability";
  if (INFRASTRUCTURE_ID.test(id)) return "infrastructure";
  if (input.domain === "compliance" || /\blegal\b|tax|insurance|contract|audit|compliance/.test(id)) return "compliance";
  if (input.domain === "team" || PEOPLE_ID.test(id)) return "people";
  return DOMAIN_GROUP[input.domain];
}
