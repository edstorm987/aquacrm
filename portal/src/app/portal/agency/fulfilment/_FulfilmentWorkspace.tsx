import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  CircleAlert,
  Code2,
  FolderKanban,
  Gauge,
  Layers3,
  Megaphone,
  MonitorCog,
  PackageCheck,
  PanelLeftOpen,
  PanelsTopLeft,
  Settings2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { PipelineBoard } from "../pipelines/[slug]/_PipelineBoard";
import { PortalsWorkspace, type PortalTemplateProductRecord, type PortalWorkspaceRecord } from "../portals/_PortalsWorkspace";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";
import { ProductsWorkspace } from "../products/_ProductsWorkspace";
import type { AgencyProduct, SopDocument, TradingCompany } from "@/server/types";
import { clientWorkspaceDisplayName, clientWorkspaceHref } from "@/lib/clientWorkspace";

export type FulfilmentView = "overview" | "stages" | "services" | "technical" | "products" | "clients" | "portals";

export interface FulfilmentProductRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  accentColor: string;
  portalTemplateKey?: string;
  portalRequirement: "required" | "optional" | "none";
  deliverables: string[];
  workspacePages: string[];
  assignmentCount: number;
  clientNames: Array<{ id: string; name: string; workspaceLabel?: string; relationshipWorkspaceCount: number }>;
  group: ServiceGroupKey;
}

export interface FulfilmentClientProductRecord {
  id: string;
  name: string;
  catalogKey?: string;
  accentColor: string;
  stageLabel: string;
  progress: number;
}

export interface FulfilmentClientRecord {
  id: string;
  name: string;
  relationshipId: string;
  relationshipWorkspaceCount: number;
  workspaceLabel?: string;
  stageLabel: string;
  ownerEmail?: string;
  portalReady: boolean;
  portalRequired: boolean;
  progress: number;
  products: FulfilmentClientProductRecord[];
  openMilestones: number;
  blockedMilestones: number;
  nextMilestone?: { title: string; targetAt?: number };
}

export interface FulfilmentAttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  level: "urgent" | "high" | "normal";
  label: string;
}

export type ServiceGroupKey = "creative" | "growth" | "digital" | "systems" | "care" | "custom";

export interface FulfilmentStageBoard {
  productKey: string;
  productName: string;
  products: Array<{ key: string; label: string }>;
  columns: Array<{ id: string; label: string; color?: string }>;
  cards: Array<{ id: string; label: string; sub?: string; href?: string; columnId: string }>;
}

interface FlowSummary {
  queued: number;
  active: number;
  review: number;
  delivered: number;
}

const VIEW_ITEMS: Array<{ id: FulfilmentView; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "stages", label: "Stage board", icon: FolderKanban },
  { id: "services", label: "Service workspaces", icon: Layers3 },
  { id: "technical", label: "Technical delivery", icon: Code2 },
  { id: "products", label: "Product editor", icon: PackageCheck },
  { id: "clients", label: "Client workspaces", icon: UsersRound },
  { id: "portals", label: "Portals", icon: PanelsTopLeft },
];

const GROUPS: Array<{ id: ServiceGroupKey; label: string; detail: string; icon: typeof Gauge }> = [
  { id: "creative", label: "Creative production", detail: "Photography, media, brand and asset delivery.", icon: Camera },
  { id: "growth", label: "Content and growth", detail: "Social, content, profiles and campaign fulfilment.", icon: Megaphone },
  { id: "digital", label: "Web and digital", detail: "Websites, launches and digital product delivery.", icon: MonitorCog },
  { id: "systems", label: "Systems and automation", detail: "Software, workflows, integrations and handover.", icon: Code2 },
  { id: "care", label: "Care and advisory", detail: "Ongoing support, reviews and strategic programmes.", icon: Sparkles },
  { id: "custom", label: "Custom services", detail: "Bespoke offers with their own delivery records.", icon: BriefcaseBusiness },
];

