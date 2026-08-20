import type {
  AdvisorDomain,
  BusinessRadarCheck,
  BusinessRadarIssue,
  ClientRadarPackSummary,
  ClientRadarSnapshot,
  RadarCheckStatus,
  RadarEntityReference,
} from "@/lib/radar/businessRadar";
import type { ClientAquaHealth } from "@/lib/clients/clientAquaHealth";
import type { ClientPaymentPosition } from "@/lib/clients/clientPaymentPlans";
import type { PortalProductKey } from "@/lib/portal/portalProducts";

const DAY = 86_400_000;

export interface ClientRadarProductInput {
  id: string;
  name: string;
  key?: PortalProductKey;
  requiresPortal: boolean;
  deliverableCount: number;
  workspace?: {
    progress: number;
    pendingDecisions: number;
    blockedDecisions: number;
    outputCount: number;
    readyOutputs: number;
    lastUpdatedAt?: number;
  };
}

export interface ClientRadarPropertyInput {
  id: string;
  label: string;
  expectedLive: boolean;
  tagDeclared: boolean;
  lastSeenAt?: number;
  errors24h: number;
  averageLoadMs?: number;
  syntheticOk?: boolean;
}

export interface ClientRadarMilestoneInput {
  id: string;
  title: string;
  status: "not-started" | "in-progress" | "complete" | "blocked";
  targetAt?: number;
  updatedAt: number;
}

export interface ClientRadarAlertInput {
  id: string;
  severity: "critical" | "warning" | "notice";
  title: string;
  detail: string;
  href: string;
  occurredAt: number;
}

export interface ClientRadarInput {
  now: number;
  client: {
    id: string;
    name: string;
    status: string;
    stage: string;
    createdAt: number;
    updatedAt: number;
    ownerEmail?: string;
    portalEmail?: string;
    companyId?: string;
  };
  aquaHealth: ClientAquaHealth;
  products: ClientRadarProductInput[];
  properties: ClientRadarPropertyInput[];
  milestones: ClientRadarMilestoneInput[];
  alerts: ClientRadarAlertInput[];
  financeConnected: boolean;
  paymentPosition?: ClientPaymentPosition;
  invoices: Array<{
    status: string;
    dueAt: number;
    totalCents: number;
    paidAt?: number;
    currency: string;
  }>;
  requestsObserved: boolean;
  requests: Array<{ status?: string; priority?: string; type?: string; submittedAt?: number }>;
  contracts: Array<{ status: string; title?: string; issuedAt?: number; updatedAt?: number; createdAt?: number }>;
  portal: {
    expected: boolean;
    builtAt?: number;
    accessEmail?: string;
    accessSentAt?: number;
    pendingApprovals: number;
    sharedFiles: number;
  };
  marketing?: {
    enabled: boolean;
    attentionProfiles: number;
    pendingApprovals: number;
    activeCampaigns: number;
    campaignsOverBudget: number;
    campaignsWithoutLeads: number;
    updatedAt?: number;
  };
  lastContactedAt?: number;
  lastRecordedAt?: number;
}

interface CheckInput {
  id: string;
  packId: string;
  packLabel: string;
  packKind: ClientRadarPackSummary["kind"];
  product?: ClientRadarProductInput;
  domain: AdvisorDomain;
  label: string;
  status: RadarCheckStatus;
  detail: string;
  evidence: string[];
  target: string;
  value?: number;
  sourceId: string;
  href: string;
  measuredAt: number;
  lastSeenAt?: number;
  sampleSize?: number;
  expectedDirection?: "higher" | "lower" | "neutral";
  entity?: RadarEntityReference;
}

