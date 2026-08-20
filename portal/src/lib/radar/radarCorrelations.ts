import type { AdvisorDomain, BusinessIssueSeverity, BusinessRadarCheck, BusinessRadarIssue } from "@/lib/radar/businessRadar";
import type { RadarObservation } from "@/lib/radar/radarCheckEngine";

interface CorrelationEvidence {
  domain: AdvisorDomain;
  familyId: string;
  label: string;
  test: (observation: RadarObservation) => boolean;
}

interface CorrelationDefinition {
  id: string;
  domain: AdvisorDomain;
  severity: BusinessIssueSeverity;
  title: string;
  detail: string;
  href: string;
  evidence: readonly CorrelationEvidence[];
}

const CORRELATIONS: readonly CorrelationDefinition[] = [
  correlation("demand-response-pressure", "sales", "critical", "Demand is arriving while leads wait", "Inbound demand and unresolved response pressure are happening together. Revenue is being exposed at the exact point of first contact.", "/portal/agency/inbox?view=forms", [
    above("sales", "enquiries-7d", "Weekly enquiries", 0),
    above("sales", "awaiting-response", "Leads awaiting response", 0),
  ]),
  correlation("traffic-conversion-leak", "marketing", "warning", "Traffic is arriving without a conversion signal", "The properties are receiving meaningful traffic, but the radar cannot see forms or conversions. Check the offer, journey, forms, and event instrumentation together.", "/portal/agency/fulfilment/technical/performance", [
    atLeast("marketing", "traffic-7d", "Weekly traffic", 20),
    atMost("marketing", "form-submissions", "Form submissions", 0),
    atMost("marketing", "conversions", "Tracked conversions", 0),
  ]),
  correlation("attribution-leak", "marketing", "warning", "Demand is being captured without reliable attribution", "Form activity and unattributed demand overlap, weakening campaign decisions and source-level ROI reporting.", "/portal/agency/marketing", [
    above("marketing", "form-submissions", "Form submissions", 0),
    above("marketing", "unattributed-leads", "Unattributed leads", 0),
  ]),
  correlation("client-delivery-pressure", "delivery", "critical", "Client attention and blocked delivery are compounding", "A client-care problem is overlapping with blocked or overdue fulfilment. Treat this as one retention risk, not two separate queues.", "/portal/agency/fulfilment", [
    above("clients", "attention-clients", "Clients needing attention", 0),
    attention("delivery", ["blocked-milestones", "overdue-milestones"], "Blocked or overdue milestones"),
  ]),
  correlation("client-technology-risk", "clients", "critical", "Client production trouble may be going stale", "Production errors and weak telemetry freshness overlap. Client impact may continue without a trustworthy recovery signal.", "/portal/agency/fulfilment/technical/performance", [
    above("clients", "production-errors", "Client production errors", 0),
    attention("clients", ["telemetry-freshness"], "Client telemetry freshness"),
  ]),
  correlation("delivery-cash-exposure", "finance", "warning", "Work is continuing while invoices are overdue", "Active delivery and overdue receivables overlap. Margin and cash exposure are growing while fulfilment continues.", "/portal/agency/agency-finance", [
    above("delivery", "delivery-cards", "Delivery work in flight", 0),
    above("finance", "overdue-invoices", "Overdue invoices", 0),
  ]),
  correlation("capacity-execution-strain", "team", "critical", "Capacity pressure is feeding an overdue backlog", "Team capacity and overdue work are deteriorating together. Reprioritisation or additional capacity is now an operating decision.", "/portal/agency/actions", [
    above("operations", "overdue-tasks", "Overdue tasks", 0),
    attention("team", ["capacity-pressure", "hiring-trigger"], "Capacity pressure"),
  ]),
  correlation("automation-backlog-loop", "operations", "warning", "Automation failures are adding to overdue work", "Failed workflows and an overdue task backlog overlap. Manual recovery work may be hiding the true cost of automation failure.", "/portal/agency/automations", [
    above("operations", "automation-failures", "Automation failures", 0),
    above("operations", "overdue-tasks", "Overdue tasks", 0),
  ]),
  correlation("inbox-response-cascade", "inbox", "critical", "Open conversations are breaching response deadlines", "Conversation demand and overdue replies are building together across the master inbox.", "/portal/agency/inbox", [
    above("inbox", "open-conversations", "Open conversations", 0),
    above("inbox", "response-overdue", "Responses overdue", 0),
  ]),
  correlation("compliance-cash-risk", "compliance", "critical", "Compliance deadlines and finance obligations overlap", "Legal or regulatory action is due while finance obligations also require attention. Coordinate evidence, ownership, and funding immediately.", "/portal/agency/agency-finance/operations", [
    attention("compliance", ["due-records", "action-required"], "Compliance action due"),
    above("finance", "obligations", "Finance obligations", 0),
  ]),
  correlation("production-acquisition-impact", "development", "critical", "Production errors coincide with traffic loss", "Runtime errors and falling traffic overlap. Acquisition performance may be suffering from a technical failure rather than a campaign problem.", "/portal/agency/fulfilment/technical/performance", [
    above("development", "production-errors", "Production errors", 0),
    above("marketing", "traffic-drops", "Properties losing traffic", 0),
  ]),
  correlation("silent-property-risk", "development", "critical", "A live property is losing observability", "Expected production properties are silent or their Aqua Tags are stale. Healthy-looking downstream metrics cannot be trusted until reporting resumes.", "/portal/agency/fulfilment/technical/performance", [
    attention("development", ["monitoring-silence", "tag-freshness", "tag-coverage"], "Tag or monitoring silence"),
    above("development", "property-coverage", "Tracked properties", 0),
  ]),
  correlation("integration-ingestion-risk", "systems", "warning", "Integration failure is threatening inbound data", "A failed integration overlaps with weak inbox or telemetry ingestion. The business may be active while AquaCRM receives an incomplete picture.", "/portal/agency/company?view=connections", [
    above("systems", "integration-failures", "Integration failures", 0),
    attention("systems", ["telemetry-ingestion", "inbox-ingestion"], "Inbound data flow"),
  ]),
  correlation("sales-revenue-gap", "company", "warning", "Revenue gap and pipeline weakness overlap", "The current revenue gap is not backed by a confidently healthy sales pipeline. The plan needs more qualified demand, faster conversion, or both.", "/portal/agency?station=battle&battle=projections", [
    above("company", "revenue-gap", "Revenue gap", 0),
    attention("company", ["pipeline-health"], "Pipeline health"),
  ]),
  correlation("ownership-cascade", "operations", "warning", "Unowned work spans tasks and conversations", "Unassigned operational work and unassigned inbox demand overlap, creating a cross-team accountability gap.", "/portal/agency/actions", [
    above("operations", "unassigned-tasks", "Unassigned tasks", 0),
    above("inbox", "unassigned-conversations", "Unassigned conversations", 0),
  ]),
  correlation("release-regression", "development", "critical", "A release may be degrading production", "Release-linked errors and slow live properties overlap. Compare deployment timing with the first affected telemetry event.", "/portal/agency/fulfilment/technical/website", [
    above("development", "release-errors", "Release-linked errors", 0),
    above("development", "slow-properties", "Slow properties", 0),
  ]),
  correlation("support-retention-risk", "clients", "warning", "Support pressure overlaps with client health risk", "Open support demand and clients needing attention are rising together. This is a retention signal, not only an inbox backlog.", "/portal/clients?view=health", [
    above("inbox", "support-demand", "Open support demand", 0),
    above("clients", "attention-clients", "Clients needing attention", 0),
  ]),
  correlation("pipeline-leakage", "sales", "warning", "Stale leads and lost decisions are compounding", "Open leads are aging while the recorded loss rate is also outside its guardrail. Review source quality, qualification, ownership, and stage exit reasons together.", "/portal/clients?view=journey", [
    above("sales", "stale-open-leads", "Stale open leads", 0),
    attention("sales", ["lost-decision-rate"], "Closed-deal loss rate"),
  ]),
  correlation("source-quality-retention", "marketing", "warning", "Acquisition source quality is carrying into retention", "Conversion and churn vary materially by source. Compare the promise, qualification, product fit, onboarding, and long-term value of each mature cohort before increasing spend.", "/portal/agency/marketing", [
    attention("sales", ["source-conversion-spread"], "Source conversion spread"),
    attention("clients", ["source-churn-spread"], "Source churn spread"),
  ]),
  correlation("cancellation-health-risk", "clients", "critical", "Cancellation intent overlaps with wider client risk", "A cancellation or provider-move request is open while client health concerns are already present. Treat this as an immediate save, handover, and root-cause workflow.", "/portal/agency/inbox?view=support", [
    above("clients", "pending-cancellations", "Pending cancellations", 0),
    above("clients", "attention-clients", "Clients needing attention", 0),
  ]),
  correlation("source-dependency-attribution", "marketing", "warning", "Acquisition is concentrated while attribution is incomplete", "The commercial engine depends heavily on one retained source while some lead origins remain unclear. Channel resilience and spend decisions cannot yet be trusted together.", "/portal/agency/marketing", [
    attention("marketing", ["source-concentration"], "Source concentration"),
    attention("marketing", ["lead-source-attribution"], "Lead source attribution"),
  ]),
] as const;

