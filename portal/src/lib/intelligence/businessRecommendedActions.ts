import type { AdvisorActionCategory, AdvisorActionSuggestion } from "@/lib/advisor/advisorActions";
import { ADVISOR_CATEGORY_HREF } from "@/lib/advisor/advisorActions";
import type { AdvisorDomain, BusinessIssueRadar, BusinessIssueSeverity, RadarFindingGroup } from "@/engines/data/radar/businessRadar";
import { radarFindingGroup } from "@/engines/data/radar/radarClassification";
import { stepsFor } from "@/lib/inbox/evidenceSteps";
import type { ResolutionKind } from "@/lib/inbox/resolutionExplain";
import { resolutionKindOf } from "@/lib/inbox/resolutionExplain";
import type { OperationalAlert, OperationalAlertCategory } from "@/lib/intelligence/operationalAttention";

type RankedAction = AdvisorActionSuggestion & {
  domain: AdvisorDomain;
  score: number;
  group: RadarFindingGroup;
  /** The most specific underlying finding id, used to resolve kind/clearance/steps (Stage 7). */
  findingId: string;
  /** True when a concrete remediation exists, so a `judgement` default can widen to `off-system`. */
  restorable: boolean;
};

// Groups whose incidents have a concrete fix elsewhere — a judgement default widens to off-system.
const RESTORABLE_GROUPS: ReadonlySet<RadarFindingGroup> = new Set<RadarFindingGroup>(["infrastructure", "reliability", "compliance", "delivery"]);

/**
 * A deliberate resolution profile per radar finding-GROUP (Stage 7, family map).
 *
 * A rolled-up radar incident keys on its most specific finding id, but that id is
 * usually a raw metric/source id (`metric:speed-to-lead`, `core:clients`) that
 * matches no per-family entry in `CLEARS_WHEN` — so it would fall to the generic
 * `{kind: "judgement"}` default with no clearance and no steps. That is exactly
 * the "shrugs to judgement / go look" fluff the loop must not ship.
 *
 * Instead, when no specific family matched, the finding is resolved by its GROUP:
 * every one of the six groups carries a group-appropriate kind, a real clears-when
 * and concrete steps. Four groups have a doable fix (infra/reliability/compliance
 * are off-system, delivery is in-app); the two that are genuinely a business call
 * (commercial, people) stay `judgement` — but even they carry specific investigate
 * steps and a real clearance, never a bare "go look". The `Record` is exhaustive
 * by construction: adding a seventh `RadarFindingGroup` fails to compile until it
 * has a deliberate profile here, so a new family can never silently mis-default.
 */
type GroupResolutionProfile = {
  kind: ResolutionKind;
  /** What makes the finding go away — the honest clearance condition for the group. */
  clearsWhen: string;
  /** Concrete, group-appropriate steps; the first navigates to the destination. */
  steps: readonly string[];
};

export const RADAR_GROUP_RESOLUTION: Record<RadarFindingGroup, GroupResolutionProfile> = {
  infrastructure: {
    kind: "off-system",
    clearsWhen: "The affected system, database, storage, or integration is reconnected and Radar reads it as healthy again.",
    steps: [
      "Open the affected system or integration below.",
      "Reconnect or repair it — the fix happens in the provider, not inside Aqua.",
      "Confirm Radar can read fresh records once it is back.",
    ],
  },
  reliability: {
    kind: "off-system",
    clearsWhen: "The monitored service reports healthy, the error stops recurring, or the missing source is reconnected.",
    steps: [
      "Open the failing monitor, probe, or disconnected source below.",
      "Restore the service or reconnect the source off-screen.",
      "Confirm the check clears on the next sweep.",
    ],
  },
  compliance: {
    kind: "off-system",
    clearsWhen: "The document, licence, or obligation is renewed or actioned, and its status or expiry is updated here.",
    steps: [
      "Open the compliance record below.",
      "Renew it, complete the required action, or file the missing document.",
      "Update the record's status or expiry so the check clears.",
    ],
  },
  delivery: {
    kind: "in-app",
    clearsWhen: "The blocked, pending, or overdue item is unblocked, completed, or rescheduled.",
    steps: [
      "Open the client or delivery workspace below.",
      "Clear the blocker — unblock the milestone, answer the decision, or reschedule.",
      "Confirm the item leaves the blocked or overdue state.",
    ],
  },
  commercial: {
    kind: "judgement",
    clearsWhen: "The measure returns to its target range, or you decide the movement is acceptable and dismiss it.",
    steps: [
      "Open the commercial workspace below and read the trend against its evidence.",
      "Decide whether the movement is real and worth acting on, or noise to accept.",
      "Act on it off-screen, or dismiss it as an accepted business change.",
    ],
  },
  people: {
    kind: "judgement",
    clearsWhen: "The staffing gap, backlog, or capacity pressure is resolved, or you accept it as the current plan.",
    steps: [
      "Open the People workspace below and read the capacity or backlog evidence.",
      "Make the staffing or scheduling decision it calls for.",
      "Act on it, or accept it as the current plan and dismiss.",
    ],
  },
};