export function buildClientRadarSnapshot(input: ClientRadarInput): ClientRadarSnapshot {
  const { client, now } = input;
  const clientEntity: RadarEntityReference = { type: "client", id: client.id, label: client.name };
  const href = `/portal/clients/${encodeURIComponent(client.id)}`;
  const definitions: CheckInput[] = [];
  const add = (check: Omit<CheckInput, "measuredAt" | "entity"> & { measuredAt?: number; entity?: RadarEntityReference }) => definitions.push({
    ...check,
    measuredAt: check.measuredAt ?? now,
    entity: check.entity ?? clientEntity,
  });

  const base = { packId: "client-core", packLabel: "Client core", packKind: "base" as const };
  const active = client.status === "active" && client.stage !== "churned";
  const relationshipStatus: RadarCheckStatus = input.aquaHealth.state === "risk"
    ? "critical"
    : input.aquaHealth.state === "watch"
      ? "warning"
      : input.aquaHealth.state === "strong"
        ? "pass"
        : "learning";
  add({ ...base, id: "relationship-health", domain: "clients", label: "Relationship health", status: relationshipStatus, detail: input.aquaHealth.summary, evidence: input.aquaHealth.factors.flatMap(factor => [`${factor.label}: ${factor.score ?? "learning"}`, ...factor.evidence.slice(0, 1)]), target: "80/100 or above", value: input.aquaHealth.score ?? undefined, sourceId: `client-health:${client.id}`, href: `${href}?tab=relationship`, sampleSize: input.aquaHealth.factors.filter(factor => factor.score !== null).length, expectedDirection: "higher" });

  const contactAge = input.lastContactedAt ? Math.max(0, now - input.lastContactedAt) : null;
  add({ ...base, id: "contact-cadence", domain: "clients", label: "Contact cadence", status: !active ? "inactive" : contactAge === null ? "learning" : contactAge > 30 * DAY ? "critical" : contactAge > 14 * DAY ? "warning" : "pass", detail: contactAge === null ? "No client contact has been retained yet." : `The latest retained client contact was ${Math.floor(contactAge / DAY)} day${Math.floor(contactAge / DAY) === 1 ? "" : "s"} ago.`, evidence: [contactAge === null ? "No contact timestamp" : `${Math.floor(contactAge / DAY)} days since contact`, `Lifecycle ${client.stage}`], target: "Contact within 14 days", value: contactAge === null ? undefined : Math.floor(contactAge / DAY), sourceId: `client-contact:${client.id}`, href: `${href}?tab=relationship`, lastSeenAt: input.lastContactedAt, sampleSize: input.lastContactedAt ? 1 : 0, expectedDirection: "lower" });

  const hasContactRoute = Boolean(client.ownerEmail || client.portalEmail);
  add({ ...base, id: "contactability", domain: "clients", label: "Contactability", status: hasContactRoute ? "pass" : "warning", detail: hasContactRoute ? "A primary client email is retained." : "No primary client email is retained, so portal access and direct communication cannot be assured.", evidence: [client.ownerEmail ? "Owner email present" : "Owner email missing", client.portalEmail ? "Portal email present" : "Portal email missing"], target: "At least one retained email", value: hasContactRoute ? 1 : 0, sourceId: `client-record:${client.id}`, href: `${href}?tab=relationship`, sampleSize: 1, expectedDirection: "higher" });

  add({ ...base, id: "service-assignment", domain: "delivery", label: "Service assignment", status: input.products.length ? "pass" : active ? "warning" : "learning", detail: input.products.length ? `${input.products.length} product or service workspace${input.products.length === 1 ? " is" : "s are"} assigned.` : "No product or service is assigned to this client workspace.", evidence: input.products.length ? input.products.map(product => product.name) : ["No assignment retained"], target: "At least one assigned service", value: input.products.length, sourceId: `client-products:${client.id}`, href: `${href}?tab=delivery`, sampleSize: input.products.length, expectedDirection: "higher" });

  const blockedMilestones = input.milestones.filter(item => item.status === "blocked");
  const overdueMilestones = input.milestones.filter(item => item.status !== "complete" && Boolean(item.targetAt && item.targetAt < now));
  add({ ...base, id: "delivery-commitments", domain: "delivery", label: "Delivery commitments", status: !input.products.length ? "inactive" : blockedMilestones.length ? "critical" : overdueMilestones.length ? "warning" : input.milestones.length ? "pass" : "learning", detail: blockedMilestones.length ? `${blockedMilestones.length} milestone${blockedMilestones.length === 1 ? " is" : "s are"} blocked.` : overdueMilestones.length ? `${overdueMilestones.length} milestone${overdueMilestones.length === 1 ? " is" : "s are"} overdue.` : input.milestones.length ? "No retained milestone is blocked or overdue." : "Delivery milestones have not been established yet.", evidence: [...blockedMilestones.map(item => `Blocked: ${item.title}`), ...overdueMilestones.map(item => `Overdue: ${item.title}`)].slice(0, 8), target: "No blocked or overdue milestones", value: blockedMilestones.length + overdueMilestones.length, sourceId: `client-milestones:${client.id}`, href: `${href}?tab=delivery`, lastSeenAt: newest(input.milestones.map(item => item.updatedAt)), sampleSize: input.milestones.length, expectedDirection: "lower" });

  const overdueInvoices = input.invoices.filter(invoice => ["sent", "overdue"].includes(invoice.status) && invoice.dueAt < now);
  const openInvoices = input.invoices.filter(invoice => ["sent", "overdue"].includes(invoice.status));
  const paymentPosition = input.paymentPosition;
  const paymentStatus: RadarCheckStatus = !input.financeConnected
    ? "blind"
    : paymentPosition?.state === "missed-payment" || overdueInvoices.length
      ? "critical"
      : paymentPosition?.state === "payment-due" || openInvoices.length
        ? "watch"
        : paymentPosition?.state === "paid-in-full"
          ? "pass"
          : paymentPosition?.state === "payment-plan" || paymentPosition?.state === "draft"
            ? "learning"
            : input.invoices.length
              ? "pass"
              : "learning";
  const paymentDetail = !input.financeConnected
    ? "Finance is not connected for this workspace."
    : paymentPosition
      ? `${paymentPosition.label}. ${money(paymentPosition.outstandingCents, paymentPosition.currency)} remains outstanding across ${paymentPosition.activePlans} active payment plan${paymentPosition.activePlans === 1 ? "" : "s"}.`
      : overdueInvoices.length
        ? `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} overdue.`
        : openInvoices.length
          ? `${openInvoices.length} issued invoice${openInvoices.length === 1 ? " is" : "s are"} awaiting payment inside its retained terms.`
          : input.invoices.length ? "No issued client invoice is overdue." : "No issued invoice history exists yet.";
  add({ ...base, id: "payment-position", domain: "finance", label: "Payment position", status: paymentStatus, detail: paymentDetail, evidence: paymentPosition ? [`${paymentPosition.missedPayments} missed`, `${paymentPosition.openInvoices} open invoices`, `${money(paymentPosition.paidCents, paymentPosition.currency)} collected`, `${money(paymentPosition.outstandingCents, paymentPosition.currency)} outstanding`] : [`${overdueInvoices.length} overdue`, `${openInvoices.length} open`, `${input.invoices.length} retained`], target: "No missed payments and all issued amounts collected by their due date", value: paymentPosition?.missedPayments ?? overdueInvoices.length, sourceId: `client-finance:${client.id}`, href: `${href}?tab=finance`, lastSeenAt: newest(input.invoices.flatMap(invoice => [invoice.paidAt, invoice.dueAt])), sampleSize: input.invoices.length + (paymentPosition?.activePlans ?? 0), expectedDirection: "lower" });

  const acceptedContracts = input.contracts.filter(contract => contract.status === "accepted");
  const waitingContracts = input.contracts.filter(contract => contract.status === "sent");
  add({ ...base, id: "agreement-position", domain: "compliance", label: "Agreement position", status: acceptedContracts.length ? "pass" : waitingContracts.length ? "watch" : input.products.length ? "learning" : "inactive", detail: acceptedContracts.length ? `${acceptedContracts.length} accepted agreement${acceptedContracts.length === 1 ? " is" : "s are"} retained.` : waitingContracts.length ? `${waitingContracts.length} agreement${waitingContracts.length === 1 ? " is" : "s are"} awaiting acceptance.` : input.products.length ? "No accepted agreement is retained for the assigned work." : "Agreement monitoring activates after a service is assigned.", evidence: [`${acceptedContracts.length} accepted`, `${waitingContracts.length} awaiting decision`, `${input.contracts.length} total`], target: "Accepted agreement retained", value: acceptedContracts.length, sourceId: `client-contracts:${client.id}`, href: `${href}?tab=finance`, lastSeenAt: newest(input.contracts.flatMap(contract => [contract.updatedAt, contract.issuedAt, contract.createdAt])), sampleSize: input.contracts.length, expectedDirection: "higher" });

  const openRequests = input.requests.filter(request => request.status === "open");
  const urgentRequests = openRequests.filter(request => request.priority === "urgent" || request.priority === "high" || request.type === "cancel" || request.type === "move-provider");
  add({ ...base, id: "support-pressure", domain: "inbox", label: "Support pressure", status: !input.requestsObserved ? "learning" : urgentRequests.length ? "critical" : openRequests.length >= 3 ? "warning" : openRequests.length ? "watch" : "pass", detail: !input.requestsObserved ? "No client support history has been observed yet." : urgentRequests.length ? `${urgentRequests.length} urgent or exit-related request${urgentRequests.length === 1 ? " is" : "s are"} open.` : openRequests.length ? `${openRequests.length} client request${openRequests.length === 1 ? " is" : "s are"} open.` : "No client support request is open.", evidence: [`${urgentRequests.length} urgent`, `${openRequests.length} open`, `${input.requests.length} retained`], target: "No urgent unresolved requests", value: urgentRequests.length, sourceId: `client-requests:${client.id}`, href: `${href}?tab=communications`, lastSeenAt: newest(input.requests.map(request => request.submittedAt)), sampleSize: input.requests.length, expectedDirection: "lower" });

  const portalStatus: RadarCheckStatus = !input.portal.expected
    ? "inactive"
    : !input.portal.builtAt
      ? active ? "warning" : "learning"
      : !input.portal.accessEmail
        ? "warning"
        : input.portal.accessSentAt
          ? "pass"
          : "watch";
  add({ ...base, id: "portal-readiness", domain: "delivery", label: "Portal readiness", status: portalStatus, detail: !input.portal.expected ? "None of the assigned products requires a portal." : !input.portal.builtAt ? "The client portal has not been prepared." : !input.portal.accessEmail ? "The portal exists but has no retained access email." : input.portal.accessSentAt ? "Portal access has been sent." : "Portal access is prepared and awaiting review or invitation.", evidence: [input.portal.builtAt ? "Portal built" : "Portal not built", input.portal.accessEmail ? "Access identity present" : "Access identity missing", input.portal.accessSentAt ? "Access sent" : "Access not sent"], target: "Portal prepared and access sent", value: input.portal.accessSentAt ? 1 : 0, sourceId: `client-portal:${client.id}`, href: `${href}?tab=portal`, lastSeenAt: input.portal.accessSentAt ?? input.portal.builtAt, sampleSize: input.portal.builtAt ? 1 : 0, expectedDirection: "higher" });

  add({ ...base, id: "portal-decisions", domain: "delivery", label: "Portal decisions", status: !input.portal.builtAt ? "inactive" : input.portal.pendingApprovals >= 3 ? "warning" : input.portal.pendingApprovals ? "watch" : "pass", detail: input.portal.pendingApprovals ? `${input.portal.pendingApprovals} portal approval${input.portal.pendingApprovals === 1 ? " is" : "s are"} waiting for a decision.` : "No portal approval is waiting.", evidence: [`${input.portal.pendingApprovals} pending approvals`, `${input.portal.sharedFiles} shared files`], target: "No overdue decisions", value: input.portal.pendingApprovals, sourceId: `client-portal:${client.id}`, href: `${href}?tab=portal`, sampleSize: input.portal.pendingApprovals + input.portal.sharedFiles, expectedDirection: "lower" });

  for (const product of input.products) addProductChecks(add, input, product, clientEntity, href);
  for (const property of input.properties) addPropertyChecks(add, input, property, clientEntity, href);

  if (input.marketing?.enabled) {
    const marketing = input.marketing;
    const pack = { packId: "marketing-service", packLabel: "Marketing service", packKind: "source" as const };
    add({ ...pack, id: "account-access", domain: "marketing", label: "Marketing account access", status: marketing.attentionProfiles ? "critical" : "pass", detail: marketing.attentionProfiles ? `${marketing.attentionProfiles} connected marketing profile${marketing.attentionProfiles === 1 ? " needs" : "s need"} attention.` : "No retained marketing profile is marked as needing attention.", evidence: [`${marketing.attentionProfiles} access issues`], target: "All required profiles connected", value: marketing.attentionProfiles, sourceId: `client-marketing:${client.id}`, href: `${href}?tab=marketing`, lastSeenAt: marketing.updatedAt, sampleSize: 1, expectedDirection: "lower" });
    add({ ...pack, id: "campaign-control", domain: "marketing", label: "Campaign control", status: marketing.campaignsOverBudget ? "critical" : marketing.campaignsWithoutLeads ? "warning" : marketing.activeCampaigns ? "pass" : "learning", detail: marketing.campaignsOverBudget ? `${marketing.campaignsOverBudget} campaign${marketing.campaignsOverBudget === 1 ? " is" : "s are"} over budget.` : marketing.campaignsWithoutLeads ? `${marketing.campaignsWithoutLeads} campaign${marketing.campaignsWithoutLeads === 1 ? " has" : "s have"} material spend without an attributed lead.` : marketing.activeCampaigns ? `${marketing.activeCampaigns} active campaign${marketing.activeCampaigns === 1 ? " is" : "s are"} inside the retained guardrails.` : "No active campaign evidence exists yet.", evidence: [`${marketing.activeCampaigns} active`, `${marketing.campaignsOverBudget} over budget`, `${marketing.campaignsWithoutLeads} without leads`], target: "Budget respected and demand attributed", value: marketing.campaignsOverBudget + marketing.campaignsWithoutLeads, sourceId: `client-marketing:${client.id}`, href: `${href}?tab=marketing`, lastSeenAt: marketing.updatedAt, sampleSize: marketing.activeCampaigns, expectedDirection: "lower" });
    add({ ...pack, id: "approval-queue", domain: "marketing", label: "Marketing approvals", status: marketing.pendingApprovals >= 4 ? "warning" : marketing.pendingApprovals ? "watch" : "pass", detail: marketing.pendingApprovals ? `${marketing.pendingApprovals} content or campaign approval${marketing.pendingApprovals === 1 ? " is" : "s are"} waiting.` : "No marketing approval is waiting.", evidence: [`${marketing.pendingApprovals} pending`], target: "Approval queue clear", value: marketing.pendingApprovals, sourceId: `client-marketing:${client.id}`, href: `${href}?tab=marketing`, lastSeenAt: marketing.updatedAt, sampleSize: marketing.pendingApprovals, expectedDirection: "lower" });
  }

  const checks = definitions.map(definition => toCheck(client, definition));
  const issues = [
    ...checks.filter(check => check.status === "critical" || check.status === "warning").map(check => issueFromCheck(client, check, now)),
    ...input.alerts.map(alert => ({
      id: `client-radar:alert:${alert.id}`,
      severity: alert.severity === "notice" ? "watch" as const : alert.severity,
      domain: domainForHref(alert.href),
      title: alert.title,
      detail: alert.detail,
      evidence: [`Client ${client.name}`, `Observed ${relativeAge(now - alert.occurredAt)} ago`],
      href: alert.href,
      detectedAt: alert.occurredAt,
      sourceIds: [alert.id],
      entity: clientEntity,
    })),
  ].filter((issue, index, all) => all.findIndex(candidate => candidate.title === issue.title && candidate.href === issue.href) === index)
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || left.detectedAt - right.detectedAt);

  const packs = summarizePacks(definitions, checks);
  const totals = summarizeChecks(checks);
  const applicable = checks.filter(check => check.status !== "inactive");
  const confidence = applicable.length ? Math.round(applicable.reduce((total, check) => total + confidenceWeight(check.status), 0) / applicable.length * 100) : 0;
  const ready = applicable.filter(check => check.status !== "blind" && check.status !== "learning").length;
  const readiness = applicable.length ? Math.round(ready / applicable.length * 100) : 0;
  const outcomeChecks = applicable.filter(check => check.lens === "threshold" && check.status !== "blind" && check.status !== "learning");
  const checkHealth = outcomeChecks.length ? Math.round(outcomeChecks.reduce((total, check) => total + statusScore(check.status), 0) / outcomeChecks.length) : null;
  const healthScore = input.aquaHealth.score === null
    ? checkHealth
    : checkHealth === null
      ? input.aquaHealth.score
      : Math.round(input.aquaHealth.score * 0.4 + checkHealth * 0.6);
  const healthState = totals.critical > 0 || issues.some(issue => issue.severity === "critical") || (healthScore !== null && healthScore < 55)
    ? "risk" as const
    : confidence < 50 || healthScore === null
      ? "learning" as const
      : totals.warning > 0 || totals.watch > 0 || issues.some(issue => issue.severity === "warning" || issue.severity === "watch")
        ? "watch" as const
      : healthScore >= 80
        ? "strong" as const
        : "watch" as const;
  const primary = issues[0];

  return {
    generatedAt: now,
    clientId: client.id,
    clientName: client.name,
    healthScore,
    healthState,
    confidencePercent: confidence,
    readinessPercent: readiness,
    summary: primary ? `${primary.title}: ${primary.detail}` : totals.learning || totals.blind ? "The client system is still connecting evidence before it can prove full health." : "No client-specific guardrail currently needs attention.",
    lastRecordedAt: input.lastRecordedAt,
    checks,
    issues,
    packs,
    totals,
  };
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function addProductChecks(
  add: (check: Omit<CheckInput, "measuredAt" | "entity"> & { measuredAt?: number; entity?: RadarEntityReference }) => void,
  input: ClientRadarInput,
  product: ClientRadarProductInput,
  clientEntity: RadarEntityReference,
  href: string,
) {
  const pack = { packId: `product:${product.id}`, packLabel: product.name, packKind: "product" as const, product };
  const productEntity: RadarEntityReference = { type: "product", id: product.id, label: product.name, parentId: clientEntity.id };
  add({ ...pack, id: "workspace", domain: "delivery", label: `${product.name} workspace`, status: product.workspace ? "pass" : "learning", detail: product.workspace ? "The product workspace is materialised and can retain its own delivery state." : "The product is assigned but its detailed workspace has not been materialised yet.", evidence: [product.workspace ? `${product.workspace.progress}% progress` : "Workspace pending"], target: "Product workspace available", value: product.workspace ? 1 : 0, sourceId: `client-product:${input.client.id}:${product.id}`, href: `${href}?tab=delivery&product=${encodeURIComponent(product.id)}`, lastSeenAt: product.workspace?.lastUpdatedAt, sampleSize: product.workspace ? 1 : 0, expectedDirection: "higher", entity: productEntity });
  add({ ...pack, id: "progress", domain: "delivery", label: `${product.name} progress`, status: !product.workspace ? "learning" : product.workspace.blockedDecisions ? "critical" : product.workspace.pendingDecisions >= 3 ? "warning" : product.workspace.progress > 0 ? "pass" : "watch", detail: !product.workspace ? "Progress activates when the product workspace exists." : product.workspace.blockedDecisions ? `${product.workspace.blockedDecisions} decision${product.workspace.blockedDecisions === 1 ? " is" : "s are"} blocked or require changes.` : `${product.workspace.progress}% of the retained product workflow is complete.`, evidence: product.workspace ? [`${product.workspace.progress}% complete`, `${product.workspace.pendingDecisions} pending decisions`, `${product.workspace.readyOutputs}/${product.workspace.outputCount} outputs ready`] : ["No workspace sample"], target: "Progressing with no blocked decisions", value: product.workspace?.progress, sourceId: `client-product:${input.client.id}:${product.id}`, href: `${href}?tab=delivery&product=${encodeURIComponent(product.id)}`, lastSeenAt: product.workspace?.lastUpdatedAt, sampleSize: product.workspace?.outputCount ?? 0, expectedDirection: "higher", entity: productEntity });
  add({ ...pack, id: "deliverable-definition", domain: "delivery", label: `${product.name} deliverables`, status: product.deliverableCount ? "pass" : "watch", detail: product.deliverableCount ? `${product.deliverableCount} expected deliverable${product.deliverableCount === 1 ? " is" : "s are"} declared by the product.` : "This product has no declared deliverables, so completion cannot be checked against an explicit promise.", evidence: [`${product.deliverableCount} configured deliverables`], target: "Explicit deliverables retained", value: product.deliverableCount, sourceId: `client-product:${input.client.id}:${product.id}`, href: `${href}?tab=delivery&product=${encodeURIComponent(product.id)}`, sampleSize: product.deliverableCount, expectedDirection: "higher", entity: productEntity });

  if (isSystemProduct(product.key)) {
    const matchingProperties = input.properties.length;
    add({ ...pack, id: "property-coverage", domain: "development", label: `${product.name} property coverage`, status: matchingProperties ? "pass" : "blind", detail: matchingProperties ? `${matchingProperties} client propert${matchingProperties === 1 ? "y is" : "ies are"} available to technical monitoring.` : "This technical service has no connected property, so uptime and production behaviour cannot be proved.", evidence: [`${matchingProperties} properties`], target: "At least one monitored property", value: matchingProperties, sourceId: `client-properties:${input.client.id}`, href: `${href}?tab=systems`, sampleSize: matchingProperties, expectedDirection: "higher", entity: productEntity });
  }
  if (isMarketingProduct(product.key) && !input.marketing?.enabled) {
    add({ ...pack, id: "marketing-data", domain: "marketing", label: `${product.name} data connection`, status: "blind", detail: "The product requires marketing evidence, but the client marketing workspace is not configured.", evidence: ["Marketing workspace unavailable"], target: "Marketing workspace connected", value: 0, sourceId: `client-marketing:${input.client.id}`, href: `${href}?tab=marketing`, sampleSize: 0, expectedDirection: "higher", entity: productEntity });
  }
  if (product.key === "photography") {
    const collections = product.workspace?.outputCount ?? 0;
    add({ ...pack, id: "asset-collections", domain: "delivery", label: `${product.name} asset readiness`, status: !product.workspace ? "learning" : collections ? "pass" : "watch", detail: collections ? `${collections} retained output or collection record${collections === 1 ? " is" : "s are"} available.` : "No shoot output or client selection collection is retained yet.", evidence: [`${collections} outputs or collections`], target: "Shoot outputs retained", value: collections, sourceId: `client-product:${input.client.id}:${product.id}`, href: `${href}?tab=delivery&product=${encodeURIComponent(product.id)}`, sampleSize: collections, expectedDirection: "higher", entity: productEntity });
  }
}

