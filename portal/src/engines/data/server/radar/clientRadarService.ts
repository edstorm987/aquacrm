import "server-only";

import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import { calculateClientAquaHealth } from "@/lib/clients/clientAquaHealth";
import {
  buildClientRadarSnapshot,
  type ClientRadarElement,
  type ClientRadarInput,
  type ClientRadarVisibility,
} from "@/engines/data/radar/clientRadar";
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
import type { Client, RadarSyntheticProbeResult } from "@/server/types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  currentClientWorkspaceElementAccess,
  type ClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";

interface ClientRadarFleetOptions {
  now?: number;
  clients?: Client[];
  operationalAlerts?: Awaited<ReturnType<typeof listOperationalAlerts>>;
  telemetry?: RadarTelemetrySnapshot;
  /** Present for actor-scoped client reads; omitted for trusted whole-business aggregation. */
  visibility?: ClientRadarVisibility;
}

const CLIENT_RADAR_ACCESS_ELEMENTS = {
  overview: "client.overview",
  relationship: "client.relationship",
  fulfilment: "client.fulfilment",
  marketing: "client.marketing",
  systems: "client.systems",
  commercial: "client.commercial",
  communications: "client.communications",
  portal: "client.portal",
} as const;

export function clientRadarVisibilityForAccess(access: ClientWorkspaceElementAccess): ClientRadarVisibility {
  const visible = (element: (typeof CLIENT_RADAR_ACCESS_ELEMENTS)[keyof typeof CLIENT_RADAR_ACCESS_ELEMENTS]) =>
    clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(access, element), "view");
  return {
    overview: visible(CLIENT_RADAR_ACCESS_ELEMENTS.overview),
    relationship: visible(CLIENT_RADAR_ACCESS_ELEMENTS.relationship),
    fulfilment: visible(CLIENT_RADAR_ACCESS_ELEMENTS.fulfilment),
    marketing: visible(CLIENT_RADAR_ACCESS_ELEMENTS.marketing),
    systems: visible(CLIENT_RADAR_ACCESS_ELEMENTS.systems),
    commercial: visible(CLIENT_RADAR_ACCESS_ELEMENTS.commercial),
    communications: visible(CLIENT_RADAR_ACCESS_ELEMENTS.communications),
    portal: visible(CLIENT_RADAR_ACCESS_ELEMENTS.portal),
  };
}

export interface RadarInvoice {
  id: string;
  number: string;
  clientId?: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void" | "partially-refunded" | "refunded";
  dueAt: number;
  paidAt?: number;
  totalCents: number;
  currency: string;
}

export interface ClientRadarInvoiceEvidence {
  connected: boolean;
  available: boolean;
  invoices: RadarInvoice[];
}