export function buildBusinessRecommendedActions({
  radar,
  alerts = [],
  existingTaskTitles = [],
  now = Date.now(),
  limit = 5,
}: {
  radar: BusinessIssueRadar;
  alerts?: OperationalAlert[];
  existingTaskTitles?: string[];
  now?: number;
  limit?: number;
}): AdvisorActionSuggestion[] {
  const base = startOfToday(now);
  const existing = new Set(existingTaskTitles.map(normalize));
  const candidates: RankedAction[] = [];

  for (const alert of alerts) {
    if (alert.severity === "notice") continue;
    const domain = domainForAlert(alert.category);
    candidates.push({
      id: `recommended-alert:${alert.id}`,
      title: alert.title,
      detail: actionDetail(alert.detail),
      evidence: `${alert.category} alert recorded ${relativeAge(alert.occurredAt, now)}. ${alert.detail}`.slice(0, 500),
      category: categoryForDomain(domain),
      priority: alert.severity === "critical" ? "urgent" : "high",
      confidence: "high",
      dueAt: dueAt(base, alert.severity === "critical" ? 0 : 1),
      href: alert.href,
      sourceAlertIds: [alert.id],
      domain,
      score: alert.severity === "critical" ? 1_250 : 900,
      findingId: alert.id,
      group: radarFindingGroup({ domain, id: alert.id }),
      restorable: false,
    });
  }

  for (const incident of radar.incidents) {
    const incidentGroup = incident.group ?? radarFindingGroup({ domain: incident.domain, id: incident.id });
    candidates.push({
      id: `recommended-radar:${incident.id}`,
      title: incident.title,
      detail: actionDetail(incident.detail),
      evidence: incident.evidence.join(" · ").slice(0, 500) || incident.detail.slice(0, 500),
      category: categoryForDomain(incident.domain),
      priority: incident.severity === "critical" ? "urgent" : incident.severity === "warning" ? "high" : "normal",
      confidence: incident.sourceIds.length || incident.evidence.length ? "high" : "medium",
      dueAt: dueAt(base, incident.severity === "critical" ? 0 : incident.severity === "warning" ? 1 : 3),
      href: incident.href,
      sourceAlertIds: [incident.id, ...incident.sourceIds].slice(0, 10),
      domain: incident.domain,
      score: incidentScore(incident.severity, incident.findingCount, incident.detectedAt, now),
      findingId: incident.sourceIds[0] ?? incident.issueIds[0] ?? incident.id,
      // `group` is a required part of the incident contract, but derive it as a
      // safety net if one ever arrives without it — this feeds the Actions /
      // Command render, and a missing group must not crash the page.
      group: incidentGroup,
      restorable: RESTORABLE_GROUPS.has(incidentGroup),
    });
  }

  for (const conclusion of radar.adaptive.conclusions) {
    if (conclusion.severity === "info") continue;
    candidates.push({
      id: `recommended-conclusion:${conclusion.id}`,
      title: conclusion.title,
      detail: actionDetail(conclusion.detail),
      evidence: `Adaptive Radar conclusion at ${radar.adaptive.confidencePercent}% confidence and ${radar.adaptive.readinessPercent}% setup. ${conclusion.detail}`.slice(0, 500),
      category: categoryForDomain(conclusion.domain),
      priority: conclusion.severity === "critical" ? "urgent" : conclusion.severity === "warning" ? "high" : "normal",
      confidence: radar.adaptive.confidencePercent >= 70 ? "high" : radar.adaptive.confidencePercent >= 40 ? "medium" : "low",
      dueAt: dueAt(base, conclusion.severity === "critical" ? 0 : conclusion.severity === "warning" ? 1 : 3),
      href: conclusion.href,
      sourceAlertIds: [conclusion.id],
      domain: conclusion.domain,
      score: severityScore(conclusion.severity) + 80,
      findingId: conclusion.id,
      group: radarFindingGroup({ domain: conclusion.domain, id: conclusion.id }),
      restorable: false, // a strategic conclusion is a genuine judgement call
    });
  }

  for (const source of radar.coverage) {
    if (source.status !== "disconnected" && source.status !== "unavailable") continue;
    candidates.push({
      id: `recommended-source:${source.id}`,
      title: `Restore ${source.label} visibility`,
      detail: `Reconnect or repair ${source.label}, then confirm Radar can read fresh records.`,
      evidence: `${source.status} source in ${source.domain}. ${source.detail}`.slice(0, 500),
      category: categoryForDomain(source.domain),
      priority: ["finance", "compliance", "sales", "inbox", "systems"].includes(source.domain) ? "high" : "normal",
      confidence: "high",
      dueAt: dueAt(base, 1),
      href: ADVISOR_CATEGORY_HREF[categoryForDomain(source.domain)],
      sourceAlertIds: [source.id],
      domain: source.domain,
      score: 660 + domainWeight(source.domain),
      findingId: `coverage:${source.id}`,
      group: "reliability", // a source visibility gap is an observability problem
      restorable: true, // reconnecting the source is a concrete off-system action
    });
  }

  for (const domain of [...radar.domains].sort((left, right) => left.readinessPercent - right.readinessPercent || right.blindChecks - left.blindChecks)) {
    if (domain.readinessPercent >= 100 && domain.blindChecks === 0) continue;
    candidates.push({
      id: `recommended-readiness:${domain.domain}`,
      title: `Complete ${domainLabel(domain.domain)} Radar readiness`,
      detail: `Resolve the largest evidence gaps so ${domainLabel(domain.domain)} decisions are based on observable data rather than assumptions.`,
      evidence: `${domain.readinessPercent}% setup · ${domain.confidencePercent}% confidence · ${domain.blindChecks} blind · ${domain.learningChecks} learning checks.`,
      category: categoryForDomain(domain.domain),
      priority: domain.blindChecks ? "high" : "normal",
      confidence: "high",
      dueAt: dueAt(base, domain.blindChecks ? 2 : 5),
      href: ADVISOR_CATEGORY_HREF[categoryForDomain(domain.domain)],
      sourceAlertIds: [`radar-readiness:${domain.domain}`],
      domain: domain.domain,
      score: 420 + domain.blindChecks * 4 + (100 - domain.readinessPercent) + domainWeight(domain.domain),
      findingId: `coverage:${domain.domain}-readiness`,
      group: "reliability", // closing a readiness/evidence gap is an observability action
      restorable: true,
    });
  }

  const sorted = candidates
    .filter(candidate => !existing.has(normalize(candidate.title)))
    .sort((left, right) => right.score - left.score || left.dueAt - right.dueAt || left.title.localeCompare(right.title));
  const selected: RankedAction[] = [];
  const seenTitles = new Set<string>();
  const seenSources = new Set<string>();
  const domainCounts = new Map<AdvisorDomain, number>();

  function add(candidate: RankedAction, enforceDomainLimit: boolean) {
    const title = normalize(candidate.title);
    if (!title || seenTitles.has(title) || candidate.sourceAlertIds.some(source => seenSources.has(source))) return;
    if (enforceDomainLimit && (domainCounts.get(candidate.domain) ?? 0) >= 2) return;
    selected.push(candidate);
    seenTitles.add(title);
    for (const source of candidate.sourceAlertIds) seenSources.add(source);
    domainCounts.set(candidate.domain, (domainCounts.get(candidate.domain) ?? 0) + 1);
  }

  for (const candidate of sorted) {
    add(candidate, true);
    if (selected.length >= limit) break;
  }
  for (const candidate of sorted) {
    if (selected.length >= limit) break;
    add(candidate, false);
  }

  return selected.slice(0, limit).map(ranked => {
    const { domain, score: _score, findingId, restorable, group, ...action } = ranked;
    return enrichAction(action, { findingId, group, restorable });
  });
}

