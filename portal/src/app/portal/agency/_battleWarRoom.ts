// ─── Battle Table war room — the live decision model ──────────────────────────
//
// The Battle Table used to open on a form. This module is the model behind the
// war-room front door: it turns the SAME live payload the station already
// receives (per-scope actuals, retained company plans, hiring capacity signals
// and Radar incidents) into three deterministic, testable structures:
//
//   1. the battlefield  — one row per scope: health, target-vs-actual, alerts
//   2. the decisions     — the live queue of calls, each with its own evidence
//   3. the pulse         — key metrics vs target with deviation and forecast
//
// It is deliberately pure and free of React so the behaviour can be asserted in
// the smoke suite rather than grepped for in JSX. Nothing here invents a number:
// when the evidence is missing the state is `learning`, and when no target has
// been set the state is `no-target` — never a healthy pass.

import { buildHiringCapacityAnalysis, emptyHiringCapacitySignals, type HiringCapacityAnalysis, type HiringCapacitySignals } from "@/lib/hiringCapacity";
import type { CompanyProfile } from "@/server/types";

/** Where a scope (or a metric) stands against its own target. */
export type WarRoomTargetState = "ahead" | "on-track" | "behind" | "critical" | "no-target" | "learning";
export type WarRoomSeverity = "critical" | "warning" | "watch";
/** The planning section a decision drills into. Mirrors the Battle Table tabs. */
export type WarRoomDrillSection = "overview" | "intelligence" | "strategy" | "projections" | "objectives" | "capacity" | "plans" | "capital" | "reviews" | "systems";

export type WarRoomActuals = {
  monthRevenueCents: number;
  monthlyRevenueGrowthPercent: number | null;
  currency: string;
  financeConnected: boolean;
  activeClients: number;
  clientsNeedingAttention: number;
  leadCount: number;
  meetingsThisMonth: number;
  openTasks: number;
  overdueTasks: number;
};

export type WarRoomScopeInput = {
  id: string;
  companyId: string | null;
  label: string;
  kind: "aggregate" | "company";
  profile: CompanyProfile;
  actuals: WarRoomActuals;
  healthScore: number;
  productCount: number;
  legalCount: number;
  capacitySignals?: HiringCapacitySignals;
};

/** A Radar incident, reduced to what the war room needs to show and act on. */
export type WarRoomIncident = {
  id: string;
  severity: WarRoomSeverity;
  title: string;
  detail: string;
  evidence: string[];
  href: string;
};

export type WarRoomRevenuePosition = {
  state: WarRoomTargetState;
  /** Target pro-rated to the point reached in the month. Null without a target. */
  expectedCents: number | null;
  /** Percent above/below the pro-rated target. Null when there is no evidence. */
  deviationPercent: number | null;
  /** Percent of the full monthly target banked so far. Null without a target. */
  progressPercent: number | null;
  /** Month-end landing point at the current run rate. Null when unknowable. */
  forecastCents: number | null;
  gapCents: number;
};

export type WarRoomBattlefieldRow = {
  scopeId: string;
  companyId: string | null;
  label: string;
  kind: "aggregate" | "company";
  healthScore: number;
  healthState: "critical" | "warning" | "clear";
  currency: string;
  revenueCents: number;
  targetCents: number;
  revenue: WarRoomRevenuePosition;
  objectivesAtRisk: number;
  hireNowCount: number;
  capitalWatchCount: number;
  radarCriticalCount: number;
  /** Everything demanding attention on this row. */
  alertCount: number;
  /** The subset that cannot wait. */
  criticalAlertCount: number;
  evidence: string[];
};

export type WarRoomDecision = {
  id: string;
  kind: "radar-critical" | "revenue-gap" | "hire-now" | "objective-risk" | "capital-watch" | "doctrine-gap";
  severity: WarRoomSeverity;
  scopeId: string;
  scopeLabel: string;
  title: string;
  detail: string;
  evidence: string[];
  section: WarRoomDrillSection;
  actionLabel: string;
  href?: string;
};

