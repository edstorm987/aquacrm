import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES, type AgencyProduct, type Client, type ClientMilestone } from "@/server/types";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { listClientMilestones } from "@/server/clientMilestones";
import { phaseLabel } from "@/server/phases";
import { clientProductWorkspaces } from "@/server/productWorkspaces";
import { listClients } from "@/server/tenants";
import { cleanPortalProducts, portalProductSelectionFromAgencyProduct, PORTAL_PRODUCT_CATALOG, type PortalProductKey } from "@/lib/portalProducts";
import { portalProductModule } from "@/lib/portalProductModules";
import { portalWorkspaceProgress } from "@/lib/portalProductWorkspaces";
import { defaultProductPipelineStage, PRODUCT_PIPELINE_COLUMNS } from "@/lib/fulfilmentProductPipelines";
import { portalWorkspaceData } from "../portals/_portalWorkspaceData";
import { listSops } from "@/server/sops";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import DevelopmentPage from "../development/page";
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
  technical?: string;
  status?: string;
}

const VALID_VIEWS: readonly FulfilmentView[] = ["overview", "stages", "services", "technical", "products", "clients", "portals"];

export default async function FulfilmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const requested = await searchParams;
  const view = VALID_VIEWS.includes(requested.view as FulfilmentView) ? requested.view as FulfilmentView : "overview";
  ensureDefaultAgencyProducts(agencyId);
  const allAgencyProducts = listAgencyProducts(agencyId, true);
  const agencyProducts = allAgencyProducts.filter(product => product.active);
  const clients = listClients(agencyId).filter(client => client.status === "active" && client.stage !== "churned");
  const milestones = listClientMilestones(agencyId);
  const milestoneMap = groupMilestones(milestones);
  const clientRecords = clients.map(client => clientRecord(client, agencyProducts, milestoneMap.get(client.id) ?? []));
  const productRecords = agencyProducts.map(product => productRecord(product, clients));
  const attention = attentionItems(clientRecords, milestoneMap);
  const flow = flowSummary(clientRecords);
  const stageBoard = buildStageBoard(requested.product, clients, agencyProducts);
  const { portals, products: portalProducts } = portalWorkspaceData(agencyId, session.userId);
  const settings = getAgencyWorkspaceSettings(agencyId);

  return <FulfilmentWorkspace
    view={view}
    products={productRecords}
    clients={clientRecords}
    attention={attention}
    flow={flow}
    stageBoard={stageBoard}
    portals={portals}
    portalProducts={portalProducts}
    productEditor={{
      initialProducts: allAgencyProducts,
      sops: listSops(agencyId),
      companies: listTradingCompanies(agencyId, true),
      defaults: { taxRatePercent: settings.defaultTaxRatePercent, paymentTermsDays: settings.defaultPaymentTermsDays },
    }}
    technicalWorkspace={view === "technical" ? (
      <DevelopmentPage searchParams={Promise.resolve({
        view: requested.technical === "projects" ? "workspace" : "overview",
        status: requested.status,
      })} />
    ) : undefined}
    canManage={session.role === "agency-owner" || session.role === "agency-manager"}
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