export function FulfilmentWorkspace({
  view,
  products,
  clients,
  attention,
  flow,
  stageBoard,
  portals,
  portalProducts,
  productEditor,
  technicalWorkspace,
  canManage,
}: {
  view: FulfilmentView;
  products: FulfilmentProductRecord[];
  clients: FulfilmentClientRecord[];
  attention: FulfilmentAttentionItem[];
  flow: FlowSummary;
  stageBoard: FulfilmentStageBoard;
  portals: PortalWorkspaceRecord[];
  portalProducts: PortalTemplateProductRecord[];
  productEditor: {
    initialProducts: AgencyProduct[];
    sops: SopDocument[];
    companies: TradingCompany[];
    defaults: { taxRatePercent: number; paymentTermsDays: number };
  };
  technicalWorkspace?: ReactNode;
  canManage: boolean;
}) {
  const activeServices = clients.reduce((total, client) => total + client.products.length, 0);
  const portalReady = clients.filter(client => client.portalReady).length;
  const blocked = clients.reduce((total, client) => total + client.blockedMilestones, 0);
  const averageProgress = activeServices
    ? Math.round(clients.flatMap(client => client.products).reduce((total, product) => total + product.progress, 0) / activeServices)
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1600px]" data-testid="fulfilment-command-centre">
      <header className="border-b border-black/10 pb-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Delivery operating system</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90 sm:text-4xl">Fulfilment</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
              Run every client outcome from one place, including production, websites, software, releases, monitoring, social services, advisory programmes and bespoke packages.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link href="/portal/agency/fulfilment?view=clients" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]">
              <PanelLeftOpen size={15} /> Client workspaces
            </Link>
            <Link href="/portal/agency/actions" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]">
              <CheckCircle2 size={15} /> Delivery tasks
            </Link>
            <Link href="/portal/agency/fulfilment?view=products" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
              <Settings2 size={15} /> Manage services
            </Link>
          </div>
        </div>

        <nav aria-label="Fulfilment workspace views" className="mt-5 grid w-full grid-cols-2 gap-1 rounded-md border border-black/10 bg-white p-1 sm:flex sm:overflow-x-auto">
          {VIEW_ITEMS.map(item => {
            const Icon = item.icon;
            const active = item.id === view;
            const href = item.id === "overview" ? "/portal/agency/fulfilment" : `/portal/agency/fulfilment?view=${item.id}`;
            return (
              <Link key={item.id} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded px-2 text-center text-xs font-semibold sm:shrink-0 sm:px-3 sm:text-sm ${active ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04] hover:text-black/80"}`}>
                <Icon size={15} /> {item.label}{item.id === "clients" ? <AttentionDot prefixHref="/portal/clients?tab=delivery" /> : null}
              </Link>
            );
          })}
        </nav>
      </header>

      {view === "overview" ? <Overview
        products={products}
        clients={clients}
        attention={attention}
        flow={flow}
        metrics={{ activeServices, portalReady, blocked, averageProgress }}
      /> : null}
      {view === "stages" ? <StageBoard board={stageBoard} /> : null}
      {view === "services" ? <ServiceWorkspaces products={products} /> : null}
      {view === "technical" ? <div className="pt-6">{technicalWorkspace}</div> : null}
      {view === "products" ? (
        <div className="pt-6">
          {canManage ? (
            <ProductsWorkspace
              initialProducts={productEditor.initialProducts}
              sops={productEditor.sops}
              companies={productEditor.companies}
              defaults={productEditor.defaults}
              embedded
              embeddedLabel="Fulfilment catalogue"
            />
          ) : (
            <section className="flex min-h-56 items-center border-y border-black/10 py-8">
              <div className="max-w-xl">
                <CircleAlert size={22} className="text-amber-600" />
                <h2 className="mt-3 text-xl font-semibold text-black/85">Catalogue management is restricted</h2>
                <p className="mt-2 text-sm leading-6 text-black/55">An owner or manager can edit products, pricing, contracts, delivery instructions and portal behaviour.</p>
              </div>
            </section>
          )}
        </div>
      ) : null}
      {view === "clients" ? <ClientDelivery clients={clients} /> : null}
      {view === "portals" ? (
        <div className="pt-6">
          <PortalsWorkspace portals={portals} products={portalProducts} initialView="library" canManage={canManage} embedded />
        </div>
      ) : null}
    </div>
  );
}