export type WarRoomPulseMetric = {
  id: string;
  label: string;
  value: string;
  target: string;
  state: WarRoomTargetState;
  /** Signed deviation against the metric's own target. Null when unknowable. */
  deviationPercent: number | null;
  detail: string;
};

const HEALTH_BASELINE = 70;
const HEALTH_STRONG = 85;
const HEALTH_CRITICAL = 40;

/** How far through the current month `now` sits, as a 0–1 fraction. */
export function monthPaceFraction(now: number): number {
  const date = new Date(now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(1, Math.max(0, date.getDate() / daysInMonth));
}

/**
 * Where revenue stands against its monthly target *at this point in the month*.
 * Without finance evidence this is `learning`; without a target it is
 * `no-target`. Neither is ever reported as on-track.
 */
export function revenuePosition(input: { revenueCents: number; targetCents: number; paceFraction: number; financeConnected: boolean }): WarRoomRevenuePosition {
  const gapCents = Math.max(0, input.targetCents - input.revenueCents);
  if (!input.financeConnected) {
    return { state: "learning", expectedCents: null, deviationPercent: null, progressPercent: null, forecastCents: null, gapCents };
  }
  if (input.targetCents <= 0) {
    return { state: "no-target", expectedCents: null, deviationPercent: null, progressPercent: null, forecastCents: null, gapCents: 0 };
  }
  const pace = Math.min(1, Math.max(0, input.paceFraction));
  const expectedCents = Math.round(input.targetCents * pace);
  const deviationPercent = expectedCents > 0
    ? Math.round((input.revenueCents - expectedCents) / expectedCents * 100)
    : input.revenueCents > 0 ? 100 : 0;
  const progressPercent = Math.round(input.revenueCents / input.targetCents * 100);
  const forecastCents = pace > 0 ? Math.round(input.revenueCents / pace) : null;
  const state: WarRoomTargetState = deviationPercent >= 5 ? "ahead"
    : deviationPercent >= -10 ? "on-track"
    : deviationPercent >= -30 ? "behind"
    : "critical";
  return { state, expectedCents, deviationPercent, progressPercent, forecastCents, gapCents };
}

/** Capital records that need a human: unissued, unapproved, stale or overdue. */
export function capitalWatchCount(profile: CompanyProfile, now: number): number {
  const capital = profile.capital;
  const active = capital.shareholders.filter(item => item.status === "active");
  const issuedByClass = new Map<string, number>();
  active.forEach(item => issuedByClass.set(item.shareClassId, (issuedByClass.get(item.shareClassId) ?? 0) + item.shares));
  const overIssued = capital.shareClasses.filter(item => (issuedByClass.get(item.id) ?? 0) > item.authorisedShares).length;
  const overdueDividends = capital.dividends.filter(item => item.status !== "cancelled" && item.paymentDueAt && item.paymentDueAt < now && item.paidCents < item.declaredCents).length;
  const staleInvestments = capital.investments.filter(item => item.status === "active" && (!item.valuedAt || now - item.valuedAt > 90 * 86_400_000)).length;
  const unapproved = capital.transactions.filter(item => (item.status === "approved" || item.status === "completed") && !item.approvalId).length
    + capital.dividends.filter(item => item.status !== "draft" && item.status !== "cancelled" && !item.approvalId).length;
  const draftDecisions = capital.decisions.filter(item => item.status === "draft").length;
  return Number(!active.length) + overIssued + overdueDividends + staleInvestments + unapproved + draftDecisions;
}

/** The hiring/capacity read for one scope, from the live signals it carries. */
export function scopeHiringAnalysis(scope: WarRoomScopeInput): HiringCapacityAnalysis {
  return buildHiringCapacityAnalysis({
    capacity: scope.profile.capacity,
    actuals: {
      monthlyRevenueTargetCents: scope.profile.monthlyRevenueTargetCents,
      monthRevenueCents: scope.actuals.monthRevenueCents,
      averageDealValueCents: scope.profile.averageDealValueCents,
      salesCallCloseRatePercent: scope.profile.salesCallCloseRatePercent,
      activeClients: scope.actuals.activeClients,
      clientsNeedingAttention: scope.actuals.clientsNeedingAttention,
      leadCount: scope.actuals.leadCount,
      meetingsThisMonth: scope.actuals.meetingsThisMonth,
      productCount: scope.productCount,
      legalCount: scope.legalCount,
      financeConnected: scope.actuals.financeConnected,
    },
    signals: scope.capacitySignals ?? emptyHiringCapacitySignals(),
  });
}

/**
 * Zone 1 — the battlefield. One row per scope (ecosystem first, then each
 * trading company) carrying health, target-vs-actual and its alert load.
 * Radar incidents are ecosystem-wide evidence, so they are attributed to the
 * aggregate row rather than split across brands they were never scoped to.
 */
export function buildBattlefield(input: { scopes: WarRoomScopeInput[]; incidents?: WarRoomIncident[]; now: number }): WarRoomBattlefieldRow[] {
  const pace = monthPaceFraction(input.now);
  const radarCritical = (input.incidents ?? []).filter(incident => incident.severity === "critical").length;
  return input.scopes.map(scope => {
    const targetCents = scope.profile.monthlyRevenueTargetCents;
    const revenue = revenuePosition({
      revenueCents: scope.actuals.monthRevenueCents,
      targetCents,
      paceFraction: pace,
      financeConnected: scope.actuals.financeConnected,
    });
    const hiring = scopeHiringAnalysis(scope);
    const objectivesAtRisk = scope.profile.objectives.filter(item => item.status === "at-risk").length;
    const capitalWatch = capitalWatchCount(scope.profile, input.now);
    const scopeRadarCritical = scope.kind === "aggregate" ? radarCritical : 0;
    const criticalAlertCount = Number(revenue.state === "critical") + hiring.hireNowCount + scopeRadarCritical;
    const alertCount = criticalAlertCount
      + Number(revenue.state === "behind")
      + objectivesAtRisk
      + hiring.prepareCount
      + Number(capitalWatch > 0);
    const evidence: string[] = [];
    if (revenue.state === "learning") evidence.push("Finance evidence is not connected for this scope yet.");
    else if (revenue.state === "no-target") evidence.push("No monthly revenue target has been set for this scope.");
    else evidence.push(`${revenue.progressPercent}% of the monthly target banked with ${Math.round(pace * 100)}% of the month elapsed.`);
    if (hiring.hireNowCount) evidence.push(`${hiring.hireNowCount} capacity area${hiring.hireNowCount === 1 ? "" : "s"} past its hiring guardrail.`);
    if (objectivesAtRisk) evidence.push(`${objectivesAtRisk} objective${objectivesAtRisk === 1 ? "" : "s"} flagged at risk.`);
    if (scopeRadarCritical) evidence.push(`${scopeRadarCritical} critical Radar incident${scopeRadarCritical === 1 ? "" : "s"} open.`);
    if (capitalWatch) evidence.push(`${capitalWatch} capital or ownership record${capitalWatch === 1 ? "" : "s"} needs a decision.`);
    return {
      scopeId: scope.id,
      companyId: scope.companyId,
      label: scope.label,
      kind: scope.kind,
      healthScore: scope.healthScore,
      healthState: scope.healthScore < HEALTH_CRITICAL ? "critical" : scope.healthScore < HEALTH_BASELINE ? "warning" : "clear",
      currency: scope.actuals.currency,
      revenueCents: scope.actuals.monthRevenueCents,
      targetCents,
      revenue,
      objectivesAtRisk,
      hireNowCount: hiring.hireNowCount,
      capitalWatchCount: capitalWatch,
      radarCriticalCount: scopeRadarCritical,
      alertCount,
      criticalAlertCount,
      evidence,
    };
  });
}

const SEVERITY_RANK: Record<WarRoomSeverity, number> = { critical: 0, warning: 1, watch: 2 };
const KIND_RANK: Record<WarRoomDecision["kind"], number> = {
  "radar-critical": 0,
  "revenue-gap": 1,
  "hire-now": 2,
  "objective-risk": 3,
  "capital-watch": 4,
  "doctrine-gap": 5,
};

/**
 * Zone 2 — the decisions queue. Every call Ed has to make, each carrying its
 * own evidence and the section it is settled in. Ordering is deterministic:
 * severity, then kind, then the order the scopes were supplied in.
 */
export function buildWarRoomDecisions(input: { scopes: WarRoomScopeInput[]; incidents?: WarRoomIncident[]; now: number; limit?: number }): WarRoomDecision[] {
  const pace = monthPaceFraction(input.now);
  const decisions: Array<WarRoomDecision & { scopeIndex: number }> = [];

  (input.incidents ?? []).filter(incident => incident.severity === "critical").forEach(incident => {
    decisions.push({
      id: `radar:${incident.id}`,
      kind: "radar-critical",
      severity: "critical",
      scopeId: "ecosystem",
      scopeLabel: "Whole ecosystem",
      title: incident.title,
      detail: incident.detail,
      evidence: incident.evidence.slice(0, 4),
      section: "overview",
      actionLabel: "Open in Radar",
      href: incident.href,
      scopeIndex: -1,
    });
  });

  input.scopes.forEach((scope, scopeIndex) => {
    const currency = scope.actuals.currency;
    const revenue = revenuePosition({
      revenueCents: scope.actuals.monthRevenueCents,
      targetCents: scope.profile.monthlyRevenueTargetCents,
      paceFraction: pace,
      financeConnected: scope.actuals.financeConnected,
    });
    if (revenue.state === "critical" || revenue.state === "behind") {
      const dealsNeeded = revenue.gapCents > 0 ? Math.ceil(revenue.gapCents / Math.max(1, scope.profile.averageDealValueCents)) : 0;
      const callsNeeded = dealsNeeded > 0 ? Math.ceil(dealsNeeded / Math.max(0.01, scope.profile.salesCallCloseRatePercent / 100)) : 0;
      decisions.push({
        id: `revenue:${scope.id}`,
        kind: "revenue-gap",
        severity: revenue.state === "critical" ? "critical" : "warning",
        scopeId: scope.id,
        scopeLabel: scope.label,
        title: `${scope.label} is ${Math.abs(revenue.deviationPercent ?? 0)}% behind its revenue pace`,
        detail: `${money(scope.actuals.monthRevenueCents, currency)} banked against ${money(revenue.expectedCents ?? 0, currency)} expected by this point in the month.`,
        evidence: [
          `Monthly target ${money(scope.profile.monthlyRevenueTargetCents, currency)}; ${money(revenue.gapCents, currency)} still to find.`,
          revenue.forecastCents === null ? "Run rate cannot be projected yet." : `At the current run rate the month lands at ${money(revenue.forecastCents, currency)}.`,
          callsNeeded ? `${dealsNeeded} deal${dealsNeeded === 1 ? "" : "s"} or about ${callsNeeded} sales call${callsNeeded === 1 ? "" : "s"} closes the gap.` : "The gap is inside one average deal.",
        ],
        section: "projections",
        actionLabel: "Open projections",
        scopeIndex,
      });
    }

    const hiring = scopeHiringAnalysis(scope);
    hiring.ranked.filter(area => area.state === "hire-now").slice(0, 2).forEach(area => {
      decisions.push({
        id: `hire:${scope.id}:${area.id}`,
        kind: "hire-now",
        severity: "critical",
        scopeId: scope.id,
        scopeLabel: scope.label,
        title: `${area.label} needs capacity now`,
        detail: `${area.label} is running at ${area.utilisationPercent}% against a ${area.targetUtilisationPercent}% guardrail — a ${area.gapHours}h weekly gap.`,
        evidence: area.evidence.slice(0, 4),
        section: "capacity",
        actionLabel: "Open capacity",
        scopeIndex,
      });
    });

    const atRisk = scope.profile.objectives.filter(item => item.status === "at-risk");
    if (atRisk.length) {
      decisions.push({
        id: `objectives:${scope.id}`,
        kind: "objective-risk",
        severity: "warning",
        scopeId: scope.id,
        scopeLabel: scope.label,
        title: `${atRisk.length} objective${atRisk.length === 1 ? " is" : "s are"} at risk in ${scope.label}`,
        detail: "Flagged objectives need a decision: re-plan, re-resource or stand them down.",
        evidence: atRisk.slice(0, 3).map(item => `${item.title} — ${item.currentValue}${item.unit} of ${item.targetValue}${item.unit}`),
        section: "objectives",
        actionLabel: "Open objectives",
        scopeIndex,
      });
    }

    const capitalWatch = capitalWatchCount(scope.profile, input.now);
    if (capitalWatch) {
      decisions.push({
        id: `capital:${scope.id}`,
        kind: "capital-watch",
        severity: "warning",
        scopeId: scope.id,
        scopeLabel: scope.label,
        title: `${capitalWatch} capital record${capitalWatch === 1 ? "" : "s"} awaiting a decision in ${scope.label}`,
        detail: "Ownership, investment or distribution records are unapproved, stale or overdue.",
        evidence: [`${capitalWatch} capital or ownership exception in the register.`],
        section: "capital",
        actionLabel: "Open capital",
        scopeIndex,
      });
    }

    if (!scope.profile.mission.trim() || !scope.profile.vision.trim()) {
      decisions.push({
        id: `doctrine:${scope.id}`,
        kind: "doctrine-gap",
        severity: "watch",
        scopeId: scope.id,
        scopeLabel: scope.label,
        title: `${scope.label} has no recorded direction`,
        detail: "Without a mission and a future position there is nothing to reject an opportunity against.",
        evidence: [
          scope.profile.mission.trim() ? "Mission recorded." : "No mission recorded.",
          scope.profile.vision.trim() ? "Future position recorded." : "No future position recorded.",
        ],
        section: "strategy",
        actionLabel: "Set direction",
        scopeIndex,
      });
    }
  });

  const ordered = decisions
    .sort((left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
      || KIND_RANK[left.kind] - KIND_RANK[right.kind]
      || left.scopeIndex - right.scopeIndex
      || left.id.localeCompare(right.id))
    .map(({ scopeIndex: _scopeIndex, ...decision }) => decision);
  return typeof input.limit === "number" ? ordered.slice(0, Math.max(0, input.limit)) : ordered;
}

/**
 * Zone 3 — the live pulse for the scope in view. Five readings against their
 * own targets, each with the deviation that decides the tone. Anything without
 * evidence stays `learning` and anything without a target stays `no-target`.
 */
export function buildWarRoomPulse(input: { scope: WarRoomScopeInput; now: number }): WarRoomPulseMetric[] {
  const scope = input.scope;
  const currency = scope.actuals.currency;
  const pace = monthPaceFraction(input.now);
  const revenue = revenuePosition({
    revenueCents: scope.actuals.monthRevenueCents,
    targetCents: scope.profile.monthlyRevenueTargetCents,
    paceFraction: pace,
    financeConnected: scope.actuals.financeConnected,
  });

  const growthTarget = scope.profile.projection.targetMonthlyGrowthPercent;
  const growthActual = scope.actuals.monthlyRevenueGrowthPercent;
  const growth: WarRoomPulseMetric = growthActual === null
    ? { id: "growth", label: "Monthly growth", value: "—", target: `${signed(growthTarget)}% target`, state: "learning", deviationPercent: null, detail: "Not enough month-on-month revenue history yet." }
    : {
      id: "growth",
      label: "Monthly growth",
      value: `${signed(Math.round(growthActual))}%`,
      target: `${signed(growthTarget)}% target`,
      state: growthTarget === 0 ? "no-target"
        : growthActual >= growthTarget ? "ahead"
        : growthActual >= growthTarget * 0.6 ? "on-track"
        : growthActual >= 0 ? "behind"
        : "critical",
      deviationPercent: Math.round(growthActual - growthTarget),
      detail: `Against a ${signed(growthTarget)}% target-case assumption.`,
    };

  const gapDeals = revenue.gapCents > 0 ? Math.ceil(revenue.gapCents / Math.max(1, scope.profile.averageDealValueCents)) : 0;
  const callsNeeded = gapDeals > 0 ? Math.ceil(gapDeals / Math.max(0.01, scope.profile.salesCallCloseRatePercent / 100)) : 0;
  const pipeline: WarRoomPulseMetric = {
    id: "pipeline",
    label: "Pipeline cover",
    value: `${scope.actuals.leadCount} open`,
    target: callsNeeded ? `${callsNeeded} needed` : "no gap to cover",
    state: !callsNeeded ? "on-track"
      : scope.actuals.leadCount >= callsNeeded ? "ahead"
      : scope.actuals.leadCount >= callsNeeded / 2 ? "behind"
      : "critical",
    deviationPercent: callsNeeded ? Math.round((scope.actuals.leadCount - callsNeeded) / callsNeeded * 100) : null,
    detail: callsNeeded
      ? `${callsNeeded} qualified conversations close the remaining gap at a ${scope.profile.salesCallCloseRatePercent}% close rate.`
      : "The monthly target is covered; pipeline is building next month.",
  };

  const hiring = scopeHiringAnalysis(scope);
  const utilisation = scope.profile.capacity.weeklyAvailableHours > 0
    ? Math.round(hiring.areas.reduce((sum, area) => sum + area.demandHours, 0) / scope.profile.capacity.weeklyAvailableHours * 100)
    : 0;
  const trigger = scope.profile.capacity.hiringTriggerPercent;
  const capacity: WarRoomPulseMetric = {
    id: "capacity",
    label: "Capacity load",
    value: `${utilisation}%`,
    target: `${trigger}% guardrail`,
    state: hiring.hireNowCount || utilisation >= trigger ? "critical"
      : utilisation >= trigger * 0.85 ? "behind"
      : utilisation <= 50 ? "ahead"
      : "on-track",
    deviationPercent: Math.round(utilisation - trigger),
    detail: hiring.hireNowCount
      ? `${hiring.hireNowCount} area${hiring.hireNowCount === 1 ? "" : "s"} past the guardrail · ${hiring.totalGapHours}h weekly gap.`
      : `${scope.profile.capacity.weeklyAvailableHours}h available each week across the operating areas.`,
  };

  const health: WarRoomPulseMetric = {
    id: "health",
    label: "Strategic health",
    value: `${scope.healthScore} pts`,
    target: `${HEALTH_BASELINE} pts baseline`,
    state: scope.healthScore < HEALTH_CRITICAL ? "critical"
      : scope.healthScore < HEALTH_BASELINE ? "behind"
      : scope.healthScore >= HEALTH_STRONG ? "ahead"
      : "on-track",
    deviationPercent: scope.healthScore - HEALTH_BASELINE,
    detail: `Weighted from revenue pace, client attention, pipeline and delivery load.`,
  };

  const revenueMetric: WarRoomPulseMetric = {
    id: "revenue",
    label: "Revenue vs target",
    value: revenue.state === "learning" ? "—" : money(scope.actuals.monthRevenueCents, currency),
    target: scope.profile.monthlyRevenueTargetCents > 0 ? `${money(scope.profile.monthlyRevenueTargetCents, currency)} target` : "no target set",
    state: revenue.state,
    deviationPercent: revenue.deviationPercent,
    detail: revenue.state === "learning"
      ? "Connect finance evidence to read revenue against target."
      : revenue.state === "no-target"
        ? "Set a monthly revenue target to read a position."
        : `Pace expects ${money(revenue.expectedCents ?? 0, currency)} by now; run rate lands at ${revenue.forecastCents === null ? "—" : money(revenue.forecastCents, currency)}.`,
  };

  return [revenueMetric, growth, pipeline, capacity, health];
}

/** Ecosystem-wide totals for the war-room header. */
export function summariseBattlefield(rows: WarRoomBattlefieldRow[]): { scopes: number; behind: number; critical: number; alerts: number; criticalAlerts: number } {
  return {
    scopes: rows.length,
    behind: rows.filter(row => row.revenue.state === "behind" || row.revenue.state === "critical").length,
    critical: rows.filter(row => row.revenue.state === "critical" || row.healthState === "critical").length,
    alerts: rows.reduce((sum, row) => sum + row.alertCount, 0),
    criticalAlerts: rows.reduce((sum, row) => sum + row.criticalAlertCount, 0),
  };
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}
