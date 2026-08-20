import type { RadarEvidenceSeriesSummary } from "@/lib/radar/businessRadar";
import type { CustomKpiDefinition, CustomKpiOp, KpiTargetOverride, KpiTargetsConfig } from "@/server/types";
import type {
  CommandIntelligenceSnapshot,
  CommandKpi,
  CommandKpiFormat,
  CommandKpiPlanningCadence,
  CommandKpiPoint,
  CommandKpiStatus,
  CommandKpiTargetDirection,
  CommercialFormulaMetric,
  CommercialMetricUnit,
} from "@/lib/intelligence/commandIntelligence";

/**
 * KPI Registry — the backbone of the KPI-intelligence overhaul.
 *
 * Today every metric is computed in its own place with its formula as a display
 * string; there is no single list a UI can *search* or *plot*. The registry
 * introduces one uniform shape — the {@link KpiDescriptor} — so the KPI Explorer
 * can search, select, overlay and plot any metric the same way.
 *
 * This module is **client-safe** (pure, no `server-only` imports): it projects
 * an already-built {@link CommandIntelligenceSnapshot} into descriptors. It
 * **wraps existing computations, it never recomputes** — every number, series,
 * target and formula string is lifted verbatim from the built snapshot, so the
 * explorer can only ever show what the Command Centre already computed. The
 * server twin (`lib/server/kpiRegistry.ts`) is the seam that builds the snapshot
 * and, later, backs richer series straight from the evidence vault.
 *
 * Phase 1 registers the **20 command KPIs** (`kind: "command"`). Phases 3/5/6
 * add the 40 commercial formulas, the radar evidence series and custom KPIs —
 * each just becomes another descriptor, and the explorer keeps working unchanged.
 */

/** A single plottable point in a KPI's time-series (`at` = epoch ms). */
export type KpiSeriesPoint = CommandKpiPoint;

/** Which family a descriptor was registered from. */
export type KpiKind = "command" | "commercial" | "evidence" | "custom";

/**
 * A searchable, plottable description of one metric.
 *
 * The identity/plan fields (`category`…`baseline`) describe the metric; the
 * "current reading" fields (`value`…`measuredAt`) carry the latest snapshot
 * value so the explorer can list and link a KPI without reaching back into the
 * snapshot by id; `series` is the plottable history. All are projections of a
 * built {@link CommandKpi} — no field is fabricated or independently derived.
 */
export interface KpiDescriptor {
  id: string;
  label: string;
  shortLabel: string;
  /** The metric's own grouping label — a Radar domain for command/evidence, a
   *  commercial category (outcome/driver/efficiency/quality) for formulas. */
  category: string;
  kind: KpiKind;
  /** number | percent | currency | duration | score — drives axis + value formatting. */
  format: CommandKpiFormat;
  /** Human unit for an absolute-value axis (e.g. "percent of target", "pageviews"). */
  unit: string;
  /** The verbatim formula string, for inspect/display (already exists on the metric). */
  formulaText: string;
  /** Which state/builder feeds it (the metric's `sourceId`). */
  source: string;
  /** What the metric is computed over (e.g. "retained CRM leads"). */
  basis: string;
  /** The natural measurement period (e.g. "rolling 30 days"). */
  window: string;
  /** Which way is good — `higher` or `lower`. Drives the on-track maths later. */
  direction: CommandKpiTargetDirection;
  /** Resolved plan target; `null` until one is connected. (Part C makes this editable.) */
  target: number | null;
  /** Resolved plan baseline; `null` until there is enough evidence. */
  baseline: number | null;
  /** Planning cadence (daily/weekly/monthly/…) — drives the plan/assumptions view. */
  cadence: CommandKpiPlanningCadence;
  /** The plan-authority text — who set the target/baseline (or why none is set). */
  planSource: string;

  // ── current reading (latest snapshot value; lets the explorer render a row) ──
  value: number | null;
  display: string;
  status: CommandKpiStatus;
  href: string;
  detail: string;
  measuredAt: number;