/**
 * Attach the resolution model to a proposed action (radar upgrade Stage 7).
 * The finding's own kind + clearance (via `resolutionKindOf`) become the task's
 * control and expected outcome; `stepsFor` supplies concrete instruction steps
 * (so one finding can decompose into several tasks). A `judgement` default is
 * widened to `off-system` where a real remediation exists — but a genuine
 * judgement call keeps its kind and still carries steps, never a dead end.
 */
function enrichAction(
  action: AdvisorActionSuggestion,
  { findingId, group, restorable }: { findingId: string; group: RadarFindingGroup; restorable: boolean },
): AdvisorActionSuggestion {
  const { kind, expectedOutcome, steps } = resolveFindingAction({ findingId, group, restorable, href: action.href });
  return {
    ...action,
    kind,
    expectedOutcome,
    steps,
    suggestedOwner: ownerForGroup(group),
    group,
  };
}

/**
 * The resolution decision for one finding, exported so every finding-family can
 * be pinned directly (Stage 7 family map). Returns the kind, the honest clearance
 * and concrete steps for a finding, given its most specific id, its group and
 * whether a concrete remediation exists.
 *
 * A finding whose id matched a SPECIFIC resolution family keeps it — that match is
 * signalled by a clearance coming back from `resolutionKindOf`. Otherwise the id
 * fell to the bare judgement default, so it is resolved by its finding GROUP's
 * deliberate profile: a group-appropriate kind, a real clears-when and concrete
 * steps, so a rolled-up incident is resolved as what it is (an infra / reliability
 * / compliance fix, a delivery unblock, or a genuine commercial / people judgement
 * WITH steps) — never a generic "…is resolved" or a bare "go look".
 */
