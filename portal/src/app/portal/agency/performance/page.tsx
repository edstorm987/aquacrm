import { requireRole } from "@/lib/server/auth";
import { summarizeClientTelemetry, type ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { cleanPortalProducts } from "@/lib/portalProducts";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { listClientMilestones } from "@/server/clientMilestones";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { phaseLabel } from "@/server/phases";
import { PerformanceWorkspace, type PerformanceClient } from "./_PerformanceWorkspace";
import { buildPerformanceAnalytics, type PerformanceEvent } from "@/lib/performanceAnalytics";
import { ensureAgencyWebsite, summarizeAgencyWebsite } from "@/server/agencyWebsite";
import { listPerformanceExperiments } from "@/server/performanceExperiments";

interface StoredProperty {
  id: string;
  label: string;
  kind: string;
  status: string;
  repoUrl?: string;
  liveUrl?: string;
  previewUrl?: string;
  tagStatus?: string;
  repositoryStatus?: string;
  deploymentStatus?: string;
  lastDeployedAt?: number;
}

interface StoredFile {
  category?: string;
}

interface StoredApproval {
  status?: string;
}

interface StoredRequest {
  status?: string;
}

export default async function PerformancePage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId).filter(client => client.status === "active");
  const milestones = listClientMilestones(session.agencyId);
  const money = new Map<string, { revenueCents: number; costCents: number }>();
  let agencyRevenueCents = 0;
  let agencyCostCents = 0;
  const financeInstall = getInstall({ agencyId: session.agencyId }, "agency-finance");

  if (financeInstall?.enabled) {
    try {
      ensureAgencyFinanceFoundationRegistered();
      const finance = containerFor({
        agencyId: session.agencyId,
        storage: makePluginStorage(financeInstall.id) as never,
      });
      const [invoices, expenses] = await Promise.all([finance.invoices.list(), finance.expenses.list()]);
      agencyRevenueCents = invoices.filter(invoice => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.totalCents, 0);
      agencyCostCents = expenses.filter(expense => expense.status === "reimbursed").reduce((sum, expense) => sum + expense.amountCents, 0);
      for (const client of clients) {
        const revenueCents = invoices
          .filter(invoice => invoice.clientId === client.id && invoice.status === "paid")
          .reduce((sum, invoice) => sum + invoice.totalCents, 0);
        const costCents = expenses
          .filter(expense => expense.clientId === client.id && expense.status === "reimbursed")
          .reduce((sum, expense) => sum + expense.amountCents, 0);
        money.set(client.id, { revenueCents, costCents });
      }
    } catch {
      // Performance remains useful before Finance has any records.
    }
  }

  const experiments = listPerformanceExperiments(session.agencyId);
  const rows: PerformanceClient[] = clients.map(client => {
    const metadata = client.metadata ?? {};
    const clientMilestones = milestones.filter(item => item.clientId === client.id);
    const telemetryEvents = Array.isArray(metadata.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : [];
    const telemetry = summarizeClientTelemetry(telemetryEvents);
    const products = cleanPortalProducts(metadata.portalProducts);
    const properties = Array.isArray(metadata.properties) ? metadata.properties as StoredProperty[] : [];
    const files = Array.isArray(metadata.files) ? metadata.files as StoredFile[] : [];
    const approvals = Array.isArray(metadata.portalApprovals) ? metadata.portalApprovals as StoredApproval[] : [];
    const requests = Array.isArray(metadata.clientRequests) ? metadata.clientRequests as StoredRequest[] : [];
    const healthNotes = [
      !client.ownerEmail ? "Account email missing" : null,
      !metadata.leadSource ? "Source missing" : null,
      telemetry.errors24h > 0 ? `${telemetry.errors24h} live error${telemetry.errors24h === 1 ? "" : "s"}` : null,
      clientMilestones.some(item => item.status === "blocked") ? "Milestone blocked" : null,
      clientMilestones.some(item => item.targetAt && item.targetAt < Date.now() && item.status !== "complete") ? "Milestone overdue" : null,
    ].filter((note): note is string => Boolean(note));
    const finance = money.get(client.id) ?? { revenueCents: 0, costCents: 0 };
    return {
      id: client.id,
      scope: "client",
      name: client.name,
      stage: phaseLabel(client.stage),
      stageProgress: stageProgress(client.stage),
      health: healthNotes.length ? "attention" : "healthy",
      healthNotes,
      revenueCents: finance.revenueCents,
      costCents: finance.costCents,
      pageviews24h: telemetry.pageviews24h,
      errors24h: telemetry.errors24h,
      averageLoadMs: telemetry.averageLoadMs,
      lastSeenAt: telemetry.lastSeenAt,
      deployments30d: telemetry.deployments30d,
      products: products.map(product => ({
        id: product.id,
        name: product.name,
        catalogKey: product.catalogKey,
      })),
      properties: properties.map(property => {
        const propertyEvents = telemetryEvents.filter(event => eventMatchesProperty(event, property));
        const propertyTelemetry = summarizeClientTelemetry(propertyEvents);
        return {
          ...property,
          pageviews24h: propertyTelemetry.pageviews24h,
          errors24h: propertyTelemetry.errors24h,
          deployments30d: propertyTelemetry.deployments30d,
          averageLoadMs: propertyTelemetry.averageLoadMs,
          lastSeenAt: propertyTelemetry.lastSeenAt,
          heartbeats24h: propertyEvents.filter(event => event.type === "heartbeat" && event.occurredAt >= Date.now() - 86_400_000).length,
        };
      }),
      files: {
        total: files.length,
        brand: files.filter(file => file.category === "brand").length,
        inspiration: files.filter(file => file.category === "inspiration").length,
        feedback: files.filter(file => file.category === "design-feedback").length,
        deliverables: files.filter(file => file.category === "deliverable" || file.category === "preview").length,
      },
      approvals: {
        pending: approvals.filter(item => item.status === "pending").length,
        approved: approvals.filter(item => item.status === "approved").length,
        changesRequested: approvals.filter(item => item.status === "changes-requested").length,
      },
      requests: {
        open: requests.filter(item => item.status === "open" || item.status === "reviewed").length,
        closed: requests.filter(item => item.status === "closed").length,
      },
      milestones: clientMilestones,
      analyticsByPeriod: analyticsByPeriod(telemetryEvents),
      experiments: experiments.filter(experiment => experiment.clientId === client.id),
    };
  });

  const ownWebsite = ensureAgencyWebsite(session.agencyId);
  const ownSummary = summarizeAgencyWebsite(ownWebsite);
  const ownHealthNotes = ownSummary.errors24h > 0 ? [`${ownSummary.errors24h} live website error${ownSummary.errors24h === 1 ? "" : "s"}`] : [];
  const own: PerformanceClient = {
    id: "aquaoasis-web",
    scope: "agency",
    name: "AquaOasis-Web",
    stage: ownWebsite.status === "live" ? "Live website" : ownWebsite.status === "maintenance" ? "Maintenance" : "Redesign gate",
    stageProgress: ownWebsite.status === "live" ? 100 : 70,
    health: ownHealthNotes.length ? "attention" : "healthy",
    healthNotes: ownHealthNotes,
    revenueCents: agencyRevenueCents,
    costCents: agencyCostCents,
    pageviews24h: ownSummary.pageviews24h,
    errors24h: ownSummary.errors24h,
    averageLoadMs: ownSummary.averageLoadMs,
    lastSeenAt: ownSummary.lastSeenAt,
    deployments30d: ownSummary.deployments30d,
    products: [{ id: "aquaoasis-web", name: "AquaOasis-Web platform", catalogKey: "website" }],
    properties: [{
      id: "aquaoasis-web",
      label: "AquaOasis-Web platform",
      kind: "website",
      status: ownWebsite.status,
      repoUrl: ownWebsite.repositoryUrl,
      liveUrl: ownWebsite.productionUrl,
      previewUrl: ownWebsite.previewUrl,
      tagStatus: ownWebsite.telemetryLastSeenAt ? "installed" : "planned",
      pageviews24h: ownSummary.pageviews24h,
      errors24h: ownSummary.errors24h,
      deployments30d: ownSummary.deployments30d,
      averageLoadMs: ownSummary.averageLoadMs,
      lastSeenAt: ownSummary.lastSeenAt,
      heartbeats24h: ownWebsite.telemetryEvents.filter(event => event.type === "heartbeat" && event.occurredAt >= Date.now() - 86_400_000).length,
    }],
    files: { total: 0, brand: 0, inspiration: 0, feedback: 0, deliverables: 0 },
    approvals: { pending: 0, approved: 0, changesRequested: 0 },
    requests: { open: 0, closed: 0 },
    milestones: [],
    analyticsByPeriod: analyticsByPeriod(ownWebsite.telemetryEvents),
    experiments: experiments.filter(experiment => !experiment.clientId),
  };

  return <PerformanceWorkspace initialClients={[own, ...rows]} />;
}

function analyticsByPeriod(events: PerformanceEvent[]): PerformanceClient["analyticsByPeriod"] {
  return {
    "7": buildPerformanceAnalytics(events, 7),
    "28": buildPerformanceAnalytics(events, 28),
    "90": buildPerformanceAnalytics(events, 90),
  };
}

function eventMatchesProperty(event: ClientTelemetryEvent, property: StoredProperty): boolean {
  if (event.propertyId === property.id) return true;
  const eventHost = safeHost(event.url);
  if (!eventHost) return false;
  return [property.liveUrl, property.previewUrl].some(url => safeHost(url) === eventHost);
}

function safeHost(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function stageProgress(stage: string): number {
  const progress: Record<string, number> = {
    lead: 5,
    discovery: 12,
    onboarding: 20,
    "aqua-epic-intro": 20,
    "aqua-blueprint": 35,
    "aqua-diagnostics": 50,
    design: 60,
    "aqua-brand-builder": 65,
    development: 75,
    "aqua-traffic": 82,
    live: 100,
    "aqua-mastery": 100,
    churned: 100,
  };
  return progress[stage] ?? 0;
}