function addPropertyChecks(
  add: (check: Omit<CheckInput, "measuredAt" | "entity"> & { measuredAt?: number; entity?: RadarEntityReference }) => void,
  input: ClientRadarInput,
  property: ClientRadarPropertyInput,
  clientEntity: RadarEntityReference,
  href: string,
) {
  const pack = { packId: `property:${property.id}`, packLabel: property.label, packKind: "source" as const };
  const entity: RadarEntityReference = { type: "property", id: property.id, label: property.label, parentId: clientEntity.id };
  const stale = property.lastSeenAt ? input.now - property.lastSeenAt > 2 * DAY : false;
  add({ ...pack, id: "tag", domain: "development", label: `${property.label} telemetry`, status: !property.expectedLive ? "inactive" : !property.tagDeclared ? "blind" : !property.lastSeenAt ? "learning" : stale ? "critical" : "pass", detail: !property.expectedLive ? "The property is not expected to be live." : !property.tagDeclared ? "No telemetry tag is declared for this live property." : !property.lastSeenAt ? "A tag is declared but no event has been observed yet." : stale ? "The property has been silent for more than 48 hours." : "Telemetry is reporting inside the 48-hour freshness guardrail.", evidence: [property.expectedLive ? "Expected live" : "Not expected live", property.tagDeclared ? "Tag declared" : "Tag missing", property.lastSeenAt ? `${relativeAge(input.now - property.lastSeenAt)} since last event` : "No event retained"], target: "Live telemetry within 48 hours", value: property.lastSeenAt ? Math.floor((input.now - property.lastSeenAt) / 3_600_000) : undefined, sourceId: `client-property:${input.client.id}:${property.id}`, href: `${href}?tab=systems`, lastSeenAt: property.lastSeenAt, sampleSize: property.lastSeenAt ? 1 : 0, expectedDirection: "lower", entity });
  add({ ...pack, id: "errors", domain: "development", label: `${property.label} production errors`, status: !property.expectedLive ? "inactive" : property.errors24h >= 5 ? "critical" : property.errors24h ? "warning" : property.lastSeenAt ? "pass" : "learning", detail: `${property.errors24h} production error${property.errors24h === 1 ? " was" : "s were"} observed in the last 24 hours.`, evidence: [`${property.errors24h} errors in 24h`], target: "0 production errors", value: property.errors24h, sourceId: `client-property:${input.client.id}:${property.id}`, href: `${href}?tab=systems`, lastSeenAt: property.lastSeenAt, sampleSize: property.lastSeenAt ? 1 : 0, expectedDirection: "lower", entity });
  add({ ...pack, id: "performance", domain: "development", label: `${property.label} load performance`, status: !property.expectedLive ? "inactive" : property.averageLoadMs === undefined ? "learning" : property.averageLoadMs > 5_000 ? "critical" : property.averageLoadMs > 2_500 ? "warning" : "pass", detail: property.averageLoadMs === undefined ? "No retained load-performance sample exists yet." : `Average retained load time is ${property.averageLoadMs}ms.`, evidence: [property.averageLoadMs === undefined ? "No performance sample" : `${property.averageLoadMs}ms average`], target: "2500ms or faster", value: property.averageLoadMs, sourceId: `client-property:${input.client.id}:${property.id}`, href: `${href}?tab=systems`, lastSeenAt: property.lastSeenAt, sampleSize: property.averageLoadMs === undefined ? 0 : 1, expectedDirection: "lower", entity });
  add({ ...pack, id: "synthetic", domain: "systems", label: `${property.label} active probe`, status: !property.expectedLive ? "inactive" : property.syntheticOk === undefined ? "learning" : property.syntheticOk ? "pass" : "critical", detail: property.syntheticOk === undefined ? "No active probe result has been retained yet." : property.syntheticOk ? "The latest active availability probe passed." : "The latest active availability probe failed.", evidence: [property.syntheticOk === undefined ? "No probe sample" : property.syntheticOk ? "Latest probe passed" : "Latest probe failed"], target: "Latest probe passes", value: property.syntheticOk === undefined ? undefined : property.syntheticOk ? 1 : 0, sourceId: `client-property:${input.client.id}:${property.id}`, href: `${href}?tab=systems`, lastSeenAt: property.lastSeenAt, sampleSize: property.syntheticOk === undefined ? 0 : 1, expectedDirection: "higher", entity });
}

