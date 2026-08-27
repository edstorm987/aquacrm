import "server-only";

import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import { calculateClientAquaHealth } from "@/lib/clients/clientAquaHealth";
import { buildClientRadarSnapshot, type ClientRadarInput } from "@/engines/data/radar/clientRadar";
import { cleanClientMarketingService } from "@/lib/clients/clientMarketingService";
import { cleanClientPaymentPlans, summariseClientPaymentPosition } from "@/lib/clients/clientPaymentPlans";
import { cleanClientRequests } from "@/lib/clients/clientRequests";
import { clientServiceCapabilities, inheritedClientServiceKeys } from "@/lib/clients/clientServiceWorkspace";
import type { ClientRadarSnapshot } from "@/engines/data/radar/businessRadar";
import type { ClientContract } from "@/lib/clients/clientContracts";
import type { ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { portalWorkspaceProgress } from "@/lib/portal/portalProductWorkspaces";
import type { RadarTelemetrySnapshot } from "@/engines/data/server/radar/radarTelemetry";
import { buildRadarTelemetrySnapshot } from "@/engines/data/server/radar/radarTelemetry";
import { listAgencyProducts } from "@/server/agencyProducts";
import { listClientMilestones } from "@/server/clientMilestones";
import { getInstall } from "@/server/pluginInstalls";
import { clientProductWorkspaces } from "@/server/productWorkspaces";
import { getState } from "@/server/storage";
import { getClientForAgency, listClients } from "@/server/tenants";
import type { Client } from "@/server/types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";

interface ClientRadarFleetOptions {
  now?: number;
  clients?: Client[];
  operationalAlerts?: Awaited<ReturnType<typeof listOperationalAlerts>>;
  telemetry?: RadarTelemetrySnapshot;
}

interface RadarInvoice {
  id: string;
  number: string;
  clientId?: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void" | "partially-refunded" | "refunded";
  dueAt: number;
  paidAt?: number;
  totalCents: number;
  currency: string;
}

export async function buildClientRadarFleet(
  agencyId: string,
  options: ClientRadarFleetOptions = {},
): Promise<ClientRadarSnapshot[]> {
  const now = options.now ?? Date.now();
  const clients = options.clients ?? listClients(agencyId, { includeArchived: true });
  const alerts = options.operationalAlerts ?? await listOperationalAlerts(agencyId, now);
  const state = getState();
  const telemetry = options.telemetry ?? buildRadarTelemetrySnapshot(
    state.agencyWebsites[agencyId],
    clients,
    state.radarSyntheticProbes[agencyId] ?? {},
    now,
  );
  const invoices = await listRadarInvoices(agencyId);
  const products = listAgencyProducts(agencyId, true);
  const milestones = listClientMilestones(agencyId);
  const evidence = state.radarEvidence[agencyId];

  return clients.map(client => {
    const metadata = client.metadata ?? {};
    const assignments = resolvePortalProductAssignment(metadata, products).products;
    const workspaces = new Map(clientProductWorkspaces(client).map(workspace => [workspace.productId, workspace]));
    const productById = new Map(products.map(product => [product.id, product]));
    const inheritedKeys = inheritedClientServiceKeys(assignments, products);
    const capabilities = clientServiceCapabilities(assignments, inheritedKeys);
    const clientInvoices = invoices.filter(invoice => invoice.clientId === client.id);
    const requests = cleanClientRequests(metadata.clientRequests);
    const contracts = cleanContracts(metadata.contracts);
    const clientProperties = telemetry.properties.filter(property => property.clientId === client.id);
    const marketing = cleanClientMarketingService(metadata.clientMarketingService);
    const input: ClientRadarInput = {
      now,
      client: {
        id: client.id,
        name: client.name,
        status: client.status,
        stage: client.stage,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        ownerEmail: client.ownerEmail,
        portalEmail: stringValue(metadata.portalLoginEmail) || stringValue(metadata.clientEmail),
        companyId: client.companyId,
      },
      aquaHealth: calculateClientAquaHealth({
        now,
        financeConnected: Boolean(getInstall({ agencyId }, "agency-finance")?.enabled),
        invoices: clientInvoices,
        lastContactedAt: numberValue(metadata.lastContactedAt),
        requestsObserved: Array.isArray(metadata.clientRequests),
        requests,
        contracts,
        telemetryEvents: Array.isArray(metadata.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : undefined,
      }),
      products: assignments.map(assignment => {
        const configured = productById.get(assignment.id);
        const workspace = workspaces.get(assignment.id);
        const pages = workspace ? Object.values(workspace.pages) : [];
        const outputs = pages.flatMap(page => page.outputs);
        const decisions = workspace?.decisions ?? [];
        return {
          id: assignment.id,
          name: assignment.name,
          key: assignment.catalogKey ?? configured?.portalTemplateKey,
          requiresPortal: configured?.portalRequirement !== "none",
          deliverableCount: configured?.deliverables.length ?? assignment.deliverables.length,
          workspace: workspace ? {
            progress: portalWorkspaceProgress(workspace),
            pendingDecisions: decisions.filter(decision => decision.status === "pending").length,
            blockedDecisions: decisions.filter(decision => decision.status === "changes-requested").length,
            outputCount: outputs.length,
            readyOutputs: outputs.filter(output => output.status === "ready" || output.status === "approved").length,
            lastUpdatedAt: workspace.updatedAt,
          } : undefined,
        };
      }),
      properties: clientProperties.map(property => ({
        id: property.id,
        label: property.label,
        expectedLive: property.expectedLive,
        tagDeclared: property.tagDeclared,
        lastSeenAt: property.lastSeenAt,
        errors24h: property.errors24h,
        averageLoadMs: property.averageLoadMs,
        syntheticOk: property.syntheticProbe?.ok,
      })),
      milestones: milestones.filter(milestone => milestone.clientId === client.id).map(milestone => ({
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        targetAt: milestone.targetAt,
        updatedAt: milestone.updatedAt,
      })),
      alerts: alerts.filter(alert => alert.clientId === client.id).map(alert => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        href: alert.href,
        occurredAt: alert.occurredAt,
      })),
      financeConnected: Boolean(getInstall({ agencyId }, "agency-finance")?.enabled),
      paymentPosition: summariseClientPaymentPosition(cleanClientPaymentPlans(metadata.clientPaymentPlans), clientInvoices, now),
      invoices: clientInvoices,
      requestsObserved: Array.isArray(metadata.clientRequests),
      requests,
      contracts,
      portal: {
        expected: assignments.some(assignment => productById.get(assignment.id)?.portalRequirement !== "none"),
        builtAt: numberValue(metadata.portalBuiltAt),
        accessEmail: stringValue(metadata.portalLoginEmail) || stringValue(metadata.clientEmail) || client.ownerEmail,
        accessSentAt: numberValue(metadata.portalAccessSentAt),
        pendingApprovals: recordArray(metadata.portalApprovals).filter(approval => approval.status === "pending").length,
        sharedFiles: recordArray(metadata.files).filter(file => file.customerVisible !== false).length,
      },
      marketing: capabilities.marketing || marketing.enabled ? {
        enabled: marketing.enabled,
        attentionProfiles: marketing.profiles.filter(profile => profile.status === "attention").length,
        pendingApprovals: marketing.content.filter(item => item.approval === "pending").length + marketing.campaigns.filter(item => item.approval === "pending").length,
        activeCampaigns: marketing.campaigns.filter(campaign => campaign.status === "active" || campaign.status === "scheduled").length,
        campaignsOverBudget: marketing.campaigns.filter(campaign => campaign.budgetCents > 0 && campaign.spendCents > campaign.budgetCents).length,
        campaignsWithoutLeads: marketing.campaigns.filter(campaign => campaign.budgetCents > 0 && campaign.spendCents >= campaign.budgetCents * 0.5 && campaign.leads === 0).length,
        updatedAt: marketing.updatedAt,
      } : undefined,
      lastContactedAt: numberValue(metadata.lastContactedAt),
      lastRecordedAt: evidence?.lastRecordedAt,
    };
    return attachEvidenceHistory(buildClientRadarSnapshot(input), evidence?.series ?? {});
  });
}

