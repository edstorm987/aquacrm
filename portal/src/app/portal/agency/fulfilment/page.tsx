import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES, type AgencyProduct, type Client, type ClientMilestone } from "@/server/types";
import { agencyProductsForRead, listAgencyProducts } from "@/server/agencyProducts";
import { listClientMilestones } from "@/server/clientMilestones";
import { phaseLabel } from "@/server/phases";
import { clientProductWorkspaces } from "@/server/productWorkspaces";
import { listClients } from "@/server/tenants";
import { portalProductSelectionFromAgencyProduct } from "@/lib/portal/portalProducts";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { resolveClientProductStage } from "@/lib/products/clientProductStageTruth";
import { portalProductModule } from "@/lib/portal/portalProductModules";
import { portalWorkspaceProgress } from "@/lib/portal/portalProductWorkspaces";
import { agencyProductPipelineColumns } from "@/lib/products/fulfilmentProductPipelines";
import { portalWorkspaceData } from "../portals/_portalWorkspaceData";
import { listSops } from "@/engines/sop/server/sops";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listUsersForAgency } from "@/server/users";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { clientRelationshipId } from "@/server/clientRelationships";
import { ensureAgencyMasterSiteKey, getAgencyMasterSiteKey, masterTagSnippet } from "@/server/websiteSources";
import { requireCurrentAccessActor } from "@/server/accessControl";
import {
  FULFILMENT_VIEW_ELEMENT_KEYS,
  resolveActorWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
  type WorkspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { connectionLinkOrigin } from "@/lib/server/portal/portalConnections";
import { getPortalFormFields } from "@/server/portalEditor";
import DevelopmentPage from "../development/page";
import { AquaTagsWorkspace } from "./_AquaTagsWorkspace";
import {
  FulfilmentWorkspace,
  type FulfilmentAttentionItem,
  type FulfilmentClientRecord,
  type FulfilmentProductRecord,
  type FulfilmentStageBoard,
  type FulfilmentView,
  type ServiceGroupKey,
} from "./_FulfilmentWorkspace";

interface SearchParams {
  view?: string;
  product?: string;
  client?: string;
  technical?: string;
  status?: string;
  /**
   * Which Portals sub-view to open (`library` | `templates`).
   *
   * Without this the Portals element could only ever show its library, so the
   * Demo templates half was unreachable from Fulfilment — the one thing the
   * standalone `/portal/agency/portals` address still did that its Fulfilment
   * home could not.
   */
  portalView?: string;
}

const VALID_VIEWS: readonly FulfilmentView[] = ["overview", "stages", "services", "technical", "clients", "portals", "tags", "access"];

export default async function FulfilmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const actor = await requireCurrentAccessActor();
  const agencyId = actor.resourceAgencyId;
  const access = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  const viewAccess = Object.fromEntries(VALID_VIEWS.map(viewId => [
    viewId,
    workspaceElementLevel(access, FULFILMENT_VIEW_ELEMENT_KEYS[viewId]),
  ])) as Record<FulfilmentView, WorkspaceElementLevel>;
  const requested = await searchParams;
  // The legacy `?view=products` is REDIRECTED, not quietly mapped. Mapping in
  // place showed Services while leaving `view=products` in the address bar, so
  // the dead view name kept getting bookmarked and shared. The three sibling
  // surfaces that were part of the same move — `agency/products`, the product
  // detail workspace and `agency/company` — all redirect; this one is the odd
  // one out, and consistency here is what makes the old URL actually die.
  if (requested.view === "products") redirect("/portal/agency/fulfilment?view=services");
  const view = VALID_VIEWS.includes(requested.view as FulfilmentView) ? requested.view as FulfilmentView : "overview";
  if (session.publicShowcase && (view === "technical" || view === "tags")) redirect("/portal/agency/fulfilment");
  if (session.publicShowcase && view === "access") redirect("/portal/agency/fulfilment");
  if (viewAccess[view] === "hidden") {
    const first = VALID_VIEWS.find(viewId => viewAccess[viewId] !== "hidden");
    redirect(first ? (first === "overview" ? "/portal/agency/fulfilment" : `/portal/agency/fulfilment?view=${first}`) : "/portal/agency");
  }
  const canManage = !session.publicShowcase;
  const canUseServices = canManage && workspaceElementAtLeast(viewAccess.services, "use");
  const canManageServices = canManage && viewAccess.services === "manage";
  if (canManageServices) agencyProductsForRead(agencyId);
  const allAgencyProducts = listAgencyProducts(agencyId, true);
  const agencyProducts = allAgencyProducts.filter(product => product.active);
  const clientDirectory = listClients(agencyId);
  const clients = clientDirectory.filter(client => client.status === "active" && client.stage !== "churned");
  const relationshipWorkspaceCounts = clientDirectory.reduce((counts, client) => {
    const relationshipId = clientRelationshipId(client);
    counts.set(relationshipId, (counts.get(relationshipId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const milestones = listClientMilestones(agencyId);
  const milestoneMap = groupMilestones(milestones);
  const clientRecords = clients.map(client => clientRecord(client, agencyProducts, milestoneMap.get(client.id) ?? [], relationshipWorkspaceCounts));
  const productRecords = agencyProducts.map(product => productRecord(product, clients, agencyProducts, relationshipWorkspaceCounts));
  const attention = attentionItems(clientRecords, milestoneMap, canUseServices);
  const flow = flowSummary(clientRecords);
  const stageBoard = buildStageBoard(requested.product, clients, agencyProducts, relationshipWorkspaceCounts);
  const portalData = viewAccess.portals === "hidden"
    ? { portals: [], products: [] }
    : portalWorkspaceData(agencyId, actor.session.userId);
  const settings = getAgencyWorkspaceSettings(agencyId);

  // The Aqua Tags control tower lives here as a Fulfilment view — technical
  // delivery owns setting up a site's tag, tracking and routing. Built only when
  // shown, mirroring `technical` below; the master key is generate-once.
  let tagsWorkspace: ReactNode;
  if (view === "tags") {
    const canUseTags = workspaceElementAtLeast(viewAccess.tags, "use");
    const tagKey = getAgencyMasterSiteKey(agencyId) ?? (canUseTags ? ensureAgencyMasterSiteKey(agencyId) : "");
    if (canUseTags) await flushPendingWrites();
    tagsWorkspace = <AquaTagsWorkspace
      snippet={tagKey ? masterTagSnippet(connectionLinkOrigin(), tagKey) : "A master tag has not been provisioned yet."}
      siteKey={tagKey}
      canUse={canManage && canUseTags}
      canManage={canManage && viewAccess.tags === "manage"}
    />;
  }

  return <FulfilmentWorkspace
    portalView={requested.portalView === "templates" ? "templates" : "library"}
    view={view}
    products={productRecords}
    clients={clientRecords}
    attention={attention}
    flow={flow}
    stageBoard={stageBoard}
    portals={portalData.portals}
    portalProducts={portalData.products}
    focusedClientId={requested.client}
    focusedProductId={requested.product}
    productEditor={{
      initialProducts: viewAccess.services === "hidden" ? [] : allAgencyProducts,
      sops: canManageServices ? listSops(agencyId) : [],
      companies: canManageServices ? listTradingCompanies(agencyId, true) : [],
      customFields: canManageServices ? getPortalFormFields(agencyId, "products") : [],
      defaults: { taxRatePercent: settings.defaultTaxRatePercent, paymentTermsDays: settings.defaultPaymentTermsDays },
    }}
    technicalWorkspace={view === "technical" ? (
      <DevelopmentPage searchParams={Promise.resolve({
        view: requested.technical === "projects" ? "workspace" : "overview",
        status: requested.status,
      })} />
    ) : undefined}
    tagsWorkspace={tagsWorkspace}
    viewAccess={viewAccess}
    accessPeople={viewAccess.access === "hidden" ? [] : listUsersForAgency(agencyId).map(person => ({ id: person.id, name: person.name, email: person.email, detail: person.role }))}
    accessEnvironment={session.sandbox ? "sandbox" : "live"}
    canManageAccess={viewAccess.access === "manage"}
  />;
}

function groupMilestones(milestones: ClientMilestone[]): Map<string, ClientMilestone[]> {
  const grouped = new Map<string, ClientMilestone[]>();
  for (const milestone of milestones) {
    const items = grouped.get(milestone.clientId) ?? [];
    items.push(milestone);
    grouped.set(milestone.clientId, items);
  }
  return grouped;
}

function clientRecord(client: Client, agencyProducts: AgencyProduct[], milestones: ClientMilestone[], relationshipWorkspaceCounts: Map<string, number>): FulfilmentClientRecord {
  const selections = resolvePortalProductAssignment(client.metadata ?? {}, agencyProducts).products;
  const agencyProductById = new Map(agencyProducts.map(product => [product.id, product]));
  const agencyProductByTemplate = new Map(agencyProducts.flatMap(product => product.portalTemplateKey ? [[product.portalTemplateKey, product] as const] : []));
  const workspaces = new Map(clientProductWorkspaces(client).map(workspace => [workspace.productId, workspace]));
  const products = selections.map(selection => {
    const agencyProduct = agencyProductById.get(selection.id) ?? (selection.catalogKey ? agencyProductByTemplate.get(selection.catalogKey) : undefined);
    const workspace = workspaces.get(selection.id);
    const columns = agencyProduct ? agencyProductPipelineColumns(agencyProduct) : undefined;
    const stageId = agencyProduct
      ? resolveClientProductStage(client, agencyProduct).stageId
      : workspace?.stage ?? "onboarding";
    const stageLabel = columns?.find(column => column.id === stageId)?.label ?? titleCase(String(stageId));
    return {
      id: selection.id,
      name: selection.name,
      catalogKey: selection.catalogKey,
      accentColor: selection.accentColor ?? agencyProduct?.accentColor ?? client.brand.primaryColor ?? "#237b78",
      stageLabel,
      progress: workspace ? portalWorkspaceProgress(workspace) : 0,
    };
  });

  const relevantProducts = selections.map(selection => agencyProductById.get(selection.id) ?? (selection.catalogKey ? agencyProductByTemplate.get(selection.catalogKey) : undefined));
  const openMilestones = milestones.filter(milestone => milestone.status !== "complete");
  const nextMilestone = openMilestones
    .filter(milestone => milestone.status !== "blocked")
    .sort((left, right) => (left.targetAt ?? Number.MAX_SAFE_INTEGER) - (right.targetAt ?? Number.MAX_SAFE_INTEGER))[0];

  return {
    id: client.id,
    name: client.name,
    relationshipId: clientRelationshipId(client),
    relationshipWorkspaceCount: relationshipWorkspaceCounts.get(clientRelationshipId(client)) ?? 1,
    workspaceLabel: client.workspaceLabel,
    stageLabel: phaseLabel(client.stage),
    ownerEmail: client.ownerEmail,
    portalReady: typeof client.metadata?.portalBuiltAt === "number",
    portalRequired: relevantProducts.some(product => product?.portalRequirement === "required"),
    progress: products.length ? Math.round(products.reduce((total, product) => total + product.progress, 0) / products.length) : 0,
    products,
    openMilestones: openMilestones.length,
    blockedMilestones: openMilestones.filter(milestone => milestone.status === "blocked").length,
    nextMilestone: nextMilestone ? { title: nextMilestone.title, targetAt: nextMilestone.targetAt } : undefined,
  };
}

function productRecord(product: AgencyProduct, clients: Client[], catalogue: AgencyProduct[], relationshipWorkspaceCounts: Map<string, number>): FulfilmentProductRecord {
  const clientNames = clients.flatMap(client => {
    const assigned = resolvePortalProductAssignment(client.metadata ?? {}, catalogue).products.some(selection =>
      selection.id === product.id || Boolean(product.portalTemplateKey && selection.catalogKey === product.portalTemplateKey)
    );
    return assigned ? [{
      id: client.id,
      name: client.name,
      workspaceLabel: client.workspaceLabel,
      relationshipWorkspaceCount: relationshipWorkspaceCounts.get(clientRelationshipId(client)) ?? 1,
    }] : [];
  });
  const selection = portalProductSelectionFromAgencyProduct(product);
  const module = portalProductModule(selection);
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description ?? "",
    accentColor: product.accentColor ?? serviceColor(productGroup(product)),
    portalTemplateKey: product.portalTemplateKey,
    portalRequirement: product.portalRequirement,
    deliverables: product.deliverables,
    workspacePages: module.pages.map(page => page.navLabel),
    assignmentCount: clientNames.length,
    clientNames,
    group: productGroup(product),
  };
}

function buildStageBoard(requestedProduct: string | undefined, clients: Client[], products: AgencyProduct[], relationshipWorkspaceCounts: Map<string, number>): FulfilmentStageBoard {
  const available = products.map(product => ({ key: product.id, label: product.name }));
  const requestedDefinition = products.find(product => product.id === requestedProduct)
    ?? products.find(product => product.portalTemplateKey === requestedProduct);
  const definition = requestedDefinition
    ?? products.find(product => clients.some(client => resolvePortalProductAssignment(client.metadata ?? {}, products).products.some(selection => selection.id === product.id)))
    ?? products[0];
  const columns = definition ? agencyProductPipelineColumns(definition) : [];
  const cardsFor = (product: AgencyProduct) => {
    const productColumns = agencyProductPipelineColumns(product);
    return clients.flatMap(client => {
      const assigned = resolvePortalProductAssignment(client.metadata ?? {}, products).products.some(selection => selection.id === product.id);
      if (!assigned) return [];
      const columnId = resolveClientProductStage(client, product).stageId;
      const revision = clientProductWorkspaces(client).find(workspace => workspace.productId === product.id)?.revision ?? 0;
      const linkedCount = relationshipWorkspaceCounts.get(clientRelationshipId(client)) ?? 1;
      return [{
        id: client.id,
        label: client.workspaceLabel ? `${client.name} · ${client.workspaceLabel}` : client.name,
        sub: linkedCount > 1 ? `${product.name} · linked buyer (${linkedCount})` : product.name,
        href: `/portal/clients/${client.id}?tab=delivery`,
        columnId,
        revision,
      }];
    });
  };
  const cards = definition ? cardsFor(definition) : [];
  const overviews = products.map(product => {
    const productCards = cardsFor(product);
    return {
      key: product.id,
      label: product.name,
      total: productCards.length,
      columns: agencyProductPipelineColumns(product).map(column => ({
        ...column,
        count: productCards.filter(card => card.columnId === column.id).length,
      })),
    };
  });
  return {
    productKey: definition?.id ?? "",
    productName: definition?.name ?? "Service",
    focused: Boolean(requestedProduct && requestedDefinition),
    products: available,
    columns,
    cards,
    overviews,
  };
}

function attentionItems(clients: FulfilmentClientRecord[], milestoneMap: Map<string, ClientMilestone[]>, canManage: boolean): FulfilmentAttentionItem[] {
  const now = Date.now();
  const items: FulfilmentAttentionItem[] = [];
  for (const client of clients) {
    const clientLabel = client.workspaceLabel ? `${client.name} · ${client.workspaceLabel}` : client.name;
    const milestones = milestoneMap.get(client.id) ?? [];
    for (const milestone of milestones.filter(item => item.status === "blocked")) {
      items.push({ id: `blocked:${milestone.id}`, title: `${clientLabel}: ${milestone.title}`, detail: milestone.description || "This milestone is blocked and needs an owner or decision.", href: `/portal/clients/${client.id}?tab=delivery`, level: "urgent", label: "Blocked" });
    }
    for (const milestone of milestones.filter(item => item.status !== "complete" && item.status !== "blocked" && item.targetAt && item.targetAt < now)) {
      items.push({ id: `overdue:${milestone.id}`, title: `${clientLabel}: ${milestone.title}`, detail: `Target date passed ${formatDate(milestone.targetAt!)}. Move it, complete it, or reset the expectation.`, href: `/portal/clients/${client.id}?tab=delivery`, level: "urgent", label: "Overdue" });
    }
    if (!client.products.length) items.push({ id: `service:${client.id}`, title: canManage ? `Assign a service to ${clientLabel}` : `${clientLabel}: service assignment missing`, detail: "The client has no product workspace, delivery stages, or defined outputs yet.", href: `/portal/clients/${client.id}?tab=delivery`, level: "high", label: canManage ? "Setup" : "Status" });
    if (client.portalRequired && !client.portalReady) items.push({ id: `portal:${client.id}`, title: canManage ? `Create ${clientLabel}'s portal` : `${clientLabel}: portal not created`, detail: "At least one assigned product requires a portal, but the shared client workspace is not ready.", href: `/portal/clients/${client.id}?tab=portal`, level: "high", label: "Portal" });
    if (!client.ownerEmail) items.push({ id: `email:${client.id}`, title: canManage ? `Add a primary contact for ${clientLabel}` : `${clientLabel}: primary contact missing`, detail: "Delivery updates and portal access cannot be sent without a client email.", href: `/portal/clients/${client.id}?tab=relationship`, level: "normal", label: "Contact" });
  }
  const rank = { urgent: 0, high: 1, normal: 2 } as const;
  return items.sort((left, right) => rank[left.level] - rank[right.level] || left.title.localeCompare(right.title));
}

function flowSummary(clients: FulfilmentClientRecord[]) {
  const flow = { queued: 0, active: 0, review: 0, delivered: 0 };
  for (const product of clients.flatMap(client => client.products)) {
    const label = product.stageLabel.toLowerCase();
    if (product.progress >= 95 || /deliver|live|complete|care/.test(label)) flow.delivered += 1;
    else if (/review|approval|select|quality|handover|launch/.test(label) || product.progress >= 70) flow.review += 1;
    else if (product.progress > 0 || !/brief|intake|discover|plan|queue/.test(label)) flow.active += 1;
    else flow.queued += 1;
  }
  return flow;
}

function productGroup(product: AgencyProduct): ServiceGroupKey {
  const value = `${product.name} ${product.category}`.toLowerCase();
  if (product.portalTemplateKey === "content" || product.portalTemplateKey === "social-ads" || product.portalTemplateKey === "google-profile") return "growth";
  if (product.portalTemplateKey === "photography" || product.portalTemplateKey === "brand-identity") return "creative";
  if (product.portalTemplateKey === "website") return "digital";
  if (product.portalTemplateKey === "automation" || product.portalTemplateKey === "custom-software") return "systems";
  if (product.portalTemplateKey === "ongoing-care" || product.portalTemplateKey === "business-os" || product.portalTemplateKey === "health-check") return "care";
  if (/social|content|campaign|seo|google|marketing/.test(value)) return "growth";
  if (/photo|video|media|brand|creative|film/.test(value)) return "creative";
  if (/website|web design|landing|funnel/.test(value)) return "digital";
  if (/software|automation|system|integration|app/.test(value)) return "systems";
  if (/care|advis|audit|support|consult/.test(value)) return "care";
  return "custom";
}

function serviceColor(group: ServiceGroupKey): string {
  return group === "creative" ? "#9a5a73" : group === "growth" ? "#ad6a2b" : group === "digital" ? "#3874a5" : group === "systems" ? "#6270a8" : group === "care" ? "#38816b" : "#6f7780";
}

function titleCase(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatDate(value: number): string {
  return formatUkDate(value, { day: "numeric", month: "short" });
}