function toCheck(client: ClientRadarInput["client"], definition: CheckInput): BusinessRadarCheck {
  const id = `client:${client.id}:${definition.packId}:${definition.id}`;
  return {
    id,
    ruleId: id,
    domain: definition.domain,
    familyId: id,
    familyLabel: definition.label,
    lens: "threshold",
    lensLabel: "Guardrail",
    scope: "kpi",
    status: definition.status,
    title: definition.label,
    detail: definition.detail,
    evidence: [...definition.evidence, `Target ${definition.target}`],
    href: definition.href,
    sourceId: definition.sourceId,
    measuredAt: definition.measuredAt,
    value: definition.value,
    lastSeenAt: definition.lastSeenAt,
    sampleSize: definition.sampleSize,
    expectedDirection: definition.expectedDirection,
    entity: definition.entity,
  };
}

function issueFromCheck(client: ClientRadarInput["client"], check: BusinessRadarCheck, now: number): BusinessRadarIssue {
  return {
    id: `client-radar:${check.id}`,
    severity: check.status === "critical" ? "critical" : "warning",
    domain: check.domain,
    title: `${client.name}: ${check.title}`,
    detail: check.detail,
    evidence: check.evidence,
    href: check.href,
    detectedAt: check.lastSeenAt ?? now,
    sourceIds: [check.sourceId, check.id],
    entity: check.entity,
  };
}