function clientRecord(client: Client, agencyProducts: AgencyProduct[], milestones: ClientMilestone[]): FulfilmentClientRecord {
  const selections = cleanPortalProducts(client.metadata?.portalProducts);
  const agencyProductById = new Map(agencyProducts.map(product => [product.id, product]));
  const agencyProductByTemplate = new Map(agencyProducts.flatMap(product => product.portalTemplateKey ? [[product.portalTemplateKey, product] as const] : []));
  const workspaces = new Map(clientProductWorkspaces(client).map(workspace => [workspace.productId, workspace]));
  const storedStages = client.metadata?.productPipelineStages && typeof client.metadata.productPipelineStages === "object"
    ? client.metadata.productPipelineStages as Record<string, unknown>
    : {};

  const products = selections.map(selection => {
    const agencyProduct = agencyProductById.get(selection.id) ?? (selection.catalogKey ? agencyProductByTemplate.get(selection.catalogKey) : undefined);
    const workspace = workspaces.get(selection.id);
    const definition = selection.catalogKey ? PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === selection.catalogKey) : undefined;
    const columns = selection.catalogKey ? PRODUCT_PIPELINE_COLUMNS[selection.catalogKey] : undefined;
    const storedStage = selection.catalogKey && typeof storedStages[selection.catalogKey] === "string" ? storedStages[selection.catalogKey] as string : "";
    const stageId = columns?.some(column => column.id === storedStage)
      ? storedStage
      : selection.catalogKey ? defaultProductPipelineStage(selection.catalogKey, client.stage) : workspace?.stage ?? "onboarding";
    const stageLabel = columns?.find(column => column.id === stageId)?.label ?? titleCase(String(stageId));
    return {
      id: selection.id,
      name: selection.name,
      catalogKey: selection.catalogKey,
      accentColor: selection.accentColor ?? agencyProduct?.accentColor ?? client.brand.primaryColor ?? "#237b78",
      stageLabel: definition ? stageLabel : titleCase(workspace?.stage ?? "onboarding"),
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

function productRecord(product: AgencyProduct, clients: Client[]): FulfilmentProductRecord {
  const clientNames = clients.flatMap(client => {
    const assigned = cleanPortalProducts(client.metadata?.portalProducts).some(selection =>
      selection.id === product.id || Boolean(product.portalTemplateKey && selection.catalogKey === product.portalTemplateKey)
    );
    return assigned ? [{ id: client.id, name: client.name }] : [];
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

function buildStageBoard(requestedProduct: string | undefined, clients: Client[], products: AgencyProduct[]): FulfilmentStageBoard {
  const available = products.flatMap(product => product.portalTemplateKey ? [{ key: product.portalTemplateKey, label: product.name }] : []);
  const unique = Array.from(new Map(available.map(product => [product.key, product])).values());
  const selectedKey = unique.some(product => product.key === requestedProduct)
    ? requestedProduct as PortalProductKey
    : unique.find(product => clients.some(client => cleanPortalProducts(client.metadata?.portalProducts).some(selection => selection.catalogKey === product.key)))?.key as PortalProductKey | undefined
      ?? unique[0]?.key as PortalProductKey | undefined
      ?? "website";
  const definition = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === selectedKey) ?? PORTAL_PRODUCT_CATALOG[0]!;
  const columns = PRODUCT_PIPELINE_COLUMNS[definition.catalogKey];
  const cards = clients.flatMap(client => {
    const assigned = cleanPortalProducts(client.metadata?.portalProducts).some(product => product.catalogKey === definition.catalogKey);
    if (!assigned) return [];
    const stages = client.metadata?.productPipelineStages && typeof client.metadata.productPipelineStages === "object"
      ? client.metadata.productPipelineStages as Record<string, unknown>
      : {};
    const stored = typeof stages[definition.catalogKey] === "string" ? stages[definition.catalogKey] as string : "";
    const columnId = columns.some(column => column.id === stored) ? stored : defaultProductPipelineStage(definition.catalogKey, client.stage);
    return [{ id: client.id, label: client.name, sub: definition.name, href: `/portal/clients/${client.id}?tab=delivery`, columnId }];
  });
  return { productKey: definition.catalogKey, productName: definition.name, products: unique, columns, cards };
}

function attentionItems(clients: FulfilmentClientRecord[], milestoneMap: Map<string, ClientMilestone[]>): FulfilmentAttentionItem[] {
  const now = Date.now();
  const items: FulfilmentAttentionItem[] = [];
  for (const client of clients) {
    const milestones = milestoneMap.get(client.id) ?? [];
    for (const milestone of milestones.filter(item => item.status === "blocked")) {
      items.push({ id: `blocked:${milestone.id}`, title: `${client.name}: ${milestone.title}`, detail: milestone.description || "This milestone is blocked and needs an owner or decision.", href: `/portal/clients/${client.id}?tab=delivery`, level: "urgent", label: "Blocked" });
    }
    for (const milestone of milestones.filter(item => item.status !== "complete" && item.status !== "blocked" && item.targetAt && item.targetAt < now)) {
      items.push({ id: `overdue:${milestone.id}`, title: `${client.name}: ${milestone.title}`, detail: `Target date passed ${formatDate(milestone.targetAt!)}. Move it, complete it, or reset the expectation.`, href: `/portal/clients/${client.id}?tab=delivery`, level: "urgent", label: "Overdue" });
    }
    if (!client.products.length) items.push({ id: `service:${client.id}`, title: `Assign a service to ${client.name}`, detail: "The client has no product workspace, delivery stages, or defined outputs yet.", href: `/portal/clients/${client.id}?tab=delivery`, level: "high", label: "Setup" });
    if (client.portalRequired && !client.portalReady) items.push({ id: `portal:${client.id}`, title: `Create ${client.name}'s portal`, detail: "At least one assigned product requires a portal, but the shared client workspace is not ready.", href: `/portal/clients/${client.id}?tab=portal`, level: "high", label: "Portal" });
    if (!client.ownerEmail) items.push({ id: `email:${client.id}`, title: `Add a primary contact for ${client.name}`, detail: "Delivery updates and portal access cannot be sent without a client email.", href: `/portal/clients/${client.id}?tab=relationship`, level: "normal", label: "Contact" });
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
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(value);
}