export async function buildClientRadarFleet(
  agencyId: string,
  options: ClientRadarFleetOptions = {},
): Promise<ClientRadarSnapshot[]> {
  const now = options.now ?? Date.now();
  const clients = options.clients ?? listClients(agencyId, { includeArchived: true });
  const visibility = options.visibility;
  const visible = (element: ClientRadarElement) => visibility?.[element] ?? true;
  const actorScopedRead = visibility !== undefined;
  // Operational-alert synthesis is an agency-wide collector. A client-scoped
  // request must not trigger that collector; trusted Business Radar callers can
  // still inject their already-authorized alert set through `operationalAlerts`.
  const alerts = options.operationalAlerts ?? (actorScopedRead ? [] : await listOperationalAlerts(agencyId, now));
  const state = getState();
  const telemetry = options.telemetry ?? (visible("systems")
    ? buildRadarTelemetrySnapshot(
        actorScopedRead ? undefined : state.agencyWebsites[agencyId],
        clients,
        actorScopedRead ? clientProbeResults(state.radarSyntheticProbes[agencyId] ?? {}, clients) : state.radarSyntheticProbes[agencyId] ?? {},
        now,
      )
    : emptyTelemetry());
  const invoiceEvidence = visible("commercial")
    ? await listRadarInvoices(agencyId, clients.length === 1 ? clients[0]?.id : undefined)
    : { connected: false, available: true, invoices: [] };
  const needsProductEvidence = visible("fulfilment") || visible("portal") || visible("marketing");
  const products = needsProductEvidence ? listAgencyProducts(agencyId, true) : [];
  const milestones = visible("fulfilment")
    ? listClientMilestones(agencyId, clients.length === 1 ? clients[0]?.id : undefined)
    : [];
  const evidence = state.radarEvidence[agencyId];

  return clients.map(client => {
    const metadata = client.metadata ?? {};
    const assignments = needsProductEvidence ? resolvePortalProductAssignment(metadata, products).products : [];
    const workspaces = new Map<string, ReturnType<typeof clientProductWorkspaces>[number]>(
      visible("fulfilment")
        ? clientProductWorkspaces(client).map(workspace => [workspace.productId, workspace] as const)
        : [],
    );
    const productById = new Map(products.map(product => [product.id, product]));
    const inheritedKeys = inheritedClientServiceKeys(assignments, products);
    const capabilities = clientServiceCapabilities(assignments, inheritedKeys);
    const clientInvoices = visible("commercial")
      ? invoiceEvidence.invoices.filter(invoice => invoice.clientId === client.id)
      : [];
    const requests = visible("communications") ? cleanClientRequests(metadata.clientRequests) : [];
    const contracts = visible("commercial") ? cleanContracts(metadata.contracts) : [];
    const clientProperties = visible("systems")
      ? telemetry.properties.filter(property => property.clientId === client.id)
      : [];
    const marketing = visible("marketing")
      ? cleanClientMarketingService(metadata.clientMarketingService)
      : cleanClientMarketingService(undefined);
    const compositeHealthVisible = visible("relationship")
      && visible("commercial")
      && visible("communications")
      && visible("systems")
      && visible("marketing");
    const input: ClientRadarInput = {
      now,
      visibility,
      client: {
        id: client.id,
        name: client.name,
        status: client.status,
        stage: client.stage,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        ownerEmail: visible("communications") ? client.ownerEmail : undefined,
        portalEmail: visible("communications") ? stringValue(metadata.portalLoginEmail) || stringValue(metadata.clientEmail) : undefined,
        companyId: visible("overview") ? client.companyId : undefined,
      },
      aquaHealth: calculateClientAquaHealth({
        now,
        financeConnected: compositeHealthVisible && invoiceEvidence.connected,
        financeAvailable: compositeHealthVisible ? invoiceEvidence.available : true,
        invoices: clientInvoices,
        lastContactedAt: compositeHealthVisible ? numberValue(metadata.lastContactedAt) : undefined,
        requestsObserved: compositeHealthVisible && Array.isArray(metadata.clientRequests),
        requests,
        contracts,
        telemetryEvents: compositeHealthVisible && Array.isArray(metadata.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : undefined,
      }),
      products: visible("fulfilment") ? assignments.map(assignment => {
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
      }) : [],
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
        element: clientRadarElementForHref(alert.href),
      })),
      financeConnected: invoiceEvidence.connected,
      financeAvailable: invoiceEvidence.available,
      paymentPosition: visible("commercial") && invoiceEvidence.available
        ? summariseClientPaymentPosition(cleanClientPaymentPlans(metadata.clientPaymentPlans), clientInvoices, now)
        : undefined,
      invoices: clientInvoices,
      requestsObserved: visible("communications") && Array.isArray(metadata.clientRequests),
      requests,
      contracts,
      portal: visible("portal") ? {
        expected: assignments.some(assignment => productById.get(assignment.id)?.portalRequirement !== "none"),
        builtAt: numberValue(metadata.portalBuiltAt),
        accessEmail: stringValue(metadata.portalLoginEmail) || stringValue(metadata.clientEmail) || client.ownerEmail,
        accessSentAt: numberValue(metadata.portalAccessSentAt),
        pendingApprovals: recordArray(metadata.portalApprovals).filter(approval => approval.status === "pending").length,
        sharedFiles: recordArray(metadata.files).filter(file => file.customerVisible !== false).length,
      } : { expected: false, pendingApprovals: 0, sharedFiles: 0 },
      marketing: visible("marketing") && (capabilities.marketing || marketing.enabled) ? {
        enabled: marketing.enabled,
        attentionProfiles: marketing.profiles.filter(profile => profile.status === "attention").length,
        pendingApprovals: marketing.content.filter(item => item.approval === "pending").length + marketing.campaigns.filter(item => item.approval === "pending").length,
        activeCampaigns: marketing.campaigns.filter(campaign => campaign.status === "active" || campaign.status === "scheduled").length,
        campaignsOverBudget: marketing.campaigns.filter(campaign => campaign.budgetCents > 0 && campaign.spendCents > campaign.budgetCents).length,
        campaignsWithoutLeads: marketing.campaigns.filter(campaign => campaign.budgetCents > 0 && campaign.spendCents >= campaign.budgetCents * 0.5 && campaign.leads === 0).length,
        updatedAt: marketing.updatedAt,
      } : undefined,
      lastContactedAt: visible("relationship") ? numberValue(metadata.lastContactedAt) : undefined,
      // The vault timestamp belongs to the whole agency sweep. Per-client
      // readers may receive history for their visible check IDs, but not that
      // organisation-wide activity timestamp.
      lastRecordedAt: actorScopedRead ? undefined : evidence?.lastRecordedAt,
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
  // Unlike the fleet builder, this function backs actor-facing RSCs as well as
  // the API. Never interpret an omitted projection as whole-business access.
  // Callers already holding an access resolution may pass `visibility` to
  // avoid resolving the same actor twice.
  const visibility = options.visibility ?? clientRadarVisibilityForAccess(
    (await currentClientWorkspaceElementAccess(clientId)).access,
  );
  return (await buildClientRadarFleet(agencyId, { ...options, clients: [client], visibility }))[0] ?? null;
}

async function listRadarInvoices(agencyId: string, clientId?: string): Promise<ClientRadarInvoiceEvidence> {
  const financeInstall = getInstall({ agencyId }, "agency-finance");
  return readClientRadarInvoiceEvidence(Boolean(financeInstall?.enabled), async () => {
    if (!financeInstall?.enabled) return [];
    const invoices = await containerFor({ agencyId, storage: makePluginStorage(financeInstall.id), install: financeInstall }).invoices.list(clientId ? { clientId } : undefined);
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
  });
}

function clientProbeResults(
  probes: Record<string, RadarSyntheticProbeResult>,
  clients: readonly Client[],
): Record<string, RadarSyntheticProbeResult> {
  const prefixes = clients.map(client => `${client.id}:`);
  return Object.fromEntries(Object.entries(probes).filter(([key]) => prefixes.some(prefix => key.startsWith(prefix))));
}

function emptyTelemetry(): RadarTelemetrySnapshot {
  return {
    properties: [],
    issues: [],
    totals: {
      properties: 0,
      expectedProperties: 0,
      connectedTags: 0,
      staleTags: 0,
      pageviews24h: 0,
      pageviews7d: 0,
      previousPageviews7d: 0,
      forms24h: 0,
      forms7d: 0,
      conversions7d: 0,
      errors24h: 0,
      heartbeats24h: 0,
      trafficSurges: 0,
      trafficDrops: 0,
      slowProperties: 0,
      searchImpressions28d: 0,
      searchClicks28d: 0,
    },
  };
}

function clientRadarElementForHref(href: string): ClientRadarElement | undefined {
  if (/([?&]tab=|\/)(finance|commercial)(?:&|$|\/)/.test(href)) return "commercial";
  if (/([?&]tab=|\/)(communications|inbox)(?:&|$|\/)/.test(href)) return "communications";
  if (/([?&]tab=|\/)(delivery|fulfilment|projects?)(?:&|$|\/)/.test(href)) return "fulfilment";
  if (/([?&]tab=|\/)(marketing|campaigns?)(?:&|$|\/)/.test(href)) return "marketing";
  if (/([?&]tab=|\/)(systems|development|technical)(?:&|$|\/)/.test(href)) return "systems";
  if (/([?&]tab=|\/)(portal|approvals?)(?:&|$|\/)/.test(href)) return "portal";
  if (/([?&]tab=|\/)(relationship)(?:&|$|\/)/.test(href)) return "relationship";
  return undefined;
}

/**
 * Preserve the difference between a confirmed empty Finance result and a read
 * that never completed. Radar can stay available while marking Finance blind.
 */
export async function readClientRadarInvoiceEvidence(
  connected: boolean,
  read: () => Promise<RadarInvoice[]>,
): Promise<ClientRadarInvoiceEvidence> {
  if (!connected) return { connected: false, available: true, invoices: [] };
  try {
    return { connected: true, available: true, invoices: await read() };
  } catch {
    return { connected: true, available: false, invoices: [] };
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