export function buildRadarCorrelationIssues(
  observations: readonly RadarObservation[],
  checks: readonly BusinessRadarCheck[],
  now: number,
): BusinessRadarIssue[] {
  const byKey = new Map(observations.map(observation => [`${observation.domain}:${observation.familyId}`, observation]));
  const issues = CORRELATIONS.flatMap(definition => {
    const matched = definition.evidence.flatMap(item => {
      const candidates = item.familyId.split("|").flatMap(familyId => {
        const observation = byKey.get(`${item.domain}:${familyId}`);
        return observation && item.test(observation) ? [observation] : [];
      });
      return candidates.length ? [{ item, observation: candidates[0]! }] : [];
    });
    if (matched.length !== definition.evidence.length) return [];
    return [{
      id: `correlation:${definition.id}`,
      severity: definition.severity,
      domain: definition.domain,
      title: definition.title,
      detail: definition.detail,
      evidence: matched.map(({ item, observation }) => `${item.label}: ${observation.display}`),
      href: definition.href,
      detectedAt: now,
      sourceIds: matched.map(({ observation }) => observation.sourceId),
    } satisfies BusinessRadarIssue];
  });

  const alarmFamiliesByDomain = new Map<AdvisorDomain, Set<string>>();
  for (const check of checks) {
    if (check.status !== "critical" && check.status !== "warning") continue;
    const families = alarmFamiliesByDomain.get(check.domain) ?? new Set<string>();
    families.add(check.familyId);
    alarmFamiliesByDomain.set(check.domain, families);
  }
  for (const [domain, families] of alarmFamiliesByDomain) {
    if (families.size < 4) continue;
    const sourceChecks = checks.filter(check => check.domain === domain && families.has(check.familyId) && (check.status === "critical" || check.status === "warning"));
    issues.push({
      id: `correlation:${domain}-risk-cluster`,
      severity: families.size >= 7 ? "critical" : "warning",
      domain,
      title: `${readable(domain)} has a ${families.size}-signal risk cluster`,
      detail: "Several independent KPI families are breaching guardrails together. Treat the domain as one connected operating problem and trace the shared cause.",
      evidence: [...families].slice(0, 8).map(readable),
      href: sourceChecks[0]?.href ?? "/portal/agency",
      detectedAt: now,
      sourceIds: [...new Set(sourceChecks.map(check => check.sourceId))],
    });
  }

  const clusteredDomains = [...alarmFamiliesByDomain].filter(([, families]) => families.size >= 4);
  if (clusteredDomains.length >= 3) {
    issues.push({
      id: "correlation:whole-business-risk-cascade",
      severity: "critical",
      domain: "company",
      title: `${clusteredDomains.length} business areas are deteriorating together`,
      detail: "Multiple domain-level risk clusters are active at the same time. Use the Advisor to identify the smallest shared intervention before treating symptoms independently.",
      evidence: clusteredDomains.map(([domain, families]) => `${readable(domain)}: ${families.size} affected KPI families`),
      href: "/portal/agency",
      detectedAt: now,
      sourceIds: clusteredDomains.map(([domain]) => `domain:${domain}`),
    });
  }

  return issues;
}

function correlation(
  id: string,
  domain: AdvisorDomain,
  severity: BusinessIssueSeverity,
  title: string,
  detail: string,
  href: string,
  evidence: readonly CorrelationEvidence[],
): CorrelationDefinition {
  return { id, domain, severity, title, detail, href, evidence };
}

function above(domain: AdvisorDomain, familyId: string, label: string, minimum: number): CorrelationEvidence {
  return { domain, familyId, label, test: observation => observation.current !== null && observation.current > minimum };
}

function atLeast(domain: AdvisorDomain, familyId: string, label: string, minimum: number): CorrelationEvidence {
  return { domain, familyId, label, test: observation => observation.current !== null && observation.current >= minimum };
}

function atMost(domain: AdvisorDomain, familyId: string, label: string, maximum: number): CorrelationEvidence {
  return { domain, familyId, label, test: observation => observation.current !== null && observation.current <= maximum };
}

function attention(domain: AdvisorDomain, familyIds: readonly string[], label: string): CorrelationEvidence {
  return {
    domain,
    familyId: familyIds.join("|"),
    label,
    test: observation => observation.status === "critical" || observation.status === "warning" || observation.status === "watch",
  };
}

function readable(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
