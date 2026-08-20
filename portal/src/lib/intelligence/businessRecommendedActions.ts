import type { AdvisorActionCategory, AdvisorActionSuggestion } from "@/lib/advisor/advisorActions";
import { ADVISOR_CATEGORY_HREF } from "@/lib/advisor/advisorActions";
import type { AdvisorDomain, BusinessIssueRadar, BusinessIssueSeverity, RadarFindingGroup } from "@/engines/data/radar/businessRadar";
import { radarFindingGroup } from "@/engines/data/radar/radarClassification";
import { stepsFor } from "@/lib/inbox/evidenceSteps";
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
      group: incident.group,
      restorable: RESTORABLE_GROUPS.has(incident.group),
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
  const resolution = resolutionKindOf({ id: findingId });
  let kind = resolution.kind;
  let expectedOutcome = resolution.clearsWhen;
  if (kind === "judgement" && restorable) {
    kind = "off-system";
    expectedOutcome = expectedOutcome ?? `${action.title.replace(/[.\s]+$/, "")} is resolved and Radar can read it as healthy again.`;
  }
  return {
    ...action,
    kind,
    expectedOutcome,
    steps: stepsFor(findingId, { href: action.href }),
    suggestedOwner: ownerForGroup(group),
    group,
  };
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