function summarizePacks(definitions: CheckInput[], checks: BusinessRadarCheck[]): ClientRadarPackSummary[] {
  const byId = new Map<string, CheckInput[]>();
  for (const definition of definitions) byId.set(definition.packId, [...(byId.get(definition.packId) ?? []), definition]);
  return [...byId.entries()].map(([id, entries]) => {
    const packChecks = checks.filter(check => check.id.includes(`:${id}:`));
    const product = entries[0]?.product;
    return {
      id,
      label: entries[0]?.packLabel ?? id,
      kind: entries[0]?.packKind ?? "source",
      productId: product?.id,
      productName: product?.name,
      totalChecks: packChecks.length,
      liveChecks: packChecks.filter(check => check.status !== "inactive").length,
      critical: packChecks.filter(check => check.status === "critical").length,
      warning: packChecks.filter(check => check.status === "warning").length,
      blind: packChecks.filter(check => check.status === "blind").length,
      learning: packChecks.filter(check => check.status === "learning").length,
    };
  });
}

function summarizeChecks(checks: BusinessRadarCheck[]): ClientRadarSnapshot["totals"] {
  return {
    total: checks.length,
    live: checks.filter(check => check.status !== "inactive").length,
    passed: checks.filter(check => check.status === "pass").length,
    critical: checks.filter(check => check.status === "critical").length,
    warning: checks.filter(check => check.status === "warning").length,
    watch: checks.filter(check => check.status === "watch").length,
    blind: checks.filter(check => check.status === "blind").length,
    learning: checks.filter(check => check.status === "learning").length,
    inactive: checks.filter(check => check.status === "inactive").length,
  };
}