export function resolveFindingAction(input: {
  findingId: string;
  group: RadarFindingGroup;
  restorable: boolean;
  href: string;
}): { kind: ResolutionKind; expectedOutcome?: string; steps: { label: string; href?: string }[] } {
  const { findingId, group, restorable, href } = input;
  const resolution = resolutionKindOf({ id: findingId });
  if (resolution.clearsWhen) {
    return { kind: resolution.kind, expectedOutcome: resolution.clearsWhen, steps: stepsFor(findingId, { href }) };
  }
  const profile = RADAR_GROUP_RESOLUTION[group];
  // A finding the radar flagged as concretely restorable (a source to reconnect,
  // a readiness gap to close) has a doable fix even under a judgement-shaped
  // group, so widen it rather than leaving it a judgement call.
  const kind: ResolutionKind = profile.kind === "judgement" && restorable ? "off-system" : profile.kind;
  const steps = profile.steps.map((label, index) => (index === 0 ? { label, href } : { label }));
  return { kind, expectedOutcome: profile.clearsWhen, steps };
}

/**
 * Just the resolution KIND for a finding, given its id and problem group — for
 * surfaces that show a one-word kind badge (in-app / off-system / judgement)
 * without building a whole action. Same rule as `resolveFindingAction`: a
 * specific per-family match wins; otherwise the finding's GROUP decides, so a
 * rolled-up incident (whose id always misses the family table) reads as what its
 * group is — a fixable infra/reliability/compliance/delivery problem, not a blanket
 * "judgement call". Falls back to the id-only kind only when no group is known.
 */
export function resolveFindingKind(input: { id: string; group?: RadarFindingGroup }): ResolutionKind {
  const resolution = resolutionKindOf({ id: input.id });
  if (resolution.clearsWhen) return resolution.kind;
  if (input.group) return RADAR_GROUP_RESOLUTION[input.group].kind;
  return resolution.kind;
}

function ownerForGroup(group: RadarFindingGroup): string {
  return ({
    infrastructure: "Systems / development",
    reliability: "Systems / development",
    commercial: "Owner",
    compliance: "Owner",
    delivery: "Delivery lead",
    people: "Owner",
  })[group];
}

function incidentScore(severity: BusinessIssueSeverity, findingCount: number, detectedAt: number, now: number): number {
  const ageDays = Math.min(30, Math.max(0, now - detectedAt) / 86_400_000);
  return severityScore(severity) + Math.min(140, findingCount * 2) + Math.round(ageDays) * 3;
}

function severityScore(severity: BusinessIssueSeverity): number {
  return severity === "critical" ? 1_100 : severity === "warning" ? 780 : 480;
}

function categoryForDomain(domain: AdvisorDomain): AdvisorActionCategory {
  if (domain === "sales") return "sales";
  if (domain === "finance") return "finance";
  if (domain === "clients") return "client";
  if (domain === "delivery") return "delivery";
  if (domain === "inbox") return "support";
  if (domain === "development") return "development";
  if (domain === "marketing") return "marketing";
  if (domain === "company" || domain === "compliance" || domain === "team") return "company";
  return "operations";
}

function domainForAlert(category: OperationalAlertCategory): AdvisorDomain {
  if (category === "money") return "finance";
  if (category === "compliance" || category === "contract") return "compliance";
  if (category === "support") return "inbox";
  if (category === "client" || category === "meeting") return "clients";
  if (category === "marketing") return "marketing";
  if (category === "development" || category === "outage") return "development";
  return "operations";
}

function domainWeight(domain: AdvisorDomain): number {
  return ({ compliance: 70, finance: 65, inbox: 60, sales: 58, clients: 55, delivery: 50, systems: 48, company: 45, development: 40, operations: 35, marketing: 30, team: 25 })[domain];
}

function domainLabel(domain: AdvisorDomain): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function actionDetail(detail: string): string {
  const clean = detail.trim();
  if (!clean) return "Inspect the linked evidence, choose an owner, and record the completed outcome.";
  return `${clean} Inspect the evidence, choose an owner, and record the completed outcome.`.slice(0, 600);
}

function relativeAge(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} minutes ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hours ago`;
  return `${Math.floor(elapsed / 86_400_000)} days ago`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dueAt(base: number, days: number): number {
  const date = new Date(base + days * 86_400_000);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