  /**
   * The plottable time-series, newest-last. In Phase 1 this is the metric's
   * retained `history` (hydrated from the radar evidence vault, capped at the
   * last 24 points). Longer explorer ranges therefore show only the points that
   * actually exist — never a fabricated tail. A fuller vault-backed series is
   * the server twin's job in a later phase.
   */
  series: KpiSeriesPoint[];
}

/**
 * Project one already-built {@link CommandKpi} into a registry descriptor.
 * Pure and total — no recompute, no I/O.
 */
export function describeCommandKpi(kpi: CommandKpi): KpiDescriptor {
  return {
    id: kpi.id,
    label: kpi.label,
    shortLabel: kpi.shortLabel,
    category: kpi.domain,
    kind: "command",
    format: kpi.format,
    unit: kpi.measurement.unit,
    formulaText: kpi.measurement.formula,
    source: kpi.sourceId,
    basis: kpi.measurement.basis,
    window: kpi.measurement.window,
    direction: kpi.plan.direction,
    target: kpi.plan.targetValue,
    baseline: kpi.plan.baselineValue,
    cadence: kpi.plan.cadence,
    planSource: kpi.plan.source,
    value: kpi.value,
    display: kpi.display,
    status: kpi.status,
    href: kpi.href,
    detail: kpi.detail,
    measuredAt: kpi.measuredAt,
    series: kpi.history.map(point => ({ at: point.at, value: point.value })),
  };
}

/**
 * Register every command KPI on a built snapshot as a descriptor, preserving
 * the snapshot's rank order. This is the Phase 1 registry.
 */
export function describeCommandKpis(snapshot: CommandIntelligenceSnapshot): KpiDescriptor[] {
  return snapshot.kpis.map(describeCommandKpi);
}

/** How each commercial-formula unit renders on a value axis. */
const COMMERCIAL_UNIT_FORMAT: Record<CommercialMetricUnit, CommandKpiFormat> = {
  count: "number",
  percent: "percent",
  currency: "currency",
  duration: "duration",
  ratio: "number",
};

/**
 * Project one commercial formula metric into a registry descriptor
 * (`kind: "commercial"`). Commercial formulas are computed point-in-time — they
 * carry no retained trend — so the series is the single current value (or empty
 * when the metric is still "Learning"); it plots as one honest point, never a
 * fabricated line. They also declare no numeric target/direction here, so
 * `target`/`baseline` stay `null` until Phase 4 makes targets editable.
 */
export function describeCommercialFormula(metric: CommercialFormulaMetric, measuredAt: number): KpiDescriptor {
  return {
    id: metric.id,
    label: metric.label,
    shortLabel: metric.label,
    category: metric.category,
    kind: "commercial",
    format: COMMERCIAL_UNIT_FORMAT[metric.unit],
    unit: metric.unit,
    formulaText: metric.formula,
    source: metric.source,
    basis: metric.detail,
    window: "current snapshot",
    direction: "higher",
    target: null,
    baseline: null,
    cadence: "rolling",
    planSource: "No approved planning target is connected",
    value: metric.value,
    display: metric.display,
    status: metric.status,
    href: metric.href,
    detail: metric.detail,
    measuredAt,
    series: metric.value === null ? [] : [{ at: measuredAt, value: metric.value }],
  };
}

/** Register every commercial formula on a built snapshot as a descriptor. */
export function describeCommercialFormulas(snapshot: CommandIntelligenceSnapshot): KpiDescriptor[] {
  return snapshot.commercialIntelligence.formulas.map(metric => describeCommercialFormula(metric, snapshot.commercialIntelligence.generatedAt));
}

// ── Phase 4: server-persisted, layered, versioned KPI targets ──────────────

/**
 * Resolve the effective target/baseline override for one KPI, layering the
 * agency-wide config then a per-company override (most specific wins) — the same
 * shape the radar policy resolver uses. Returns `undefined` when nothing is set,
 * so the descriptor's own plan value stays authoritative. Pure.
 */