export async function buildClientRadar(
  agencyId: string,
  clientId: string,
  options: Omit<ClientRadarFleetOptions, "clients"> = {},
): Promise<ClientRadarSnapshot | null> {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  return (await buildClientRadarFleet(agencyId, { ...options, clients: [client] }))[0] ?? null;
}

async function listRadarInvoices(agencyId: string): Promise<RadarInvoice[]> {
  const financeInstall = getInstall({ agencyId }, "agency-finance");
  if (!financeInstall?.enabled) return [];
  try {
    const invoices = await containerFor({ agencyId, storage: makePluginStorage(financeInstall.id), install: financeInstall }).invoices.list();
    return invoices.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      clientId: invoice.clientId,
      status: invoice.status,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
    }));
  } catch {
    return [];
  }
}

function attachEvidenceHistory(
  snapshot: ClientRadarSnapshot,
  series: ReturnType<typeof getState>["radarEvidence"][string]["series"],
): ClientRadarSnapshot {
  return {
    ...snapshot,
    checks: snapshot.checks.map(check => {
      const history = series[`${check.domain}:${check.familyId}`];
      return {
        ...check,
        previousValue: history?.points.at(-1)?.value,
        historySamples: history?.totalSamples ?? 0,
        historySpanMs: history?.firstSeenAt && history.lastSeenAt ? Math.max(0, history.lastSeenAt - history.firstSeenAt) : 0,
      };
    }),
  };
}

function cleanContracts(value: unknown): ClientContract[] {
  return Array.isArray(value) ? value.filter((contract): contract is ClientContract => Boolean(contract && typeof contract === "object" && typeof contract.id === "string" && typeof contract.status === "string")) : [];
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
