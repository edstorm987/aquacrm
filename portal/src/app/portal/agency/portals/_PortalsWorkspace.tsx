"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Eye,
  LayoutPanelTop,
  MailCheck,
  MonitorCog,
  PackagePlus,
  Search,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { PortalProductDefinition } from "@/lib/portal/portalProducts";
import { PORTAL_PHASE_LABELS } from "@/lib/portal/portalProducts";

export type PortalWorkspaceRecord = {
  id: string;
  name: string;
  ownerEmail?: string;
  status: string;
  stageLabel: string;
  companyName?: string;
  accentColor: string;
  portalBuiltAt?: number;
  portalUpdatedAt?: number;
  portalAccessSentAt?: number;
  portalAccessPreparedAt?: number;
  portalLoginEmail?: string;
  portalMode: "onboarding" | "designing" | "developed-launch" | "maintenance";
  portalServicePlan?: string;
  productCount: number;
};

export type PortalTemplateProductRecord = {
  id: string;
  name: string;
  active: boolean;
  portalRequirement: "required" | "optional" | "none";
  portalTemplateKey?: PortalProductDefinition["catalogKey"];
  portalHeadline?: string;
  portalWelcomeNote?: string;
  portalStageFocus?: Partial<Record<PortalWorkspaceRecord["portalMode"], string>>;
  portalSupportCta?: string;
  accentColor?: string;
  deliverables: string[];
  portalDesignTemplateId?: string;
  portalDesignVersionId?: string;
  portalDesignUpdatedAt?: number;
};

type View = "library" | "templates";
type Filter = "all" | "ready" | "needs-setup" | "access-sent" | "live";

const MODE_LABELS: Record<PortalWorkspaceRecord["portalMode"], string> = PORTAL_PHASE_LABELS;