function Overview({
  products,
  clients,
  attention,
  flow,
  metrics,
}: {
  products: FulfilmentProductRecord[];
  clients: FulfilmentClientRecord[];
  attention: FulfilmentAttentionItem[];
  flow: FlowSummary;
  metrics: { activeServices: number; portalReady: number; blocked: number; averageProgress: number };
}) {
  return (
    <div className="space-y-7 pt-6">
      <section aria-label="Fulfilment summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active clients" value={clients.length} detail="Delivery relationships" icon={<UsersRound size={17} />} tone="blue" />
        <Metric label="Service tracks" value={metrics.activeServices} detail="Products being delivered" icon={<PackageCheck size={17} />} tone="violet" />
        <Metric label="Average progress" value={`${metrics.averageProgress}%`} detail="Across product workspaces" icon={<Gauge size={17} />} tone="emerald" />
        <Metric label="Portals ready" value={`${metrics.portalReady}/${clients.length}`} detail="Shared client workspaces" icon={<PanelsTopLeft size={17} />} tone="blue" />
        <Metric label="Blocked" value={metrics.blocked} detail="Milestones needing action" icon={<CircleAlert size={17} />} tone={metrics.blocked ? "amber" : "emerald"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
        <section className="min-w-0">
          <SectionHeading eyebrow="Execution queue" title="What needs attention" detail="The delivery risks and missing setup that can stop work moving." action={{ label: "Open delivery tasks", href: "/portal/agency/actions" }} />
          <div className="mt-3 divide-y divide-black/[0.08] border-y border-black/10">
            {attention.slice(0, 8).map(item => <AttentionRow key={item.id} item={item} />)}
            {!attention.length ? (
              <div className="flex min-h-32 items-center gap-3 py-6 text-sm text-black/50">
                <CheckCircle2 size={20} className="text-emerald-600" /> No blocked, overdue, or unconfigured client delivery found.
              </div>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 border-t border-black/10 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <SectionHeading eyebrow="Portfolio flow" title="Where the work sits" detail="Every assigned service rolled into four practical states." />
          <div className="mt-5 space-y-4">
            <FlowRow label="Queued and brief" value={flow.queued} total={metrics.activeServices} color="#657487" />
            <FlowRow label="In production" value={flow.active} total={metrics.activeServices} color="#2f75a8" />
            <FlowRow label="Review and approval" value={flow.review} total={metrics.activeServices} color="#b8751a" />
            <FlowRow label="Delivered or live" value={flow.delivered} total={metrics.activeServices} color="#23825f" />
          </div>
          <Link href="/portal/agency/fulfilment?view=stages" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand hover:underline">
            Open drag-and-drop stage board <ArrowRight size={15} />
          </Link>
        </section>
      </div>

      <section>
        <SectionHeading eyebrow="Service architecture" title="Delivery departments" detail="Each service keeps its own stages, outputs and client workspace while remaining part of one fulfilment system." action={{ label: "View all workspaces", href: "/portal/agency/fulfilment?view=services" }} />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GROUPS.map(group => {
            const grouped = products.filter(product => product.group === group.id);
            if (!grouped.length) return null;
            const Icon = group.icon;
            return (
              <Link key={group.id} href="/portal/agency/fulfilment?view=services" className="mm-surface-card mm-hover-lift flex min-h-36 flex-col rounded-md p-4">
                <div className="flex items-start justify-between gap-4">
                  <span className="mm-area-icon grid size-9 place-items-center rounded-md"><Icon size={17} /></span>
                  <span className="text-xs font-semibold tabular-nums text-black/40">{grouped.reduce((total, product) => total + product.assignmentCount, 0)} active</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-black/80">{group.label}</h3>
                <p className="mt-1 text-xs leading-5 text-black/45">{grouped.map(product => product.name).slice(0, 3).join(" · ")}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-black/10 pt-6">
        <SectionHeading
          eyebrow="Internal client access"
          title="Open a client workspace"
          detail="Move from the fulfilment control room into the complete internal client record, including its assigned services, milestones, files, portal and delivery tools."
          action={{ label: "View every client workspace", href: "/portal/agency/fulfilment?view=clients" }}
        />
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {clients.slice(0, 6).map(client => (
            <Link key={client.id} href={clientWorkspaceHref(client.id, "delivery")} className="mm-interactive-row flex min-h-20 items-center gap-3 rounded-md border border-black/[0.09] bg-white p-3 hover:bg-black/[0.02]">
              <span className="mm-area-icon grid size-9 shrink-0 place-items-center rounded-md"><PanelLeftOpen size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-sm font-semibold text-black/72">{clientWorkspaceDisplayName(client)}</span>{client.relationshipWorkspaceCount > 1 ? <LinkedBuyerCount count={client.relationshipWorkspaceCount} /> : null}</span>
                <span className="mt-0.5 block truncate text-xs text-black/42">{client.products.length ? `${client.products.length} service workspace${client.products.length === 1 ? "" : "s"} · ${client.progress}% complete` : "Assign the first service"}</span>
              </span>
              <ArrowRight size={15} className="shrink-0 text-black/30" />
            </Link>
          ))}
          {!clients.length ? <p className="py-6 text-sm text-black/45">No active client workspaces are available yet.</p> : null}
        </div>
      </section>

      <section className="border-t border-black/10 pt-6">
        <SectionHeading eyebrow="Connected workspaces" title="Delivery toolkit" detail="Specialist tools stay focused while Fulfilment remains the control room." />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ToolkitLink href="/portal/agency/fulfilment?view=portals" title="Client portals" detail="Preview, edit and launch the shared experience." icon={<PanelsTopLeft size={17} />} />
          <ToolkitLink href="/portal/agency/fulfilment?view=technical" title="Technical delivery" detail="Projects, repositories, releases and performance." icon={<Code2 size={17} />} />
          <ToolkitLink href="/portal/agency/sop-library" title="SOP library" detail="Open the procedure behind repeatable delivery." icon={<BriefcaseBusiness size={17} />} />
          <ToolkitLink href="/portal/agency?station=battle&battle=capacity" title="Capacity" detail="Check whether the team can take on the work." icon={<Gauge size={17} />} />
        </div>
      </section>
    </div>
  );
}

function StageBoard({ board }: { board: FulfilmentStageBoard }) {
  return (
    <div className="pt-6">
      <PipelineBoard
        title={`${board.productName} delivery`}
        eyebrow="Product-aware fulfilment"
        description="Move each client through the stages designed for this service. Changes update the same Journey fulfilment pipeline used everywhere else."
        activeSlug="fulfilment"
        boards={[]}
        columns={board.columns}
        cards={board.cards}
        productKey={board.productKey}
        productViews={board.products}
        productBasePath="/portal/agency/fulfilment?view=stages"
        showProductOverview={false}
        embedded
      />
    </div>
  );
}

function ServiceWorkspaces({ products }: { products: FulfilmentProductRecord[] }) {
  return (
    <div className="space-y-8 pt-6">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold text-black/88">Service workspaces</h2>
        <p className="mt-2 text-sm leading-6 text-black/52">Every product is a standalone delivery system with its own workflow, deliverables and portal pages. Packages can combine these systems without flattening them into a generic project.</p>
      </div>
      {GROUPS.map(group => {
        const grouped = products.filter(product => product.group === group.id);
        if (!grouped.length) return null;
        const Icon = group.icon;
        return (
          <section key={group.id}>
            <div className="flex items-start gap-3 border-b border-black/10 pb-3">
              <span className="mm-area-icon grid size-9 shrink-0 place-items-center rounded-md"><Icon size={17} /></span>
              <div><h3 className="text-base font-semibold text-black/82">{group.label}</h3><p className="mt-0.5 text-xs text-black/45">{group.detail}</p></div>
            </div>
            <div className="grid gap-3 pt-4 lg:grid-cols-2 2xl:grid-cols-3">
              {grouped.map(product => <ProductWorkspaceCard key={product.id} product={product} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProductWorkspaceCard({ product }: { product: FulfilmentProductRecord }) {
  const boardHref = product.portalTemplateKey
    ? `/portal/agency/fulfilment?view=stages&product=${encodeURIComponent(product.portalTemplateKey)}`
    : `/portal/agency/products/${product.id}`;
  return (
    <article className="mm-surface-card overflow-hidden rounded-md">
      <div className="h-1" style={{ backgroundColor: product.accentColor }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{product.category}</p>
            <h4 className="mt-1 text-base font-semibold text-black/82">{product.name}</h4>
          </div>
          <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold text-black/50">{product.assignmentCount} client{product.assignmentCount === 1 ? "" : "s"}</span>
        </div>
        <p className="mt-2 min-h-10 text-sm leading-5 text-black/48">{product.description || "A configurable service delivery workspace."}</p>

        <div className="mt-4 border-y border-black/[0.08] py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Workspace sections</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {product.workspacePages.slice(0, 5).map(page => <span key={page} className="rounded bg-black/[0.045] px-2 py-1 text-[11px] text-black/52">{page}</span>)}
          </div>
        </div>

        <div className="mt-3 flex min-h-6 flex-wrap gap-x-3 gap-y-1 text-xs text-black/45">
          {product.clientNames.slice(0, 3).map(client => <Link key={client.id} href={clientWorkspaceHref(client.id, "delivery", { product: product.id })} title={client.relationshipWorkspaceCount > 1 ? `${client.relationshipWorkspaceCount} isolated workspaces for this buyer` : undefined} className="inline-flex items-center gap-1 hover:text-brand hover:underline"><PanelLeftOpen size={11} />{clientWorkspaceDisplayName(client)}</Link>)}
          {!product.clientNames.length ? <span>No client assignments yet</span> : null}
          {product.clientNames.length > 3 ? <span>+{product.clientNames.length - 3} more</span> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={boardHref} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85"><FolderKanban size={15} /> {product.portalTemplateKey ? "Open stage board" : "Open product"}</Link>
          <Link href="/portal/agency/fulfilment?view=products" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-semibold text-black/60 hover:bg-black/[0.03]"><Settings2 size={15} /> Configure</Link>
        </div>
      </div>
    </article>
  );
}

function ClientDelivery({ clients }: { clients: FulfilmentClientRecord[] }) {
  return (
    <div className="pt-6">
      <SectionHeading eyebrow="Internal client access" title="Client workspaces" detail="Open the complete internal workspace for any client, then move between their relationship, delivery services, files, finance, notes and portal from the dedicated sidebar." />
      <div className="mt-4 divide-y divide-black/[0.08] border-y border-black/10">
        {clients.map(client => (
          <article key={client.id} className="grid gap-4 py-5 lg:grid-cols-[minmax(180px,.65fr)_minmax(300px,1.45fr)_minmax(180px,.55fr)_minmax(190px,auto)] lg:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5"><Link href={clientWorkspaceHref(client.id, "delivery")} className="truncate text-sm font-semibold text-black/82 hover:underline">{clientWorkspaceDisplayName(client)}</Link>{client.relationshipWorkspaceCount > 1 ? <LinkedBuyerCount count={client.relationshipWorkspaceCount} /> : null}</div>
              <p className="mt-1 truncate text-xs text-black/42">{client.ownerEmail || "No primary email"} · {client.stageLabel}</p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {client.products.map(product => (
                <Link key={product.id} href={clientWorkspaceHref(client.id, "delivery", { product: product.id })} title={`Open ${product.name} in ${clientWorkspaceDisplayName(client)} · ${product.stageLabel} · ${product.progress}% complete`} className="inline-flex max-w-full items-center gap-2 rounded-md border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-black/58 hover:border-brand/25 hover:bg-brand/[0.035]">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: product.accentColor }} />
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="tabular-nums text-black/35">{product.progress}%</span>
                </Link>
              ))}
              {!client.products.length ? <span className="text-xs font-medium text-amber-700">No service assigned</span> : null}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs"><span className="text-black/40">Overall progress</span><span className="font-semibold tabular-nums text-black/60">{client.progress}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${client.progress}%` }} /></div>
              <p className="mt-2 text-[11px] text-black/40">{client.blockedMilestones ? `${client.blockedMilestones} blocked` : client.nextMilestone ? `Next: ${client.nextMilestone.title}` : `${client.openMilestones} open milestones`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${client.portalReady ? "bg-emerald-50 text-emerald-700" : client.portalRequired ? "bg-amber-50 text-amber-700" : "bg-black/5 text-black/45"}`}>{client.portalReady ? "Portal ready" : client.portalRequired ? "Portal needed" : "Portal optional"}</span>
              <Link href={clientWorkspaceHref(client.id, "delivery")} aria-label={`Open ${clientWorkspaceDisplayName(client)} internal workspace`} title="Open internal client workspace" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85"><PanelLeftOpen size={15} /> Open workspace</Link>
            </div>
          </article>
        ))}
        {!clients.length ? <p className="py-16 text-center text-sm text-black/45">No active clients are ready for fulfilment yet.</p> : null}
      </div>
    </div>
  );
}

function LinkedBuyerCount({ count }: { count: number }) {
  return <span title={`${count} isolated project workspaces belong to this buyer relationship`} className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">{count} linked</span>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string | number; detail: string; icon: ReactNode; tone: "blue" | "violet" | "emerald" | "amber" }) {
  return <div className="mm-kpi-card mm-surface-card mm-hover-lift flex min-h-28 items-start gap-3 rounded-md p-4" data-kpi-tone={tone}><span className="mm-kpi-icon grid size-8 shrink-0 place-items-center rounded-md">{icon}</span><div className="min-w-0"><p className="text-xs font-medium text-black/45">{label}</p><p className="mt-1 text-2xl font-semibold text-black/85">{value}</p><p className="mt-1 text-xs text-black/40">{detail}</p></div></div>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: { label: string; href: string } }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-brand">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-black/82">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-black/45">{detail}</p></div>{action ? <Link href={action.href} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-xs font-semibold text-brand hover:underline">{action.label}<ArrowRight size={14} /></Link> : null}</div>;
}

function AttentionRow({ item }: { item: FulfilmentAttentionItem }) {
  const tone = item.level === "urgent" ? "bg-red-50 text-red-700" : item.level === "high" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return <Link href={item.href} className="mm-interactive-row grid gap-2 py-3 hover:bg-black/[0.02] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className={`w-fit rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{item.label}</span><span className="min-w-0"><span className="block text-sm font-semibold text-black/75">{item.title}</span><span className="mt-0.5 block text-xs leading-5 text-black/43">{item.detail}</span></span><ArrowRight size={15} className="hidden text-black/30 sm:block" /></Link>;
}

function FlowRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total ? Math.round(value / total * 100) : 0;
  return <div><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-black/58">{label}</span><span className="tabular-nums text-black/42">{value} · {percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} /></div></div>;
}

function ToolkitLink({ href, title, detail, icon }: { href: string; title: string; detail: string; icon: ReactNode }) {
  return <Link href={href} className="mm-interactive-row flex min-h-20 items-center gap-3 rounded-md border border-black/[0.09] bg-white p-3 hover:bg-black/[0.02]"><span className="mm-area-icon grid size-9 shrink-0 place-items-center rounded-md">{icon}</span><span className="min-w-0"><span className="block text-sm font-semibold text-black/72">{title}</span><span className="mt-0.5 block text-xs leading-4 text-black/42">{detail}</span></span></Link>;
}