function confidenceWeight(status: RadarCheckStatus): number {
  if (status === "inactive") return 0;
  if (status === "blind") return 0;
  if (status === "learning") return 0.25;
  if (status === "watch") return 0.6;
  return 1;
}

function statusScore(status: RadarCheckStatus): number {
  if (status === "pass") return 100;
  if (status === "watch") return 70;
  if (status === "warning") return 40;
  if (status === "critical") return 10;
  return 0;
}

function severityRank(severity: BusinessRadarIssue["severity"]): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

function relativeAge(milliseconds: number): string {
  if (milliseconds < 3_600_000) return `${Math.max(0, Math.round(milliseconds / 60_000))}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / 3_600_000)}h`;
  return `${Math.round(milliseconds / DAY)}d`;
}

function newest(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return valid.length ? Math.max(...valid) : undefined;
}

function isSystemProduct(key?: PortalProductKey): boolean {
  return key === "website" || key === "automation" || key === "custom-software" || key === "ongoing-care" || key === "health-check" || key === "business-os";
}

function isMarketingProduct(key?: PortalProductKey): boolean {
  return key === "content" || key === "google-profile" || key === "social-ads";
}

function domainForHref(href: string): AdvisorDomain {
  if (href.includes("tab=finance")) return "finance";
  if (href.includes("tab=marketing")) return "marketing";
  if (href.includes("tab=systems")) return "development";
  if (href.includes("tab=portal") || href.includes("tab=delivery")) return "delivery";
  if (href.includes("inbox") || href.includes("communication")) return "inbox";
  return "clients";
}