export function PortalsWorkspace({
  portals,
  products,
  initialView,
  canManage,
  embedded = false,
}: {
  portals: PortalWorkspaceRecord[];
  products: PortalTemplateProductRecord[];
  initialView: View;
  canManage: boolean;
  embedded?: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const built = portals.filter(portal => portal.portalBuiltAt).length;
  const ready = portals.filter(isReadyToInvite).length;
  const accessSent = portals.filter(portal => portal.portalAccessSentAt).length;
  const needsSetup = portals.length - ready;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return portals.filter(portal => {
      const matchesTerm = !term || [
        portal.name,
        portal.ownerEmail,
        portal.portalLoginEmail,
        portal.companyName,
        portal.portalServicePlan,
        portal.stageLabel,
      ].some(value => value?.toLowerCase().includes(term));
      const matchesFilter = filter === "all"
        || filter === "ready" && isReadyToInvite(portal)
        || filter === "needs-setup" && !isReadyToInvite(portal)
        || filter === "access-sent" && Boolean(portal.portalAccessSentAt)
        || filter === "live" && portal.portalBuiltAt && portal.portalMode === "maintenance";
      return matchesTerm && matchesFilter;
    });
  }, [filter, portals, query]);

  function chooseView(next: View) {
    setView(next);
    if (embedded) return;
    const url = new URL(window.location.href);
    if (next === "templates") url.searchParams.set("view", "templates");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openEditor() {
    const firstPortal = portals.find(portal => portal.portalBuiltAt) ?? portals[0];
    const query = new URLSearchParams({ scope: firstPortal ? "client" : "template" });
    if (firstPortal) query.set("clientId", firstPortal.id);
    window.location.assign(`/portal/agency/portals/editor?${query.toString()}`);
  }

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-[1500px]"} data-embedded-portal-workspace={embedded || undefined}>
      <header className="flex flex-col gap-5 border-b border-black/10 pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Client experience</p>
          {embedded
            ? <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black/90">Portal workspace</h2>
            : <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90 sm:text-4xl">Portals</h1>}
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
            See every client portal, preview demo templates, check access, and open the right editor from one place.
          </p>
        </div>
        <div className="inline-flex w-full overflow-x-auto rounded-md border border-black/10 bg-white p-1 sm:w-auto" role="tablist" aria-label="Portal workspace views">
          <ViewButton active={view === "library"} onClick={() => chooseView("library")} icon={<LayoutPanelTop size={16} />} label="All portals" />
          <ViewButton active={view === "templates"} onClick={() => chooseView("templates")} icon={<Eye size={16} />} label="Demo templates" />
          {canManage ? <ViewButton active={false} onClick={openEditor} icon={<MonitorCog size={16} />} label="Dev Editor Engine" /> : null}
        </div>
      </header>

      {view === "library" ? (
        <div className="pt-6">
          <section aria-label="Portal summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Clients" value={portals.length} detail="All client records" icon={<UserRoundCheck size={17} />} tone="blue" />
            <Summary label="Created" value={built} detail={`${ready} ready to invite`} icon={<CheckCircle2 size={17} />} tone="emerald" />
            <Summary label="Access sent" value={accessSent} detail="Customer sign-in issued" icon={<MailCheck size={17} />} tone="violet" />
            <Summary label="Needs setup" value={needsSetup} detail="Exact next step shown below" icon={<CircleDashed size={17} />} tone="amber" />
          </section>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Search portals</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search client, email, plan or brand"
                className="min-h-11 w-full rounded-md border border-black/12 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-black/45 sm:flex sm:items-center sm:gap-2">
              Show
              <select value={filter} onChange={event => setFilter(event.target.value as Filter)} className="min-h-11 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70 outline-none focus:border-brand/60">
                <option value="all">All portals</option>
                <option value="ready">Ready to invite</option>
                <option value="needs-setup">Needs setup</option>
                <option value="access-sent">Access sent</option>
                <option value="live">Live care</option>
              </select>
            </label>
          </div>

          {filtered.length ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {filtered.map(portal => <PortalCard key={portal.id} portal={portal} canManage={canManage} />)}
            </div>
          ) : (
            <div className="mt-5 grid min-h-56 place-items-center rounded-md border border-dashed border-black/15 bg-black/[0.015] px-6 text-center">
              <div>
                <CircleDashed size={25} className="mx-auto text-black/30" />
                <p className="mt-3 text-sm font-semibold text-black/65">No portals match this view</p>
                <button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className="mt-2 text-xs font-medium text-brand underline underline-offset-4">Clear filters</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <CanonicalPortalTemplatePreview portals={portals} products={products} canManage={canManage} />
      )}
    </div>
  );
}

function CanonicalPortalTemplatePreview({
  portals,
  products,
  canManage,
}: {
  portals: PortalWorkspaceRecord[];
  products: PortalTemplateProductRecord[];
  canManage: boolean;
}) {
  const previewClient = portals.find(portal => portal.portalBuiltAt) ?? portals[0];
  const connectedProducts = products.filter(product => product.active && product.portalRequirement !== "none");
  const previewHref = previewClient
    ? `/client-preview/${previewClient.id}?portalScope=template&portalMode=onboarding`
    : "";
  const editorHref = `/portal/agency/portals/editor?scope=template${previewClient ? `&clientId=${encodeURIComponent(previewClient.id)}` : ""}`;

  return (
    <div className="pt-6">
      <section className="overflow-hidden rounded-md border border-black/10 bg-white">
        <div className="flex flex-col gap-5 border-b border-black/10 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Master portal template</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-black/85">Stunning Standard</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">The exact client portal currently used for onboarding, project delivery, results, files, billing, support, resources, and client details.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {previewClient ? <Link href={previewHref} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"><Eye size={15} /> View portal <ArrowUpRight size={14} /></Link> : null}
            {canManage ? <Link href={editorHref} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85"><MonitorCog size={15} /> Dev Editor Engine</Link> : null}
          </div>
        </div>

        {previewClient ? (
          <div className="bg-[#d9d9d4] p-4 sm:p-6">
            <div className="mx-auto max-w-[1280px] overflow-hidden rounded-md border border-black/15 bg-white shadow-[0_18px_50px_rgba(0,0,0,.12)]">
              <iframe title="Stunning Standard portal template" src={`${previewHref}&embedded=1`} className="block h-[720px] w-full bg-white" />
            </div>
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center bg-black/[0.025] px-6 text-center text-sm text-black/50">Create a client record to supply realistic preview data for the master template.</div>
        )}
      </section>

      <section className="mt-6 border-t border-black/10 pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Product connections</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-black/82">Products using a client portal</h2>
          </div>
          <p className="text-xs text-black/42">{connectedProducts.length} active product{connectedProducts.length === 1 ? "" : "s"}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {connectedProducts.map(product => {
            const productPreviewHref = previewClient && product.portalDesignTemplateId
              ? `/client-preview/${previewClient.id}?portalScope=template&portalMode=onboarding&templateId=${encodeURIComponent(product.portalDesignTemplateId)}`
              : "";
            const productEditorHref = `/portal/agency/portals/editor?scope=template&productId=${encodeURIComponent(product.id)}${previewClient ? `&clientId=${encodeURIComponent(previewClient.id)}` : ""}`;
            return (
              <article key={product.id} className="mm-surface-card overflow-hidden rounded-md">
                <div className="h-1" style={{ backgroundColor: product.accentColor || "#8b6c33" }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-black/78">{product.name}</p>
                      <p className="mt-1 text-xs text-black/42">Stunning Standard · {product.portalRequirement === "required" ? "Required" : "Optional"}</p>
                    </div>
                    <StatusChip tone="ready">Template ready</StatusChip>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-black/8 pt-3">
                    {productPreviewHref ? <Link href={productPreviewHref} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-2.5 text-xs font-semibold text-black/62 hover:bg-black/[0.03]"><Eye size={14} /> View template</Link> : null}
                    {canManage ? <Link href={productEditorHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-2.5 text-xs font-semibold text-white hover:bg-black/85"><MonitorCog size={14} /> Edit template</Link> : null}
                    {canManage ? <Link href={`/portal/agency/products/${product.id}`} aria-label={`Open ${product.name} product`} title="Open product" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/42 hover:bg-black/[0.03] hover:text-black/70"><ArrowUpRight size={14} /></Link> : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!connectedProducts.length ? <p className="text-sm text-black/45">No active products currently require a portal.</p> : null}
        </div>
        {!canManage ? <p className="mt-3 text-xs text-black/40">Manager access is required to publish template changes.</p> : null}
      </section>
    </div>
  );
}


function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition sm:flex-none ${active ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04] hover:text-black/80"}`}>
      {icon}{label}
    </button>
  );
}

function Summary({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: ReactNode; tone: "blue" | "emerald" | "violet" | "amber" }) {
  return (
    <div className="mm-kpi-card mm-surface-card mm-hover-lift flex min-h-28 items-start gap-3 rounded-md p-4" data-kpi-tone={tone}>
      <span className="mm-kpi-icon">{icon}</span>
      <div>
        <p className="text-xs font-medium text-black/45">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-black/85">{value}</p>
        <p className="mt-1 text-xs text-black/40">{detail}</p>
      </div>
    </div>
  );
}

function PortalCard({ portal, canManage }: { portal: PortalWorkspaceRecord; canManage: boolean }) {
  const isBuilt = Boolean(portal.portalBuiltAt);
  const hasEmail = Boolean(portal.portalLoginEmail || portal.ownerEmail);
  const hasServices = portal.productCount > 0;
  const accessIssued = Boolean(portal.portalAccessSentAt || portal.portalAccessPreparedAt);
  const checks = [
    { label: "Service", ready: hasServices },
    { label: "Portal", ready: isBuilt },
    { label: "Sign-in", ready: hasEmail },
    { label: "Access", ready: accessIssued },
  ];
  const completed = checks.filter(check => check.ready).length;
  const readyToInvite = isReadyToInvite(portal);
  const access = portal.portalAccessSentAt ? "Access sent" : portal.portalAccessPreparedAt ? "Access prepared" : isBuilt ? "Not invited" : "Not created";
  const nextStep = !hasServices
    ? "Assign a service"
    : !isBuilt
      ? "Create the portal"
      : !hasEmail
        ? "Add a customer email"
        : !accessIssued
          ? "Send customer access"
          : "Portal is operational";
  const setupHref = !hasServices
    ? `/portal/clients/${portal.id}?tab=delivery#service-assignment`
    : `/portal/clients/${portal.id}?tab=portal`;
  return (
    <article className="mm-surface-card mm-hover-lift overflow-hidden rounded-md">
      <div className="h-1" style={{ backgroundColor: portal.accentColor }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md text-sm font-bold text-white" style={{ backgroundColor: portal.accentColor }}>{initials(portal.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-black/85">{portal.name}</h2>
              <StatusChip tone={accessIssued ? "ready" : readyToInvite ? "warning" : "neutral"}>{accessIssued ? "Access issued" : readyToInvite ? "Ready to invite" : "Needs setup"}</StatusChip>
              {portal.status !== "active" ? <StatusChip tone="warning">{titleCase(portal.status)}</StatusChip> : null}
            </div>
            <p className="mt-1 truncate text-xs text-black/45">{portal.companyName ?? "AquaOasis-Web"} · {portal.stageLabel}{isBuilt ? ` · ${MODE_LABELS[portal.portalMode]}` : ""}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-y border-black/8 py-4 sm:grid-cols-3">
          <Detail label="Access" value={access} />
          <Detail label="Sign-in" value={portal.portalLoginEmail || portal.ownerEmail || "Not set"} />
          <Detail label="Services" value={hasServices ? `${portal.productCount} assigned${portal.portalServicePlan ? ` · ${portal.portalServicePlan}` : ""}` : "None assigned"} />
        </dl>

        <div className="mt-4 rounded-md border border-black/8 bg-black/[0.018] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38">Launch progress</p>
            <span className="text-[11px] font-semibold text-black/55">{completed}/4</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5" aria-label={`${completed} of 4 portal launch steps complete`}>
            {checks.map(check => (
              <span key={check.label} title={`${check.label}: ${check.ready ? "complete" : "needs attention"}`} className={`h-1.5 rounded-full ${check.ready ? "bg-emerald-500" : "bg-black/10"}`} />
            ))}
          </div>
          <p className={`mt-2 text-xs font-medium ${accessIssued ? "text-emerald-700" : "text-black/62"}`}>{nextStep}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isBuilt ? (
            <Link href={`/client-preview/${portal.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
              <Eye size={15} /> View portal <ArrowUpRight size={14} />
            </Link>
          ) : null}
          {canManage && isBuilt ? <Link href={`/portal/agency/portals/editor?scope=client&clientId=${portal.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"><MonitorCog size={15} /> Dev Editor Engine</Link> : null}
          {canManage ? <Link href={setupHref} className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${isBuilt ? "border border-black/12 bg-white text-black/70 hover:bg-black/[0.03]" : "bg-black text-white hover:bg-black/85"}`}>
            {isBuilt ? <MailCheck size={15} /> : hasServices ? <Sparkles size={15} /> : <PackagePlus size={15} />}{isBuilt ? "Access & setup" : hasServices ? "Create portal" : "Assign service"}
          </Link> : null}
        </div>
      </div>
    </article>
  );
}

function isReadyToInvite(portal: PortalWorkspaceRecord): boolean {
  return Boolean(portal.portalBuiltAt && portal.productCount > 0 && (portal.portalLoginEmail || portal.ownerEmail));
}

function StatusChip({ tone, children }: { tone: "ready" | "warning" | "neutral"; children: ReactNode }) {
  const classes = tone === "ready" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-black/5 text-black/45";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classes}`}>{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{label}</dt><dd className="mt-1 truncate text-xs font-medium text-black/65" title={value}>{value}</dd></div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "P";
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
