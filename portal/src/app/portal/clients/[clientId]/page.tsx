// Per-client overview — /portal/clients/[clientId].
//
// One canonical client record with contextual lenses for relationship,
// delivery, technical operations, finance, communications, and portal work.
//
// Server-rendered: every tab's content is computed here so deep-links
// (e.g. `?tab=systems`) hydrate with full data. The "+ Add system"
// picker on the Systems tab is the only client-side mutating UI.

import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth/auth";
import { isAgencyRole } from "@/server/types";
import { getAgency, getClientForAgency, listClients } from "@/server/tenants";
import { clientRelationshipId, listClientRelationshipWorkspaces } from "@/server/clientRelationships";
import { listInstalledFor } from "@/server/pluginInstalls";
import { listActivity } from "@/server/activity";
import { phaseLabel, listPhasesForAgency } from "@/server/phases";
import { listPlugins } from "@/built-ins/runtime/_registry";
import { SURFACE_ROLE_CEILING } from "@/built-ins/runtime/_pageScope";
import type { TabId } from "./_tabs";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { toolCopy } from "./toolCopy";
import { BuildPortalWizard, type WizardPlugin } from "./_BuildPortalWizard";
import { ClientSopsTab } from "./_ClientSopsTab";
import { KanbanTabClient } from "./_KanbanTabClient";
import { CommsRow } from "./_CommsRow";
import { FilesTabClient, type FileCategory } from "./_FilesTabClient";
import { FinanceTabClient } from "./_FinanceTabClient";
import type { ClientContract, ClientContractTemplate } from "@/lib/clients/clientContracts";
import type { ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { listContractTemplates } from "@/server/contractTemplates";
import { agencyProductsForRead, listAgencyProducts, productStatus } from "@/server/agencyProducts";
import { PropertiesTabClient, type ClientProperty } from "./_PropertiesTabClient";
import { ClientSystemsWorkspace } from "./_ClientSystemsWorkspace";
import { ClientTagWorkspace } from "./_ClientTagWorkspace";
import { FulfilmentPortalPreview, type CustomerPortalMode } from "./_FulfilmentPortalPreview";
import { ClientPortalConnections } from "./_ClientPortalConnections";
import { describePortalConnection, listPortalConnections } from "@/server/portalConnectionStore";
import { connectionLinkOrigin } from "@/lib/server/portal/portalConnections";
import { PhaseTransitionButton } from "./_PhaseTransitionButton";
import { ClientRequestsPanel } from "./_ClientRequestsPanel";
import type { ClientRequest } from "@/app/api/tenants/client-requests/route";
import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import { assertSopsAccess, familiesForStage, SopsAccessError } from "@/lib/server/sopsAccess";
import { RequirePermission } from "@/lib/server/RequirePermission";
import { OnboardingDashboardPanel, type OnboardingPhase } from "./_OnboardingDashboardPanel";
import { customerVisibleInvoices, loadCustomerPortalData } from "@/app/portal/customer/_portalData";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { resolveClientPortalProvider } from "@/lib/server/clients/clientPortalProvider";
import { isGitHubPublishingConfiguredForAgency } from "@/lib/server/integrations/githubProjectPublisher";
import { isVercelProjectDeploymentConfiguredForAgency } from "@/lib/server/integrations/vercelProjectDeployer";
import { cleanClientContacts, type ClientEntityType } from "@/lib/clients/clientContacts";
import { ClientContactsPanel } from "./_ClientContactsPanel";
import { WebsiteBuilderLauncher } from "./_WebsiteBuilderLauncher";
import { ClientSpineOverview } from "./_ClientSpineOverview";
import { ClientDeliveryOverview } from "./_ClientDeliveryOverview";
import { ClientFulfilmentHub } from "./_ClientFulfilmentHub";
import { ClientServiceAssignment } from "./_ClientServiceAssignment";
import { ClientWorkspaceHeader } from "./_ClientWorkspaceHeader";
import { ClientLensHeader } from "./_ClientLensHeader";
import { ClientWorkspaceSwitcher } from "./_ClientWorkspaceSwitcher";
import { OverviewTabs } from "./_OverviewTabs";
import { ClientNotesWorkspace } from "./_ClientNotesWorkspace";
import { ClientRecordWorkspace, type ClientRecordMessage } from "./_ClientRecordWorkspace";
import { calculateClientAquaHealth } from "@/lib/clients/clientAquaHealth";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { clientServiceCapabilities, inheritedClientServiceKeys } from "@/lib/clients/clientServiceWorkspace";
import { clientProductWorkspaces } from "@/server/productWorkspaces";
import { portalWorkspaceProgress } from "@/lib/portal/portalProductWorkspaces";
import { defaultProductInternalWorkspace } from "@/lib/products/productInternalWorkspace";
import { listClientMilestones } from "@/server/clientMilestones";
import { getInstall } from "@/server/pluginInstalls";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { clientWorkspaceHref, resolveClientWorkspaceTab } from "@/lib/clients/clientWorkspace";
import { Boxes, Globe2, MonitorCog } from "lucide-react";
import { cleanClientMarketingService } from "@/lib/clients/clientMarketingService";
import { formatUkDate, formatUkDateTime, timestampFromValue } from "@/lib/shared/formatDateTime";
import { cleanClientRecordEntries } from "@/lib/clients/clientRelationshipRecord";
import { listInboxSnapshot } from "@/lib/server/inbox/inboxStore";
import { listWebsiteEnquiries, synchroniseWebsiteEnquiryIdentities } from "@/lib/server/websiteEnquiries";
import { normaliseIdentityEmail, normaliseIdentityPhone } from "@/lib/server/identityResolution";
import { listAgencyTasks } from "@/server/tasks";
import { listSops } from "@/engines/sop/server/sops";
import { canUsePeopleStation, listPeopleEmployees } from "@/server/people";
import { getUserById } from "@/server/users";
import {
  CLIENT_TAB_ELEMENT_KEYS,
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  currentClientWorkspaceElementAccess,
  visibleClientWorkspaceTabs,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import { buildClientRadar } from "@/engines/data/server/radar/clientRadarService";
import { cleanClientOperationsBrief } from "@/lib/clients/clientOperations";
import { clientVariationProductIds } from "@/lib/clients/clientProductVariations";
import { cleanClientProductProcessState } from "@/lib/clients/clientProductProcess";
import { cleanClientRequests } from "@/lib/clients/clientRequests";
import {
  clientContractLedgerEvent,
  clientInvoiceLedgerEvent,
  clientMilestoneLedgerEvent,
  clientPaymentPlanLedgerEvent,
  queryClientRecordLedger,
  synchroniseClientRecordLedger,
  type ClientRecordLedgerEventInput,
} from "@/lib/server/clients/clientRecordLedger";
import {
  cleanClientPaymentPlans,
  reconcileClientPaymentPlan,
  summariseClientPaymentPosition,
  summariseInvoicesByCurrency,
} from "@/lib/clients/clientPaymentPlans";
import type { ClientOperationOwnerOption } from "./_ClientOperationsControl";
import { ClientMarketingServiceWorkspace } from "@/components/marketing/ClientMarketingServiceWorkspace";
import {
  AQUA_PHASE_ORDER,
  AQUA_MILESTONES,
  isAquaStage,
  getMilestoneState,
  isPhaseComplete,
} from "@/lib/server/onboardingMilestones";

function accountStatusLabel(status: string): string {
  if (status === "active") return "Active relationship";
  if (status === "suspended") return "Paused relationship";
  if (status === "archived") return "Archived relationship";
  return status.replaceAll("-", " ");
}

// System set the operator typically pulls into a Live-stage custom
// portal (chapter 19b §5a). Surfaced as a one-click "Recommended for
// Live" action on the Systems tab and as the default-checked system set
// in the Build-custom-portal wizard.
const LIVE_RECOMMENDED_PLUGINS: readonly string[] = [
  "website-editor",
  "client-crm",
  "forms",
  "ecommerce",
  "memberships",
  "affiliates",
  "agency-marketing",
];

// Repo root → `04-the-final-portal/clients/<slug>/` lives two levels
// above `portal/`. We resolve from `process.cwd()` (= the portal app
// root in dev + Vercel build) and walk up.
function customPortalExists(slug: unknown): boolean {
  if (typeof slug !== "string" || !slug.trim()) return false;
  const root = process.cwd();
  const path = join(root, "..", "clients", slug.trim());
  return existsSync(path);
}

function formatRelative(ts: number): string {
  const timestamp = timestampFromValue(ts);
  if (timestamp === undefined) return "Date needs review";
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return formatUkDate(timestamp, { day: "numeric", month: "short", year: "numeric" });
}

function formatMeeting(ts: number | undefined): string | undefined {
  if (!ts) return undefined;
  return formatUkDateTime(ts);
}

export default async function ClientHome({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureHydrated();
  const { clientId } = await params;
  const sp = await searchParams;
  // WHO THIS WORKSPACE IS FOR.
  //
  // This gate was `requireRoleForClient([...ALL_ROLES], clientId)` until
  // 22 Aug 2026, which is a TENANCY question — "are you attached to this
  // client?" — standing in for an ownership one. An `end-customer` attached to
  // the client passed it, and the page they got is the internal client record:
  // the Finance tab (invoices, payment plans, the payment position), the
  // Record tab (contracts, the relationship ledger, internal notes), the
  // Commercial lens, the operator's radar and the delivery brief. None of that
  // is customer-facing, and the shopper has their own surface at
  // `/portal/customer` — the same split `_pageScope.ts` already draws for
  // every plugin page under this host, where the ceiling is exactly
  // AGENCY_ROLES ∪ CLIENT_ROLES. This is not a plugin page, so that fix could
  // not reach it; the rule is the same one, applied by hand.
  //
  // Refused rather than 404'd through `/portal`, which is the role-aware
  // router: it sends an end-customer to `/portal/customer` and a lead to the
  // login they came from, so nobody is left with nowhere to go.
  let session;
  try {
    session = await requireRoleForClient([...SURFACE_ROLE_CEILING.client], clientId);
  } catch {
    redirect("/portal");
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) notFound();

  const rawTabInput = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabId = resolveClientWorkspaceTab(rawTabInput);
  const { access: clientAccess } = await currentClientWorkspaceElementAccess(client.id);
  const accessVisibleTabs = visibleClientWorkspaceTabs(clientAccess);
  if (!accessVisibleTabs.includes(tab)) {
    const fallback = accessVisibleTabs[0];
    if (fallback) redirect(clientWorkspaceHref(client.id, fallback));
    redirect("/portal");
  }
  const activeElementLevel = clientWorkspaceElementLevel(clientAccess, CLIENT_TAB_ELEMENT_KEYS[tab]);
  const canManageClient = isAgencyRole(session.role)
    && !session.publicShowcase
    && clientWorkspaceElementAtLeast(activeElementLevel, "use");
  const canConfigureClient = isAgencyRole(session.role)
    && !session.publicShowcase
    && clientWorkspaceElementAtLeast(activeElementLevel, "manage");
  const rawSystemView = Array.isArray(sp.systemView) ? sp.systemView[0] : sp.systemView;
  const systemView = rawSystemView === "properties" || rawSystemView === "website" ? rawSystemView : "monitoring";
  const rawProductId = Array.isArray(sp.product) ? sp.product[0] : sp.product;
  const rawDeliveryMode = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  const deliveryAdvanced = rawDeliveryMode === "advanced";

  const installs = listInstalledFor({ agencyId: client.agencyId, clientId: client.id });
  const installedIds = new Set(installs.map(i => i.pluginId));
  const recentActivity = listActivity({ agencyId: client.agencyId, clientId: client.id, limit: 8 });
  const canAccessActions = canManageClient
    && (session.role !== "agency-staff" || canUsePeopleStation(session.agencyId, session.userId, "actions", false));
  const canManageOperations = canManageClient
    && (session.role !== "agency-staff" || canUsePeopleStation(session.agencyId, session.userId, "actions", true));
  const acceptedOperationSourceIds = canManageOperations
    ? listAgencyTasks(session.agencyId)
      .filter(task => task.status !== "done" && task.sourceId?.startsWith(`client:${client.id}:operation:`))
      .map(task => task.sourceId!)
    : [];

  const phases = listPhasesForAgency(client.agencyId);
  const currentPhase = phases.find(p => p.stage === client.stage);
  const meta = (client.metadata ?? {}) as {
    planTier?: "foundational" | "expansion" | "mastery";
    whatsappLink?: string;
    clientEmail?: string;
    phone?: string;
    contactPhone?: string;
    leadSource?: string;
    lastContactedAt?: number;
    stripeLink?: string;
    lockInPaid?: boolean;
    therapistName?: string;
    practiceName?: string;
    notes?: string;
    nextMeetingAt?: number;
    meetingLink?: string;
    meetingNotes?: string;
    salesPresentations?: Array<{ id: string; title: string; url: string }>;
    callRecordingUrl?: string;
    sessionNotes?: string;
    inspirationLinks?: string[];
    potentialProblems?: string;
    potentialSolutions?: string;
    pricePoints?: string;
    budgetRange?: string;
    designFeedback?: string;
    supportNotes?: string;
    portalLoginEmail?: string;
    portalMode?: CustomerPortalMode;
    portalContactName?: string;
    portalServicePlan?: string;
    portalPlanSummary?: string;
    portalPlanIncludes?: string[];
    portalProducts?: import("@/lib/portal/portalProducts").PortalProductSelection[];
    portalExperienceHeadline?: string;
    portalBillingCadence?: string;
    portalWelcomeNote?: string;
    portalWelcomeVideoUrl?: string;
    portalSupportEmail?: string;
    portalSupportPhone?: string;
    portalSupportWhatsappUrl?: string;
    portalLogoUrl?: string;
    portalAccentColor?: string;
    buyingJourney?: {
      source?: string;
      capturedAt?: number;
      meetingAt?: number;
      meetingLink?: string;
      salesPresentations?: Array<{ id: string; title: string; url: string }>;
      callRecordingUrl?: string;
      sessionNotes?: string;
      inspirationLinks?: string[];
      potentialProblems?: string;
      potentialSolutions?: string;
      pricePoints?: string;
      budgetRange?: string;
      notes?: string;
    };
    clientRequests?: ClientRequest[];
    properties?: ClientProperty[];
    portalBuiltAt?: number;
    portalAccessSentAt?: number;
    portalAccessPreparedAt?: number;
    files?: Array<{ id: string; category?: string }>;
    contracts?: ClientContract[];
    telemetryEvents?: ClientTelemetryEvent[];
    commercialPack?: {
      invoiceNumber?: string;
      invoiceStatus?: string;
      agreementStatus?: string;
      signedDocumentDataUrl?: string;
      payments?: Array<{ amountCents: number }>;
      totalCents?: number;
    };
    portalBrief?: {
      businessOverview?: string;
      primaryGoal?: string;
      idealCustomer?: string;
      mustHaves?: string;
      launchTiming?: string;
      additionalNotes?: string;
      submittedAt?: number;
      submittedBy?: string;
    };
    portalApprovals?: ClientApproval[];
    clientEntityType?: ClientEntityType;
    linkedContacts?: unknown;
    clientMarketingService?: unknown;
    clientRecordEntries?: unknown;
    clientOperations?: unknown;
    clientPaymentPlans?: unknown;
    clientProductProcess?: unknown;
    clientProductVariations?: unknown;
  };
  const PLAN_LABELS: Record<NonNullable<typeof meta.planTier>, string> = {
    foundational: "Foundational Flow",
    expansion:    "Expansion Plan",
    mastery:      "Mastery Plan",
  };
  const planLabel = meta.planTier ? PLAN_LABELS[meta.planTier] : null;
  const servicePlanLabel = meta.portalServicePlan?.trim() || planLabel;
  // One branch, because the read no longer writes (issue #21). The showcase
  // branch existed to keep a public visitor from triggering the seed, and its
  // only other effect was to hand them an UNREPAIRED catalogue — a worse view
  // of the same data, for a reason that no longer applies.
  const agencyProducts = agencyProductsForRead(session.agencyId);
  const tradingCompanies = listTradingCompanies(session.agencyId, true);
  const agencyName = getAgency(session.agencyId)?.name?.trim() || "AquaOasis-Web";
  const portalProviderName = resolveClientPortalProvider(client, { name: agencyName, mark: agencyName.charAt(0) }).name;
  const canManageRelationship = canManageClient && (
    clientAccess.source === "owner-baseline"
    || clientAccess.source === "legacy"
    || clientAccess.agencyWidePolicy
  );
  const relationshipWorkspaces = canManageRelationship
    ? listClientRelationshipWorkspaces(session.agencyId, client.id)
    : [client];
  const relationshipWorkspaceIds = new Set(relationshipWorkspaces.map(item => item.id));
  const availableRelationshipClients = canManageRelationship
    ? listClients(session.agencyId).filter(item => !relationshipWorkspaceIds.has(item.id))
    : [];
  const availableRelationshipCounts = availableRelationshipClients.reduce((counts, workspace) => {
    const relationshipId = clientRelationshipId(workspace);
    counts.set(relationshipId, (counts.get(relationshipId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const customerPortalData = await loadCustomerPortalData(
    client,
    meta.portalContactName ?? client.name,
    portalProviderName,
    { audience: "agency" },
  );
  const contractTemplates: ClientContractTemplate[] = tab === "finance"
    ? [
        ...listContractTemplates(session.agencyId),
        ...agencyProducts
          .filter(product => Boolean(product.contractBody?.trim()))
          .map(product => ({
            id: `product:${product.id}`,
            agencyId: session.agencyId,
            title: product.contractTitle?.trim() || `${product.name} agreement`,
            summary: product.description,
            body: product.contractBody!.trim(),
            status: "active" as const,
            source: "product" as const,
            createdBy: "product-library",
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          })),
      ]
    : [];

  const portalMaterialized = customPortalExists(client.slug);
  const liveRecommended = LIVE_RECOMMENDED_PLUGINS;
  const now = Date.now();
  const clientRadar = tab === "overview"
    ? await buildClientRadar(session.agencyId, client.id, { now })
    : null;
  if (tab === "overview" && !clientRadar) notFound();
  const financeInstall = getInstall({ agencyId: session.agencyId }, "agency-finance");
  const financeConnected = Boolean(financeInstall?.enabled);
  const aquaHealth = calculateClientAquaHealth({
    financeConnected,
    invoices: customerPortalData.invoices,
    lastContactedAt: meta.lastContactedAt,
    requestsObserved: Array.isArray(meta.clientRequests),
    requests: customerPortalData.requests,
    contracts: customerPortalData.contracts,
    telemetryEvents: meta.telemetryEvents,
  });
  const relationshipFinance = tab === "overview" && relationshipWorkspaces.length > 1 && financeInstall?.enabled
    ? containerFor({ agencyId: session.agencyId, storage: makePluginStorage(financeInstall.id), install: financeInstall })
    : null;
  const relationshipWorkspaceSignals = new Map(await Promise.all(relationshipWorkspaces.map(async workspace => {
    const workspaceMeta = workspace.metadata ?? {};
    const workspaceRequests = workspace.id === client.id
      ? customerPortalData.requests
      : cleanClientRequests(workspaceMeta.clientRequests);
    const workspaceContracts = workspace.id === client.id
      ? customerPortalData.contracts
      : Array.isArray(workspaceMeta.contracts) ? workspaceMeta.contracts as ClientContract[] : [];
    const workspaceInvoices = workspace.id === client.id
      ? customerPortalData.invoices
      : relationshipFinance
        ? await relationshipFinance.invoices.list({ clientId: workspace.id }).then(customerVisibleInvoices).catch(() => [])
        : [];
    const health = workspace.id === client.id
      ? aquaHealth
      : calculateClientAquaHealth({
        now,
        financeConnected,
        invoices: workspaceInvoices,
        lastContactedAt: typeof workspaceMeta.lastContactedAt === "number" ? workspaceMeta.lastContactedAt : undefined,
        requestsObserved: Array.isArray(workspaceMeta.clientRequests),
        requests: workspaceRequests,
        contracts: workspaceContracts,
        telemetryEvents: Array.isArray(workspaceMeta.telemetryEvents) ? workspaceMeta.telemetryEvents as ClientTelemetryEvent[] : undefined,
      });
    const outstandingByCurrency = summariseInvoicesByCurrency(workspaceInvoices)
      .filter(position => position.outstandingCents > 0)
      .map(position => ({ currency: position.currency, cents: position.outstandingCents }));
    const portalAccessEmail = [workspaceMeta.portalLoginEmail, workspaceMeta.clientEmail, workspace.ownerEmail]
      .find(value => typeof value === "string" && Boolean(value.trim()));
    const portalAccessState = typeof workspaceMeta.portalBuiltAt !== "number"
      ? "not-prepared" as const
      : !portalAccessEmail
        ? "missing" as const
        : typeof workspaceMeta.portalAccessSentAt === "number"
          ? "sent" as const
          : "ready" as const;
    return [workspace.id, {
      healthScore: health.score,
      healthState: health.state,
      healthConfidence: health.confidence,
      outstandingByCurrency,
      portalAccessState,
    }] as const;
  })));
  const agencyProductById = new Map(agencyProducts.map(product => [product.id, product]));
  const productAssignment = resolvePortalProductAssignment(meta, agencyProducts);
  const selectedProducts = productAssignment.products;
  const serviceCapabilities = clientServiceCapabilities(
    selectedProducts,
    inheritedClientServiceKeys(selectedProducts, agencyProducts),
  );
  const productVisibleTabs: TabId[] = [
    "overview",
    "relationship",
    "delivery",
    ...(serviceCapabilities.marketing ? ["marketing" as const] : []),
    // Systems is also the evidence destination for telemetry/availability
    // alerts. Keep it reachable before a systems service is assigned so those
    // deep links show the honest empty monitoring record.
    "systems",
    "finance",
    "communications",
    "files",
    "portal",
    "notes",
  ];
  const visibleTabs: TabId[] = productVisibleTabs.filter(candidate => accessVisibleTabs.includes(candidate));
  if (!visibleTabs.includes(tab)) {
    const fallback = visibleTabs[0];
    if (fallback) redirect(clientWorkspaceHref(client.id, fallback));
    redirect("/portal");
  }
  const relationshipContextTabs: TabId[] = ["relationship", "communications"];
  const deliveryContextTabs: TabId[] = [
    "delivery",
    ...(serviceCapabilities.marketing ? ["marketing" as const] : []),
    "systems",
    "files",
  ];
  const contextualTabs: TabId[] | null = tab === "relationship" || tab === "communications"
    ? relationshipContextTabs.filter(candidate => visibleTabs.includes(candidate))
    : tab === "delivery" || tab === "marketing" || tab === "systems" || tab === "files"
      ? deliveryContextTabs.filter(candidate => visibleTabs.includes(candidate))
      : null;
  const contextualNavLabel = tab === "relationship" || tab === "communications"
    ? "Relationship workspace"
    : "Fulfilment workspace";
  const workspacesByProduct = new Map(clientProductWorkspaces(client).map(workspace => [workspace.productId, workspace]));
  const canAccessSops = (() => {
    try {
      assertSopsAccess(session, undefined);
      return true;
    } catch (error) {
      if (error instanceof SopsAccessError) return false;
      throw error;
    }
  })();
  const agencySops = canAccessSops ? listSops(session.agencyId) : [];
  const agencySopById = new Map(agencySops.map(sop => [sop.id, sop]));
  const clientProductProcess = cleanClientProductProcessState(meta.clientProductProcess);
  const deliveryProducts = selectedProducts.map(product => {
    const workspace = workspacesByProduct.get(product.id);
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      deliverables: product.deliverables,
      accentColor: product.accentColor,
      stage: workspace?.stage ? workspace.stage.replaceAll("-", " ") : meta.portalMode?.replaceAll("-", " ") || "onboarding",
      progress: workspace ? portalWorkspaceProgress(workspace) : 0,
    };
  });
  const clientProductPlans = deliveryProducts.map(product => {
    const definition = agencyProductById.get(product.id);
    const workspace = definition?.internalWorkspace ?? defaultProductInternalWorkspace({
      id: product.id,
      name: product.name,
      portalTemplateKey: definition?.portalTemplateKey,
      sopIds: definition?.sopIds,
    });
    const processState = clientProductProcess[product.id];
    const portalStage = workspacesByProduct.get(product.id)?.stage;
    const currentStageId = workspace.lifecycleStages.some(stage => stage.id === processState?.currentStageId)
      ? processState?.currentStageId
      : workspace.lifecycleStages.find(stage => stage.portalMode === portalStage)?.id ?? workspace.lifecycleStages[0]?.id;
    return {
      id: product.id,
      name: product.name,
      title: workspace.title || `${product.name} delivery plan`,
      objective: workspace.objective || `Deliver ${product.name} with every decision and output retained.`,
      accentColor: product.accentColor,
      progress: product.progress,
      completedStepIds: processState?.completedStepIds ?? [],
      currentStageId,
      stageHistory: processState?.stageHistory ?? [],
      lifecycleStages: workspace.lifecycleStages,
      quickActions: workspace.quickActions,
      processSteps: workspace.processSteps.map(step => ({
        ...step,
        sops: step.sopIds.flatMap(sopId => {
          const sop = agencySopById.get(sopId);
          return sop ? [{ id: sop.id, title: sop.title }] : [];
        }),
      })),
      advancedModules: workspace.advancedModules,
      workspaceRevision: workspacesByProduct.get(product.id)?.revision ?? 0,
    };
  });
  const deliveryCommandProducts = deliveryProducts.map(product => {
    const plan = clientProductPlans.find(item => item.id === product.id);
    const currentStage = plan?.lifecycleStages.find(stage => stage.id === plan.currentStageId);
    const stageSteps = plan?.processSteps.filter(step => !step.advanced && step.stageId === currentStage?.id) ?? [];
    const completedStepIds = new Set(plan?.completedStepIds ?? []);
    const nextStep = stageSteps.find(step => !completedStepIds.has(step.id));
    return {
      ...product,
      stage: currentStage?.label ?? product.stage,
      nextAction: nextStep?.title,
      nextActionDetail: nextStep?.instruction,
    };
  });
  const clientMilestones = listClientMilestones(session.agencyId, client.id);
  const deliveryProgress = deliveryProducts.length
    ? Math.round(deliveryProducts.reduce((total, product) => total + product.progress, 0) / deliveryProducts.length)
    : null;
  const openMilestones = clientMilestones.filter(item => item.status !== "complete");
  const propertyRecords = Array.isArray(meta.properties) ? meta.properties : [];
  const connectionOrigin = connectionLinkOrigin();
  const portalConnections = listPortalConnections(session.agencyId, client.id)
    .map(connection => describePortalConnection(connection, connectionOrigin));
  // Named from what Aqua already knows the client runs, so naming a connection
  // is a confirmation rather than a blank box. Their own software first — that
  // is what a connection is usually for.
  const connectionSuggestions = Array.from(new Set([
    ...propertyRecords
      .filter(property => property.kind === "software" || property.kind === "client-portal" || property.kind === "website")
      .sort((a, b) => (a.kind === "software" ? 0 : 1) - (b.kind === "software" ? 0 : 1))
      .map(property => (property.label ?? "").trim()),
    ...(client.websiteUrl ? [(() => {
      try { return new URL(client.websiteUrl!).host.replace(/^www\./, ""); } catch { return ""; }
    })()] : []),
  ].filter(Boolean))).slice(0, 4);
  const recordFiles = (Array.isArray(meta.files) ? meta.files : []) as Array<{
    id: string;
    name: string;
    url: string;
    category: string;
    uploadedBy?: string;
    uploadedAt: number;
    recordEntryId?: string;
    customerVisible?: boolean;
  }>;
  const clientRecordEntries = cleanClientRecordEntries(meta.clientRecordEntries);
  const recentMovement = [
    ...clientRecordEntries.slice(0, 12).map(entry => ({
      id: entry.id,
      kind: entry.kind === "call" || entry.kind === "meeting" || entry.kind === "note" ? entry.kind : "activity" as const,
      title: entry.title,
      detail: entry.body?.slice(0, 280) || `${entry.visibility === "client" ? "Shared with client" : "Internal record"}${entry.channel ? ` · ${entry.channel}` : ""}`,
      occurredAt: entry.occurredAt,
      href: `${clientWorkspaceHref(client.id, "notes")}#client-record`,
    })),
    ...customerPortalData.record.messages
      .filter(message => message.occurredAt > 0 && message.body.trim() && message.body.trim() !== "No message was recorded.")
      .slice(0, 12)
      .map(message => ({
        id: message.id,
        kind: "message" as const,
        title: `${message.from === "customer" ? "Client message" : "Team reply"} · ${message.channel}`,
        detail: message.body.slice(0, 280),
        occurredAt: message.occurredAt,
        href: clientWorkspaceHref(client.id, "communications"),
      })),
    ...recentActivity.map(item => ({
      id: item.id,
      kind: "activity" as const,
      title: item.message,
      detail: `${item.category} · ${item.action.replaceAll(".", " ")}`,
      occurredAt: item.ts,
      href: `${clientWorkspaceHref(client.id, "notes")}#client-record`,
    })),
  ].sort((left, right) => right.occurredAt - left.occurredAt).slice(0, 8);
  const linkedInbox = tab === "notes" && !session.isDemo
    ? await listInboxSnapshot(session.agencyId).catch(() => ({ connections: [], conversations: [], generatedAt: Date.now() }))
    : { connections: [], conversations: [], generatedAt: Date.now() };
  const websiteEnquiriesRaw = tab === "notes" && !session.isDemo
    ? await listWebsiteEnquiries(session.agencyId, 500).catch(() => [])
    : [];
  const websiteEnquiries = websiteEnquiriesRaw.length
    ? await synchroniseWebsiteEnquiryIdentities(session.agencyId, websiteEnquiriesRaw).catch(() => websiteEnquiriesRaw)
    : websiteEnquiriesRaw;
  const websiteEnquiryWindowReached = websiteEnquiries.length === 500;
  const customerEmails = new Set([meta.portalLoginEmail, meta.clientEmail, client.ownerEmail]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(value => value.trim().toLowerCase()));
  const customerPhones = new Set([meta.phone, meta.contactPhone]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(value => normaliseIdentityPhone(value).replace(/\D/g, ""))
    .filter(Boolean));
  const safeClientRequests = cleanClientRequests(meta.clientRequests);
  const matchedEnquiries = websiteEnquiries.filter(enquiry =>
    enquiry.clientId === client.id
    || Boolean(enquiry.email && customerEmails.has(normaliseIdentityEmail(enquiry.email)))
    || Boolean(enquiry.phone && customerPhones.has(normaliseIdentityPhone(enquiry.phone).replace(/\D/g, ""))));
  const requestMessages: ClientRecordMessage[] = safeClientRequests.flatMap(request => {
    const initialDirection = customerEmails.has(request.submittedBy.trim().toLowerCase()) ? "inbound" as const : "outbound" as const;
    return [
      {
        id: request.id,
        title: request.topic || request.type.replaceAll("-", " "),
        body: request.message,
        occurredAt: request.submittedAt,
        channel: "Client portal",
        direction: initialDirection,
        status: request.status,
        href: `${clientWorkspaceHref(client.id, "communications")}#client-request-${encodeURIComponent(request.id)}`,
      },
      ...(request.replies ?? []).map(reply => ({
        id: reply.id,
        title: `Reply · ${request.topic || request.type.replaceAll("-", " ")}`,
        body: reply.message,
        occurredAt: reply.createdAt,
        channel: "Client portal",
        direction: reply.from === "customer" ? "inbound" as const : "outbound" as const,
        status: request.status,
        href: `${clientWorkspaceHref(client.id, "communications")}#client-request-${encodeURIComponent(request.id)}`,
      })),
    ];
  });
  const socialMessages: ClientRecordMessage[] = linkedInbox.conversations
    .filter(conversation => conversation.identity.clientId === client.id)
    .flatMap(conversation => conversation.messages
      .filter(message => message.direction !== "internal")
      .map(message => ({
        id: message.id,
        title: `${conversation.connection.channel === "instagram" ? "Instagram" : "Facebook"} message`,
        body: message.text?.trim() || (message.attachments.length ? `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}` : "Message"),
        occurredAt: message.sentAt,
        channel: conversation.connection.displayName,
        direction: message.direction === "inbound" ? "inbound" as const : "outbound" as const,
        status: message.status,
        href: clientWorkspaceHref(client.id, "communications"),
      })));
  const enquiryMessages: ClientRecordMessage[] = matchedEnquiries.flatMap(enquiry => [
    ...(enquiry.message ? [{
      id: enquiry.id,
      title: enquiry.topic || "Website enquiry",
      body: enquiry.message,
      occurredAt: enquiry.submittedAt,
      channel: enquiry.siteName,
      direction: "inbound" as const,
      status: enquiry.status,
      href: clientWorkspaceHref(client.id, "communications"),
    }] : []),
    ...enquiry.replies.map(reply => ({
      id: reply.id,
      title: `${reply.channel.toUpperCase()} reply`,
      body: reply.message,
      occurredAt: reply.sentAt,
      channel: reply.senderLabel || reply.channel,
      direction: "outbound" as const,
      status: reply.status,
      href: clientWorkspaceHref(client.id, "communications"),
    })),
    ...enquiry.calls.map(call => ({
      id: call.id,
      title: `Call · ${call.outcome?.replaceAll("-", " ") || call.status}`,
      body: call.notes?.trim() || `${call.durationSeconds ?? 0} seconds recorded`,
      occurredAt: call.startedAt,
      channel: call.senderLabel,
      direction: "outbound" as const,
      status: call.status,
      href: call.recording?.url || clientWorkspaceHref(client.id, "communications"),
    })),
  ]);
  const clientRecordMessages = [...requestMessages, ...socialMessages, ...enquiryMessages].sort((left, right) => right.occurredAt - left.occurredAt);
  const recordActivitySource = tab === "notes"
    ? listActivity({ agencyId: client.agencyId, clientId: client.id, limit: 501 })
    : [];
  const recordActivityWindowReached = recordActivitySource.length === 501;
  const recordActivityCandidates = recordActivitySource
      .filter(item => !item.action.startsWith("client_file.")
        && !item.action.startsWith("client_request.")
        && !item.action.startsWith("client_record.")
        && !item.action.startsWith("contract.")
        && !item.action.startsWith("invoice.")
        && !item.action.startsWith("client_payment_plan.")
        && !item.action.startsWith("milestone."));
  const recordActivity = recordActivityCandidates
    .slice(0, 500)
    .map(item => ({ id: item.id, message: item.message, category: item.category, occurredAt: item.ts }));
  const clientRecordCoverageWarnings = [
    websiteEnquiryWindowReached ? "This refresh inspected the newest 500 website enquiries. Previously indexed matches remain retained; use global search for older enquiries not yet imported into this ledger." : null,
    recordActivityWindowReached ? "This refresh inspected the newest 500 relevant activity events. Previously indexed activity remains retained in the ledger and the full audit log remains available." : null,
  ].filter((warning): warning is string => Boolean(warning));
  const commercialPack = meta.commercialPack;
  const issuedInvoices = customerPortalData.invoices;
  const clientPaymentPlans = cleanClientPaymentPlans(meta.clientPaymentPlans)
    .map(plan => reconcileClientPaymentPlan(plan, issuedInvoices));
  const activePaymentPlans = clientPaymentPlans.filter(plan => plan.status === "active");
  const paymentPosition = summariseClientPaymentPosition(clientPaymentPlans, issuedInvoices, now);
  const outstandingPaymentPositions = paymentPosition.currencyPositions.filter(position => position.outstandingCents > 0);
  const acceptedAgreement = customerPortalData.contracts.some(contract => contract.status === "accepted")
    || Boolean(commercialPack?.signedDocumentDataUrl);
  const commercialGaps = [
    issuedInvoices.length === 0 ? "Issued invoice missing" : null,
    !acceptedAgreement ? "Accepted agreement missing" : null,
    outstandingPaymentPositions.length > 0
      ? `Payment outstanding (${outstandingPaymentPositions.map(position => new Intl.NumberFormat("en-GB", { style: "currency", currency: position.currency.toUpperCase() }).format(position.outstandingCents / 100)).join(" · ")})`
      : null,
    paymentPosition.missedPayments
      ? `${paymentPosition.missedPayments} missed payment${paymentPosition.missedPayments === 1 ? "" : "s"}`
      : null,
  ].filter((gap): gap is string => Boolean(gap));
  const clientOperations = cleanClientOperationsBrief(meta.clientOperations);
  const operationOwners: ClientOperationOwnerOption[] = canManageOperations
    ? listPeopleEmployees(session.agencyId)
      .filter(employee => employee.status !== "alumni" && employee.status !== "suspended")
      .map(employee => ({ id: employee.id, name: employee.name, email: employee.email, title: employee.title }))
    : [];
  if (canManageOperations && !operationOwners.some(owner => owner.email.toLowerCase() === session.email.toLowerCase())) {
    const currentUser = getUserById(session.userId);
    operationOwners.unshift({
      id: `user:${session.userId}`,
      name: currentUser?.name?.trim() || session.email,
      email: currentUser?.email || session.email,
      title: session.role === "agency-owner" ? "Agency owner" : "Agency operator",
    });
  }
  const clientRecordCanonicalEvents: ClientRecordLedgerEventInput[] = tab === "notes"
    ? [
        ...customerPortalData.contracts.map(contract => clientContractLedgerEvent(client.id, contract)),
        ...issuedInvoices.map(invoice => clientInvoiceLedgerEvent(client.id, invoice)),
        ...clientPaymentPlans.map(plan => clientPaymentPlanLedgerEvent(client.id, plan, now)),
        ...clientMilestones.map(milestone => clientMilestoneLedgerEvent(client.id, milestone, now)),
      ].sort((left, right) => right.occurredAt - left.occurredAt)
    : [];
  const clientRecordLedgerEvents: ClientRecordLedgerEventInput[] = tab === "notes"
    ? [
        ...clientRecordEntries.map(entry => ({
          sourceType: "record-entry" as const,
          sourceId: entry.id,
          group: entry.kind === "call" || entry.kind === "meeting" ? "calls" as const : entry.kind === "update" ? "activity" as const : "notes" as const,
          title: entry.title,
          body: entry.body,
          occurredAt: entry.occurredAt,
          eyebrow: `${entry.kind.replaceAll("-", " ")}${entry.channel ? ` · ${entry.channel}` : ""}`,
          visibility: entry.visibility,
          href: entry.url,
        })),
        ...clientRecordMessages.map(message => ({
          sourceType: "message" as const,
          sourceId: `${message.href ?? message.channel}:${message.id}`,
          group: "messages" as const,
          title: message.title,
          body: message.body,
          occurredAt: message.occurredAt,
          eyebrow: `${message.channel} · ${message.direction === "inbound" ? client.name : portalProviderName}${message.status ? ` · ${message.status}` : ""}`,
          visibility: "inherent" as const,
          href: message.href,
        })),
        ...recordFiles.map(file => ({
          sourceType: "file" as const,
          sourceId: file.id,
          group: "files" as const,
          title: file.name,
          body: `${file.category.replaceAll("-", " ")}${file.uploadedBy ? ` · ${file.uploadedBy}` : ""}`,
          occurredAt: file.uploadedAt,
          eyebrow: file.category === "recording" ? "Call recording" : "File",
          visibility: file.customerVisible === true ? "client" as const : "internal" as const,
          href: file.url,
          parentSourceId: file.recordEntryId,
        })),
        ...recordActivity.map(item => ({
          sourceType: "activity" as const,
          sourceId: item.id,
          group: "activity" as const,
          title: item.message,
          occurredAt: item.occurredAt,
          eyebrow: item.category.replaceAll("-", " "),
          visibility: "internal" as const,
        })),
        ...clientRecordCanonicalEvents,
      ]
    : [];
  if (tab === "notes" && !session.publicShowcase) {
    synchroniseClientRecordLedger({
      agencyId: session.agencyId,
      clientId: client.id,
      events: clientRecordLedgerEvents,
      completeSources: ["record-entry", "file", "contract", "invoice", "payment-plan", "delivery"],
    });
    await flushPendingWrites();
  }
  const initialClientRecordLedgerPage = queryClientRecordLedger({
    agencyId: session.agencyId,
    clientId: client.id,
    limit: 25,
  });

  const relationshipSwitcher = canManageRelationship ? (
    <ClientWorkspaceSwitcher
      currentClientId={client.id}
      currentCompanyId={client.companyId}
      canManage
      workspaces={relationshipWorkspaces.map(workspace => ({
        id: workspace.id,
        name: workspace.name,
        workspaceLabel: workspace.workspaceLabel,
        providerName: resolveClientPortalProvider(workspace, { name: agencyName, mark: agencyName.charAt(0) }).name,
        stageLabel: accountStatusLabel(workspace.status),
        portalReady: typeof workspace.metadata?.portalBuiltAt === "number",
        current: workspace.id === client.id,
      }))}
      availableClients={availableRelationshipClients.map(workspace => ({
        id: workspace.id,
        name: workspace.name,
        ownerEmail: workspace.ownerEmail,
        workspaceLabel: workspace.workspaceLabel,
        providerName: resolveClientPortalProvider(workspace, { name: agencyName, mark: agencyName.charAt(0) }).name,
        relationshipWorkspaceCount: availableRelationshipCounts.get(clientRelationshipId(workspace)) ?? 1,
      }))}
      companies={tradingCompanies.map(company => ({ id: company.id, name: company.name, status: company.status }))}
      products={agencyProducts.map(product => ({ id: product.id, name: product.name, category: product.category, active: product.active }))}
      currentProductIds={productAssignment.selectedIds}
    />
  ) : undefined;

  return (
    <div className="mm-client-workspace-page flex w-full flex-col gap-6">
      {tab === "overview" ? <ClientWorkspaceHeader
        clientId={client.id}
        clientName={client.name}
        logoUrl={client.brand.logoUrl}
        primaryColor={client.brand.primaryColor}
        providerName={portalProviderName}
        accountStatusLabel={accountStatusLabel(client.status)}
        sourceLabel={meta.leadSource?.replace(/[-_]+/g, " ") || "Not recorded"}
        products={deliveryProducts.map(product => ({ id: product.id, name: product.name, accentColor: product.accentColor }))}
        relationship={{
          score: aquaHealth.score,
          state: aquaHealth.state,
          openRequests: customerPortalData.requests.filter(request => request.status === "open").length,
        }}
        delivery={{
          progress: deliveryProgress,
          openMilestones: openMilestones.length,
          blockedMilestones: openMilestones.filter(item => item.status === "blocked").length,
        }}
        lastContactLabel={meta.lastContactedAt ? formatRelative(meta.lastContactedAt) : "Not recorded"}
        portalReady={Boolean(meta.portalBuiltAt)}
        contactRow={(
          <CommsRow
            clientId={client.id}
            canManage={canManageClient}
            initial={{
              whatsappLink: meta.whatsappLink ?? "",
              clientEmail: meta.clientEmail ?? "",
              lastContactedAt: meta.lastContactedAt ?? 0,
            }}
          />
        )}
        relationshipSwitcher={relationshipSwitcher}
        canManage={canManageClient}
        portalAction={canManageClient && selectedProducts.length ? (
          portalMaterialized ? (
            <a href={`/clients/${client.slug}/`} target="_blank" rel="noreferrer" className="mm-client-context-button">
              Open live experience ↗
            </a>
          ) : (
            <BuildPortalWizard
              clientId={client.id}
              clientName={client.name}
              slug={client.slug}
              plugins={listPlugins().map<WizardPlugin>(plugin => {
                const copy = toolCopy({ id: plugin.id, name: plugin.name ?? plugin.id, description: plugin.description });
                return {
                  id: plugin.id,
                  name: copy.name,
                  description: copy.description,
                  installed: installedIds.has(plugin.id),
                  recommended: liveRecommended.includes(plugin.id),
                };
              })}
            />
          )
        ) : undefined}
      /> : <ClientLensHeader
        tab={tab}
        clientName={client.name}
        relationshipSwitcher={relationshipSwitcher}
        action={canManageClient && tab === "relationship" && selectedProducts.length === 0
          ? <PhaseTransitionButton clientId={client.id} currentStage={client.stage} isFounder={session.role === "agency-owner"} />
          : undefined}
      />}

      {contextualTabs ? (
        <section className="mm-client-local-nav" aria-label={contextualNavLabel}>
          <p>{contextualNavLabel}</p>
          <OverviewTabs clientId={client.id} active={tab} visibleTabs={contextualTabs} />
        </section>
      ) : null}

      {tab === "delivery" ? <ClientFulfilmentHub
        clientId={client.id}
        selectedProductId={rawProductId}
        advanced={deliveryAdvanced}
        serviceCount={selectedProducts.length}
        portalBuilt={Boolean(meta.portalBuiltAt)}
        contractCount={customerPortalData.contracts.length}
        invoiceCount={customerPortalData.invoices.length}
        fileCount={customerPortalData.files.length}
        propertyCount={propertyRecords.length}
        canManage={canManageClient}
      /> : null}

      {tab === "delivery" ? <ClientServiceAssignment
        clientId={client.id}
        clientName={client.name}
        initialProducts={productAssignment.effectiveProducts}
        initialSelectedProductIds={productAssignment.selectedIds}
        initialCompanyId={client.companyId}
        defaultProviderName={agencyName}
        canManage={canManageClient && (session.role === "agency-owner" || session.role === "agency-manager")}
        variationProductIds={clientVariationProductIds(meta)}
        sops={agencySops}
        companies={tradingCompanies.map(company => ({ id: company.id, name: company.name, status: company.status }))}
        options={agencyProducts.filter(product => product.active || productAssignment.selectedIds.includes(product.id)).map(product => ({
          id: product.id,
          name: product.name,
          category: product.category,
          description: product.description,
          kind: product.kind,
          active: product.active,
          status: productStatus(product),
          includedProductNames: product.includedProductIds.map(id => agencyProductById.get(id)?.name).filter((name): name is string => Boolean(name)),
        }))}
      /> : null}

      {commercialGaps.length && (tab === "finance" || tab === "notes") ? (
        <section className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div><strong>Commercial records need attention</strong><span className="ml-2">{commercialGaps.join(" · ")}</span></div>
          <Link href={`/portal/clients/${client.id}?tab=finance`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-red-200">Open finance</Link>
        </section>
      ) : null}

      {tab === "overview" && (
        <ClientSpineOverview
          clientId={client.id}
          relatedWorkspaces={relationshipWorkspaces.map(workspace => {
            const workspaceProducts = resolvePortalProductAssignment(workspace.metadata ?? {}, agencyProducts).products;
            const workspaceOpenRequests = cleanClientRequests(workspace.metadata?.clientRequests).filter(request => request.status === "open").length;
            const workspaceOpenMilestones = listClientMilestones(session.agencyId, workspace.id).filter(item => item.status !== "complete");
            const workspaceSignals = relationshipWorkspaceSignals.get(workspace.id)!;
            return {
              id: workspace.id,
              name: workspace.name,
              label: workspace.workspaceLabel,
              providerName: resolveClientPortalProvider(workspace, { name: agencyName, mark: agencyName.charAt(0) }).name,
              stageLabel: accountStatusLabel(workspace.status),
              hasServices: workspaceProducts.length > 0,
              serviceNames: workspaceProducts.map(product => product.name),
              portalReady: typeof workspace.metadata?.portalBuiltAt === "number",
              openRequests: workspaceOpenRequests,
              blockedMilestones: workspaceOpenMilestones.filter(item => item.status === "blocked").length,
              overdueMilestones: workspaceOpenMilestones.filter(item => item.status !== "blocked" && Boolean(item.targetAt && item.targetAt < now)).length,
              aquaHealthScore: workspaceSignals.healthScore,
              aquaHealthState: workspaceSignals.healthState,
              aquaHealthConfidence: workspaceSignals.healthConfidence,
              outstandingByCurrency: workspaceSignals.outstandingByCurrency,
              portalAccessState: workspaceSignals.portalAccessState,
              current: workspace.id === client.id,
            };
          })}
          relationship={{
            score: aquaHealth.score,
            confidence: aquaHealth.confidence,
            state: aquaHealth.state,
            summary: aquaHealth.summary,
            openRequests: customerPortalData.requests.filter(request => request.status === "open").length,
          }}
          delivery={{
            progress: deliveryProgress,
            assignedProducts: deliveryProducts.length,
            openMilestones: openMilestones.length,
            blockedMilestones: openMilestones.filter(item => item.status === "blocked").length,
            overdueMilestones: openMilestones.filter(item => item.status !== "blocked" && Boolean(item.targetAt && item.targetAt < now)).length,
          }}
          systems={serviceCapabilities.systems ? {
            properties: propertyRecords.length,
            tagsInstalled: propertyRecords.filter(property => property.tagStatus === "installed").length,
            tagsNeedingAttention: propertyRecords.filter(property => property.tagStatus === "missing" || property.tagStatus === "broken").length,
            websiteConnected: Boolean(client.websiteUrl),
          } : null}
          hasServices={serviceCapabilities.hasServices}
          portalReady={Boolean(meta.portalBuiltAt)}
          portal={{
            accessState: relationshipWorkspaceSignals.get(client.id)?.portalAccessState ?? "not-prepared",
            pendingApprovals: customerPortalData.approvals.filter(approval => approval.status === "pending").length,
            sharedFiles: customerPortalData.files.filter(file => file.customerVisible !== false).length,
            openRequests: customerPortalData.requests.filter(request => request.status === "open").length,
          }}
          lastContactAt={meta.lastContactedAt}
          commercialGaps={commercialGaps}
          commercial={{
            activePlans: activePaymentPlans.length,
            totalPlans: clientPaymentPlans.length,
            paymentState: paymentPosition.state,
            paymentLabel: paymentPosition.label,
            currencyPositions: paymentPosition.currencyPositions,
            overdueMilestones: paymentPosition.missedPayments,
            nextDueAt: paymentPosition.nextDueAt,
            acceptedContracts: customerPortalData.contracts.filter(contract => contract.status === "accepted").length,
            issuedInvoices: issuedInvoices.length,
          }}
          operationsBrief={clientOperations}
          operationOwners={operationOwners}
          acceptedOperationSourceIds={acceptedOperationSourceIds}
          canManageOperations={canManageOperations}
          recentMovement={recentMovement}
          radar={clientRadar!}
          productPlans={clientProductPlans}
          canManageProductPlans={canManageClient}
        />
      )}

      {canManageClient && tab === "relationship" && selectedProducts.length === 0 && isAquaStage(client.stage) && (() => {
        const aquaPhases = phases.filter(p => AQUA_PHASE_ORDER.includes(p.stage));
        aquaPhases.sort((a, b) => AQUA_PHASE_ORDER.indexOf(a.stage) - AQUA_PHASE_ORDER.indexOf(b.stage));
        const currentIdx = AQUA_PHASE_ORDER.indexOf(client.stage);
        const onboardingPhases: OnboardingPhase[] = aquaPhases.map(p => {
          const idx = AQUA_PHASE_ORDER.indexOf(p.stage);
          const state: OnboardingPhase["state"] =
            idx < currentIdx ? "complete" : idx === currentIdx ? "active" : "future";
          const seeds = AQUA_MILESTONES[p.stage] ?? [];
          const milestones = getMilestoneState(client, p.stage).map(m => ({
            id: m.id,
            label: seeds.find(s => s.id === m.id)?.label ?? m.id,
            done: m.done,
          }));
          return {
            id: p.id,
            stage: p.stage,
            label: p.label,
            order: p.order,
            state,
            milestones,
            allComplete: isPhaseComplete(client, p.stage),
          };
        });
        return (
          <OnboardingDashboardPanel
            clientId={client.id}
            phases={onboardingPhases}
            currentStage={client.stage}
          />
        );
      })()}

      {tab === "relationship" && (
        <section className="grid gap-4 md:grid-cols-2">
          {selectedProducts.length ? <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Independent service stages</h2>
            <div className="mt-3 grid gap-2">
              {clientProductPlans.slice(0, 4).map(product => <div key={product.id} className="flex items-center justify-between gap-3 border-b border-black/[0.07] pb-2 text-sm last:border-0 last:pb-0"><span className="min-w-0 truncate font-medium text-black/72">{product.name}</span><span className="shrink-0 text-xs font-semibold text-[#315b85]">{product.lifecycleStages.find(stage => stage.id === product.currentStageId)?.label ?? "Set stage"}</span></div>)}
            </div>
            <Link href={clientWorkspaceHref(client.id, "delivery")} className="mt-4 inline-flex text-xs font-semibold text-[#315b85]">{canManageClient ? "Manage" : "View"} service stages →</Link>
          </div> : <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Legacy account setup phase</h2>
            <div className="mt-2 text-base font-semibold text-black/90">{phaseLabel(client.stage)}</div>
            {currentPhase?.description && <p className="mt-1 text-sm text-black/60">{phaseDescription(currentPhase.description)}</p>}
            <p className="mt-3 text-xs text-black/55">Assign a service to replace this older shared phase with independent service lifecycles.</p>
          </div>}
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Quick actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {canManageClient && serviceCapabilities.keys.includes("website") ? <Link href={clientWorkspaceHref(client.id, "systems", { systemView: "website" })} className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white shadow hover:opacity-90">Edit website</Link> : null}
              {serviceCapabilities.hasServices ? <Link href={clientWorkspaceHref(client.id, "portal")} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">{meta.portalBuiltAt ? "Portal preview" : canManageClient ? "Create client portal" : "Portal status"}</Link> : canManageClient ? <Link href={`${clientWorkspaceHref(client.id, "delivery")}#service-assignment`} className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white">Assign services</Link> : null}
              {serviceCapabilities.systems ? <Link href={clientWorkspaceHref(client.id, "systems")} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">Open systems</Link> : null}
              {meta.whatsappLink && (
                <a
                  href={meta.whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Open WhatsApp group ↗
                </a>
              )}
              {meta.stripeLink && (
                <a
                  href={meta.stripeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5"
                >
                  Stripe / invoice ↗
                </a>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <CollapsibleSection title="Recent activity" description="The latest changes to this client." badge={String(recentActivity.length)}>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-black/55">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {recentActivity.map(a => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-1.5 last:border-0">
                    <span className="text-black/80">{a.message}</span>
                    <span className="shrink-0 text-[11px] text-black/45">{formatRelative(a.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
            </CollapsibleSection>
          </div>
        </section>
      )}

      {tab === "delivery" && (
        <div id="client-delivery-work" className="scroll-mt-24 grid gap-7">
          {selectedProducts.length ? <><ClientDeliveryOverview
            clientId={client.id}
            products={deliveryCommandProducts}
            milestones={clientMilestones.map(item => ({ id: item.id, title: item.title, status: item.status, targetAt: item.targetAt }))}
            portalReady={Boolean(meta.portalBuiltAt)}
            selectedProductId={rawProductId}
            advanced={deliveryAdvanced}
          />
          {deliveryAdvanced ? <section className="grid gap-7 border-t border-black/10 pt-6" aria-label="Advanced fulfilment tools">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">Advanced fulfilment</p><h2 className="mt-1 text-lg font-semibold text-black/82">Execution board and operating knowledge</h2><p className="mt-1 text-xs leading-5 text-black/45">Schedule, investigate and complete this client&apos;s work without leaving their workspace.</p></div>
          {canAccessActions ? <KanbanTabClient clientId={client.id} clientName={client.name} canManage={canManageOperations} /> : <p className="rounded-md border border-black/10 bg-white p-4 text-sm text-black/55">Actions access is required to view this client&apos;s shared execution board.</p>}
          {canAccessSops ? <ClientSopsTab
              clientId={client.id}
              families={familiesForStage(client.stage)}
              phaseLabel="General account"
              products={selectedProducts.map(product => {
                const definition = agencyProductById.get(product.id);
                const linkedDefinitions = [
                  definition,
                  ...(definition?.includedProductIds ?? []).map(id => agencyProductById.get(id)),
                ].filter(item => item !== undefined);
                return {
                  id: product.id,
                  name: product.name,
                  sopIds: [...new Set(linkedDefinitions.flatMap(item => item.sopIds ?? []))],
                  sopCategories: [...new Set(linkedDefinitions.flatMap(item => item.sopCategories ?? []))],
                };
              })}
              sops={agencySops.map(sop => ({
                id: sop.id,
                title: sop.title,
                kind: sop.kind,
                resourceType: sop.resourceType,
                category: sop.category,
                categories: sop.categories,
                tags: sop.tags,
                content: sop.content,
                fileName: sop.fileName,
                updatedAt: sop.updatedAt,
              }))}
            /> : null}</section> : null}</> : null}
        </div>
      )}

      {tab === "marketing" && (
        <ClientMarketingServiceWorkspace
          clientId={client.id}
          clientName={client.name}
          initial={cleanClientMarketingService(meta.clientMarketingService)}
          canManage={canManageClient}
          canApprove={!session.publicShowcase && !isAgencyRole(session.role)}
        />
      )}

      {tab === "portal" && (
        <div data-resolution-focus="access" className="grid gap-6">
        <FulfilmentPortalPreview
          clientId={client.id}
          clientName={client.name}
          providerName={portalProviderName}
          initial={{
            mode: meta.portalMode,
            loginEmail: meta.portalLoginEmail ?? meta.clientEmail ?? client.ownerEmail ?? "",
            contactName: meta.portalContactName ?? meta.therapistName ?? "",
            servicePlan: servicePlanLabel ?? "",
            planSummary: meta.portalPlanSummary ?? "",
            planIncludes: meta.portalPlanIncludes ?? [],
            products: selectedProducts,
            experienceHeadline: meta.portalExperienceHeadline ?? "",
            billingCadence: meta.portalBillingCadence ?? "As agreed",
            welcomeNote: meta.portalWelcomeNote ?? "",
            welcomeVideoUrl: meta.portalWelcomeVideoUrl ?? "",
            supportEmail: meta.portalSupportEmail ?? customerPortalData.support.email ?? "",
            supportPhone: meta.portalSupportPhone ?? customerPortalData.support.phone ?? "",
            supportWhatsappUrl: meta.portalSupportWhatsappUrl ?? customerPortalData.support.whatsappUrl ?? "",
            logoUrl: meta.portalLogoUrl ?? "",
            accentColor: meta.portalAccentColor ?? "#8b6c33",
            billingUrl: meta.stripeLink ?? "",
            websiteUrl: client.websiteUrl,
            stageLabel: `${selectedProducts.length} independently staged service${selectedProducts.length === 1 ? "" : "s"}`,
            portalBuiltAt: meta.portalBuiltAt,
            accessSentAt: meta.portalAccessSentAt,
            accessPreparedAt: meta.portalAccessPreparedAt,
            fileCount: customerPortalData.files.length,
            invoiceCount: customerPortalData.invoices.length,
            outstandingInvoiceCount: customerPortalData.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue").length,
            contractCount: customerPortalData.contracts.filter(contract => contract.status === "accepted").length,
            propertyCount: customerPortalData.properties.length,
            tagInstalledCount: customerPortalData.properties.filter(property => property.tagStatus === "installed").length,
            approvals: customerPortalData.approvals,
          }}
          canManage={canConfigureClient}
        />
        {canConfigureClient ? <ClientPortalConnections
          clientId={client.id}
          clientName={client.name}
          initialConnections={portalConnections}
          suggestions={connectionSuggestions}
        /> : null}
        </div>
      )}

      {tab === "systems" && (
        <RequirePermission session={session} requires={["clients.view"]}>
          <div className="grid gap-6">
            <nav aria-label="Technical workspace views" className="grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-3">
              <Link href={clientWorkspaceHref(client.id, "systems")} className={`flex min-h-16 items-center gap-3 bg-white px-4 text-sm font-semibold ${systemView === "monitoring" ? "text-brand" : "text-black/58"}`}><MonitorCog size={17} /> Monitoring</Link>
              <Link href={clientWorkspaceHref(client.id, "systems", { systemView: "properties" })} className={`flex min-h-16 items-center gap-3 bg-white px-4 text-sm font-semibold ${systemView === "properties" ? "text-brand" : "text-black/58"}`}><Boxes size={17} /> Properties and deployments</Link>
              <Link href={clientWorkspaceHref(client.id, "systems", { systemView: "website" })} className={`flex min-h-16 items-center gap-3 bg-white px-4 text-sm font-semibold ${systemView === "website" ? "text-brand" : "text-black/58"}`}><Globe2 size={17} /> Dev Editor Engine</Link>
            </nav>
            {systemView === "monitoring" ? (
              <div className="grid gap-6">
              <ClientSystemsWorkspace clientId={client.id} clientName={client.name} properties={propertyRecords} canManage={canManageClient} />
              <ClientTagWorkspace clientId={client.id} clientName={client.name} canManage={canManageClient} />
              </div>
            ) : systemView === "properties" ? (
              <PropertiesTabClient
                clientId={client.id}
                clientName={client.name}
                initialProperties={propertyRecords}
                githubPublishingConfigured={isGitHubPublishingConfiguredForAgency(session.agencyId, client.id)}
                vercelDeploymentConfigured={isVercelProjectDeploymentConfiguredForAgency(session.agencyId, client.id)}
                canManage={canManageClient}
                canRelease={canConfigureClient}
              />
            ) : (
              <section className="border-y border-black/10 bg-white py-6">
                <h2 className="text-lg font-medium text-black/90">Dev Editor Engine</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">Visually build pages and responsive sections, add custom code, preview every device, and publish when {client.name} is ready.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <WebsiteBuilderLauncher clientId={client.id} ready={installs.some(install => install.pluginId === "website-editor" && install.enabled)} canManage={canConfigureClient} />
                  {client.websiteUrl ? <a href={client.websiteUrl} target="_blank" rel="noreferrer" className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">Open live site ↗</a> : null}
                </div>
              </section>
            )}
          </div>
        </RequirePermission>
      )}

      {tab === "finance" && (
        <RequirePermission session={session} requires={["finance.view"]}>
          <div data-resolution-focus="payment">
          <FinanceTabClient
            clientId={client.id}
            clientName={client.name}
            recipientEmail={meta.portalLoginEmail ?? meta.clientEmail ?? client.ownerEmail}
            initialContracts={Array.isArray(meta.contracts) ? meta.contracts : []}
            initialContractTemplates={contractTemplates}
            initialPaymentPlans={clientPaymentPlans}
            initialCommercialFiles={customerPortalData.files.filter(file => file.category === "payment-plan" || file.category === "payment-proof")}
            products={selectedProducts.map(product => ({ id: product.id, name: product.name }))}
            initial={{
              planTier: meta.planTier,
              servicePlan: servicePlanLabel ?? undefined,
              lockInPaid: meta.lockInPaid,
              stripeLink: meta.stripeLink,
            }}
            canManage={canManageClient}
            canConfigure={canConfigureClient}
          />
          </div>
        </RequirePermission>
      )}

      {tab === "communications" && (
        <div data-resolution-focus="reply" className="grid gap-5">
          <header className="grid gap-4 border-b border-black/10 pb-5">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Relationship communications</p><h2 className="mt-2 text-2xl font-semibold text-black/88">Messages and requests</h2><p className="mt-1 text-sm text-black/55">Contact details, customer requests, replies and relationship history for this client only.</p></div>
            <CommsRow
              clientId={client.id}
              canManage={canManageClient}
              initial={{
                whatsappLink: meta.whatsappLink ?? "",
                clientEmail: meta.clientEmail ?? "",
                lastContactedAt: meta.lastContactedAt ?? 0,
              }}
            />
          </header>
          <ClientRequestsPanel clientId={client.id} initialRequests={safeClientRequests} providerName={portalProviderName} canManage={canManageClient} />
        </div>
      )}

      {tab === "files" && (
        <div className="grid gap-5">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Shared evidence</p><h2 className="mt-2 text-2xl font-semibold text-black/88">Files and assets</h2><p className="mt-1 text-sm text-black/55">Working files, customer uploads, screenshots, brand assets, and delivery evidence in one lens.</p></div>{canManageClient ? <Link href={`/portal/clients/${client.id}/assets`} className="rounded-md border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black/65">Open asset library</Link> : <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">Read-only</span>}</header>
          <FilesTabClient
            clientId={client.id}
            canManage={canManageClient}
            initialFiles={(((client.metadata ?? {}) as { files?: Array<{
              id: string; name: string; url: string;
              category: FileCategory; uploadedBy?: string; uploadedAt: number;
              customerVisible?: boolean;
            }> }).files) ?? []}
          />
        </div>
      )}

      {tab === "notes" && (
        <div className="grid gap-8" data-testid="client-information-record">
          <section className="grid gap-5" aria-label="Client information">
            <ClientContactsPanel
              clientId={client.id}
              initialEntityType={meta.clientEntityType === "person" ? "person" : "company"}
              initialContacts={cleanClientContacts(meta.linkedContacts)}
              canEdit={canManageClient}
            />
            <CollapsibleSection
              title="Client information and useful links"
              description="Saved commercial context, meeting links, recordings, goals and brief details."
              badge={meta.portalLoginEmail ? "Portal ready" : undefined}
              defaultOpen
            >
              <div className="grid gap-3 lg:grid-cols-3">
                <ContextItem label="Budget" value={meta.budgetRange ?? meta.buyingJourney?.budgetRange} />
                <ContextItem label="Price points" value={meta.pricePoints ?? meta.buyingJourney?.pricePoints} />
                <ContextItem label="Next meeting" value={formatMeeting(meta.nextMeetingAt ?? meta.buyingJourney?.meetingAt)} />
                <ContextItem label="Problems to solve" value={meta.potentialProblems ?? meta.buyingJourney?.potentialProblems} wide />
                <ContextItem label="Potential solutions" value={meta.potentialSolutions ?? meta.buyingJourney?.potentialSolutions} wide />
                <ContextItem label="Session notes" value={meta.sessionNotes ?? meta.buyingJourney?.sessionNotes ?? meta.meetingNotes ?? meta.notes} wide />
                <ContextItem label="Design feedback" value={meta.designFeedback} wide />
                <ContextItem label="Support notes" value={meta.supportNotes} wide />
                <ContextItem label="Business overview" value={meta.portalBrief?.businessOverview} wide />
                <ContextItem label="Customer's goal" value={meta.portalBrief?.primaryGoal} wide />
                <ContextItem label="Ideal customer" value={meta.portalBrief?.idealCustomer} />
                <ContextItem label="Must-haves" value={meta.portalBrief?.mustHaves} wide />
                <ContextItem label="Launch timing" value={meta.portalBrief?.launchTiming} />
                <ContextItem label="Additional brief notes" value={meta.portalBrief?.additionalNotes} wide />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {meta.meetingLink && <ExternalPill href={meta.meetingLink} label="Meeting link" />}
                {meta.buyingJourney?.meetingLink && !meta.meetingLink && <ExternalPill href={meta.buyingJourney.meetingLink} label="Meeting link" />}
                {meta.callRecordingUrl && <ExternalPill href={meta.callRecordingUrl} label="Call recording" />}
                {meta.buyingJourney?.callRecordingUrl && !meta.callRecordingUrl && <ExternalPill href={meta.buyingJourney.callRecordingUrl} label="Call recording" />}
                {(meta.salesPresentations ?? meta.buyingJourney?.salesPresentations ?? []).map(presentation => (
                  <ExternalPill key={presentation.id} href={presentation.url} label={presentation.title} />
                ))}
                {(meta.inspirationLinks ?? meta.buyingJourney?.inspirationLinks ?? []).map((href, index) => (
                  <ExternalPill key={`${href}:${index}`} href={href} label={`Inspiration ${index + 1}`} />
                ))}
                {canManageClient ? <Link href={`/portal/clients/${client.id}?tab=files`} className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]">Add files / screenshots</Link> : null}
              </div>
            </CollapsibleSection>
          </section>
          <ClientNotesWorkspace
            clientId={client.id}
            canManage={canManageClient}
            initial={{
              notes: meta.notes ?? meta.buyingJourney?.notes ?? "",
              sessionNotes: meta.sessionNotes ?? meta.buyingJourney?.sessionNotes ?? "",
              meetingNotes: meta.meetingNotes ?? "",
              supportNotes: meta.supportNotes ?? "",
            }}
          />
          <ClientRecordWorkspace
            clientId={client.id}
            canManage={canManageClient}
            initialPage={initialClientRecordLedgerPage}
            coverageWarnings={clientRecordCoverageWarnings}
            relatedWorkspaces={relationshipWorkspaces.map(workspace => ({
              id: workspace.id,
              name: workspace.name,
              label: workspace.workspaceLabel,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function ContextItem({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-black/10 bg-black/[0.02] p-3 ${wide ? "lg:col-span-3" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/75">{value || "Not captured yet."}</p>
    </div>
  );
}

function ExternalPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
    >
      {label} ↗
    </a>
  );
}

function phaseDescription(description: string): string {
  return description
    .replace(
      /\bOnboarding form \+ welcome scroll\. No plugin installs yet\./gi,
      "Collect the brief, contacts, content, and access needed to begin.",
    )
    .replace(/\bNo plugin installs yet\./gi, "Everything needed for this phase is built in.")
    .replace(/\bAll plugins disabled, config preserved\./gi, "Engagement ended; history and settings are preserved.")
    .replace(/\bplugin installs\b/gi, "system setup")
    .replace(/\bplugins\b/gi, "systems");
}