export function resolveKpiTarget(config: KpiTargetsConfig | undefined, kpiId: string, companyId?: string): KpiTargetOverride | undefined {
  if (!config) return undefined;
  const agencyLevel = config.byKpi?.[kpiId];
  const companyLevel = companyId ? config.byCompany?.[companyId]?.[kpiId] : undefined;
  if (!agencyLevel && !companyLevel) return undefined;
  return { ...agencyLevel, ...companyLevel };
}

/**
 * Set a KPI's target/baseline in a targets config, stamping `effectiveFrom` and
 * pushing the prior values into `history` so a raised target stays comparable on
 * the trend line ("target raised here"). Pure — the server store wraps this with
 * persistence. A `patch` field left `undefined` keeps the prior value; `null`
 * explicitly clears that target/baseline.
 */
export function applyKpiTargetOverride(
  config: KpiTargetsConfig | undefined,
  kpiId: string,
  patch: { baselineValue?: number | null; targetValue?: number | null },
  opts: { companyId?: string; actorUserId?: string; now: number },
): KpiTargetsConfig {
  const base: KpiTargetsConfig = config ? { ...config } : { byKpi: {}, updatedAt: opts.now };
  const level: Record<string, KpiTargetOverride> = opts.companyId
    ? { ...(base.byCompany?.[opts.companyId] ?? {}) }
    : { ...base.byKpi };
  const prior = level[kpiId];
  const history = prior?.effectiveFrom !== undefined
    ? [...(prior.history ?? []), { baselineValue: prior.baselineValue, targetValue: prior.targetValue, effectiveFrom: prior.effectiveFrom }]
    : (prior?.history ?? []);
  level[kpiId] = {
    ...prior,
    baselineValue: patch.baselineValue !== undefined ? patch.baselineValue : prior?.baselineValue,
    targetValue: patch.targetValue !== undefined ? patch.targetValue : prior?.targetValue,
    effectiveFrom: opts.now,
    updatedAt: opts.now,
    updatedBy: opts.actorUserId,
    history,
  };
  return opts.companyId
    ? { ...base, byCompany: { ...(base.byCompany ?? {}), [opts.companyId]: level }, updatedAt: opts.now }
    : { ...base, byKpi: level, updatedAt: opts.now };
}

/** Remove a KPI's override at the agency or (with companyId) company level. Pure. */
export function clearKpiTargetOverride(config: KpiTargetsConfig | undefined, kpiId: string, opts: { companyId?: string; now: number }): KpiTargetsConfig {
  const base: KpiTargetsConfig = config ? { ...config } : { byKpi: {}, updatedAt: opts.now };
  if (opts.companyId) {
    const level = { ...(base.byCompany?.[opts.companyId] ?? {}) };
    delete level[kpiId];
    return { ...base, byCompany: { ...(base.byCompany ?? {}), [opts.companyId]: level }, updatedAt: opts.now };
  }
  const level = { ...base.byKpi };
  delete level[kpiId];
  return { ...base, byKpi: level, updatedAt: opts.now };
}

// ── Phase 5 (part A): suggested targets from a metric's own history ─────────

/** A suggested target derived from a KPI's trailing history — a human accepts it. */
export interface KpiTargetSuggestion {
  baseline: number;
  target: number;
  changePercent: number;
  basis: string;
  sampleSize: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function roundSuggestion(value: number): number {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
}

/**
 * Suggest a target from a KPI's own trailing history — a **rolling median
 * baseline** nudged by a growth band in the metric's favoured direction
 * (`higher` → +band, `lower` → −band). This is a *guess a human accepts*
 * (guess-then-confirm), never auto-applied, and it evolves as the baseline moves
 * (evolving baseline, not a fixed threshold). Returns `null` when there is too
 * little history to suggest honestly (fewer than 3 finite points → "Learning").
 */
export function suggestKpiTarget(descriptor: Pick<KpiDescriptor, "series" | "direction">, growthPercent = 10): KpiTargetSuggestion | null {
  const values = descriptor.series.map(point => point.value).filter(value => Number.isFinite(value));
  if (values.length < 3) return null;
  const baseline = median(values);
  const changePercent = descriptor.direction === "lower" ? -growthPercent : growthPercent;
  return {
    baseline: roundSuggestion(baseline),
    target: roundSuggestion(baseline * (1 + changePercent / 100)),
    changePercent,
    basis: `${growthPercent}% ${descriptor.direction === "lower" ? "below" : "above"} the trailing median of ${values.length} retained points`,
    sampleSize: values.length,
  };
}

// ── Phase 6: guided custom KPIs ─────────────────────────────────────────────

const CUSTOM_OP_SYMBOL: Record<CustomKpiOp, string> = { ratio: "÷", rate: "÷", sum: "+", diff: "−" };

function combineOp(numerator: number, denominator: number, op: CustomKpiOp): number | null {
  switch (op) {
    case "ratio": return denominator === 0 ? null : numerator / denominator;
    case "rate": return denominator === 0 ? null : numerator / denominator * 100;
    case "sum": return numerator + denominator;
    case "diff": return numerator - denominator;
  }
}

function formatCustomValue(value: number, format: CommandKpiFormat): string {
  if (format === "percent") return `${Math.round(value * 10) / 10}%`;
  return (Math.round(value * 100) / 100).toLocaleString();
}

/**
 * Compute a guided custom KPI from base descriptors — combine the numerator with
 * the denominator via the op, yielding a current value plus a trend from the
 * points whose timestamps match in both series. Pure; returns `null` when an
 * operand is missing, and `ratio`/`rate` emit no point on a zero denominator
 * (never a fabricated number).
 */
export function computeCustomKpi(definition: CustomKpiDefinition, byId: Map<string, KpiDescriptor>): KpiDescriptor | null {
  const numerator = byId.get(definition.numeratorId);
  if (!numerator) return null;
  const denominator = definition.denominatorId ? byId.get(definition.denominatorId) : undefined;
  if (definition.denominatorId && !denominator) return null;

  const denByAt = new Map((denominator?.series ?? []).map(point => [point.at, point.value] as const));
  const series: KpiSeriesPoint[] = [];
  for (const point of numerator.series) {
    const other = denominator ? denByAt.get(point.at) : 0;
    if (other === undefined) continue;
    const value = combineOp(point.value, other, definition.op);
    if (value !== null) series.push({ at: point.at, value });
  }

  const numValue = numerator.value;
  const denValue = denominator ? denominator.value : 0;
  const currentValue = numValue === null || denValue === null ? null : combineOp(numValue, denValue, definition.op);

  const format: CommandKpiFormat = definition.op === "rate" ? "percent" : "number";
  const combinator = denominator ? ` ${CUSTOM_OP_SYMBOL[definition.op]} ${denominator.shortLabel}` : "";
  return {
    id: `custom:${definition.id}`,
    label: definition.label,
    shortLabel: definition.label,
    category: definition.category || "custom",
    kind: "custom",
    format,
    unit: definition.op === "rate" ? "percent" : definition.op === "ratio" ? "ratio" : "value",
    formulaText: `${numerator.shortLabel}${combinator}`,
    source: "custom",
    basis: `Custom KPI · ${definition.op}`,
    window: "derived from registry series",
    direction: definition.direction ?? "higher",
    target: null,
    baseline: null,
    cadence: "rolling",
    planSource: "Custom KPI",
    value: currentValue,
    display: currentValue === null ? "—" : formatCustomValue(currentValue, format),
    status: currentValue === null ? "learning" : "healthy",
    href: "/portal/agency?station=executive",
    detail: `Custom KPI: ${numerator.label}${denominator ? ` ${definition.op} ${denominator.label}` : ""}.`,
    measuredAt: numerator.measuredAt,
    series,
  };
}

/** Compute every custom KPI definition against a base descriptor set (dropping any whose operands are missing). */
export function describeCustomKpis(definitions: CustomKpiDefinition[], base: KpiDescriptor[]): KpiDescriptor[] {
  const byId = new Map(base.map(descriptor => [descriptor.id, descriptor]));
  return definitions.map(definition => computeCustomKpi(definition, byId)).filter((descriptor): descriptor is KpiDescriptor => descriptor !== null);
}

/** Map a radar-evidence point status onto the shared KPI status vocabulary. */
function evidenceStatus(status: string | undefined): CommandKpiStatus {
  if (status === "pass") return "healthy";
  if (status === "critical") return "critical";
  if (status === "warning" || status === "watch") return "warning";
  if (status === "blind") return "blind";
  return "learning";
}

/**
 * Project one retained radar-evidence series into a registry descriptor
 * (`kind: "evidence"`). Unlike command/commercial metrics these are the raw
 * durable time-series behind the Radar — they carry real `recentPoints`, so
 * they plot a genuine trend. They declare no target (that is the interpreted
 * KPI's job), so `target`/`baseline` stay `null`. The id is namespaced
 * (`evidence:…`) so it never collides with a command or commercial metric.
 */
export function describeEvidenceSeries(summary: RadarEvidenceSeriesSummary): KpiDescriptor {
  return {
    id: `evidence:${summary.id}`,
    label: summary.familyLabel || summary.familyId,
    shortLabel: summary.familyLabel || summary.familyId,
    category: summary.domain,
    kind: "evidence",
    format: "number",
    unit: "recorded value",
    formulaText: `Raw radar evidence · ${summary.totalSamples.toLocaleString()} samples across ${summary.retainedPointCount} retained points`,
    source: summary.sourceId,
    basis: `Radar ${summary.domain} evidence`,
    window: "retained radar history",
    direction: summary.expectedDirection === "lower" ? "lower" : "higher",
    target: null,
    baseline: summary.rollingBaseline ?? null,
    cadence: "rolling",
    planSource: "Radar evidence vault",
    value: summary.latestValue ?? null,
    display: summary.latestValue === undefined ? "—" : summary.latestValue.toLocaleString(),
    status: evidenceStatus(summary.latestStatus),
    href: "/portal/agency?station=executive",
    detail: `Raw radar evidence series for ${summary.familyLabel || summary.familyId} in the ${summary.domain} domain.`,
    measuredAt: summary.lastSeenAt,
    series: summary.recentPoints.map(point => ({ at: point.at, value: point.value })),
  };
}

/**
 * Free-text search across a descriptor set — matches label, short label,
 * category, id or unit. An empty query returns the set unchanged. Pure.
 */
export function searchKpiDescriptors(descriptors: KpiDescriptor[], query: string): KpiDescriptor[] {
  const q = query.trim().toLowerCase();
  if (!q) return descriptors;
  return descriptors.filter(descriptor =>
    descriptor.label.toLowerCase().includes(q) ||
    descriptor.shortLabel.toLowerCase().includes(q) ||
    descriptor.category.toLowerCase().includes(q) ||
    descriptor.id.toLowerCase().includes(q) ||
    descriptor.unit.toLowerCase().includes(q));
}

/** A descriptor set grouped under its category, categories in first-seen order. */
export interface KpiDescriptorGroup {
  category: string;
  descriptors: KpiDescriptor[];
}

/** Group descriptors by category for a sectioned search list. Order preserved. Pure. */
export function groupKpiDescriptorsByCategory(descriptors: KpiDescriptor[]): KpiDescriptorGroup[] {
  const groups: KpiDescriptorGroup[] = [];
  for (const descriptor of descriptors) {
    const existing = groups.find(group => group.category === descriptor.category);
    if (existing) existing.descriptors.push(descriptor);
    else groups.push({ category: descriptor.category, descriptors: [descriptor] });
  }
  return groups;
}
