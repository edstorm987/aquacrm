"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Eye,
  FilePenLine,
  LayoutPanelTop,
  MailCheck,
  MonitorCog,
  Search,
  Settings2,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { PortalEditorPanel } from "@/app/portal/agency/settings/PortalEditorPanel";

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
  hasVisualEditor: boolean;
};

type View = "library" | "editor";
type Filter = "all" | "ready" | "needs-setup" | "access-sent" | "live";

const MODE_LABELS: Record<PortalWorkspaceRecord["portalMode"], string> = {
  onboarding: "Onboarding",
  designing: "Designing",
  "developed-launch": "Review & launch",
  maintenance: "Live care",
};

export function PortalsWorkspace({
  portals,
  initialView,
  canManage,
}: {
  portals: PortalWorkspaceRecord[];
  initialView: View;
  canManage: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const built = portals.filter(portal => portal.portalBuiltAt).length;
  const accessSent = portals.filter(portal => portal.portalAccessSentAt).length;
  const live = portals.filter(portal => portal.portalBuiltAt && portal.portalMode === "maintenance").length;
  const needsSetup = portals.length - built;

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
        || filter === "ready" && Boolean(portal.portalBuiltAt)
        || filter === "needs-setup" && !portal.portalBuiltAt
        || filter === "access-sent" && Boolean(portal.portalAccessSentAt)
        || filter === "live" && portal.portalBuiltAt && portal.portalMode === "maintenance";
      return matchesTerm && matchesFilter;
    });
  }, [filter, portals, query]);

  function chooseView(next: View) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "editor") url.searchParams.set("view", "editor");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <header className="flex flex-col gap-5 border-b border-black/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Client experience</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90 sm:text-4xl">Portals</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
            See every client portal, check access, preview the customer experience, and open the right editor from one place.
          </p>
        </div>
        <div className="inline-flex w-full rounded-md border border-black/10 bg-white p-1 sm:w-auto" role="tablist" aria-label="Portal workspace views">
          <ViewButton active={view === "library"} onClick={() => chooseView("library")} icon={<LayoutPanelTop size={16} />} label="All portals" />
          <ViewButton active={view === "editor"} onClick={() => chooseView("editor")} icon={<MonitorCog size={16} />} label="Portal editor" />
        </div>
      </header>

      {view === "library" ? (
        <div className="pt-6">
          <section aria-label="Portal summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Clients" value={portals.length} detail="All client records" icon={<UserRoundCheck size={17} />} tone="blue" />
            <Summary label="Portals ready" value={built} detail={`${needsSetup} still optional`} icon={<CheckCircle2 size={17} />} tone="emerald" />
            <Summary label="Access sent" value={accessSent} detail="Customer sign-in issued" icon={<MailCheck size={17} />} tone="violet" />
            <Summary label="Live care" value={live} detail="Maintenance experience" icon={<Sparkles size={17} />} tone="amber" />
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
                <option value="ready">Portal ready</option>
                <option value="needs-setup">Needs setup</option>
                <option value="access-sent">Access sent</option>
                <option value="live">Live care</option>
              </select>
            </label>
          </div>

          {filtered.length ? (
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {filtered.map(portal => <PortalCard key={portal.id} portal={portal} />)}
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
        <div className="pt-6">
          <section>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Client portals</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-black/85">Choose what you want to edit</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Edit the customer-facing content and access flow, or open the advanced visual editor where it is installed.</p>
              </div>
              <Link href="/portal/clients" className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70 hover:bg-black/[0.03]">
                Manage clients <ArrowUpRight size={15} />
              </Link>
            </div>

            <div className="mt-5 grid gap-2">
              {portals.map(portal => <EditorRow key={portal.id} portal={portal} />)}
            </div>
          </section>

          <section id="forms" className="mt-10 scroll-mt-6 border-t border-black/10 pt-8">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Portal data forms</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-black/85">Control the information you collect</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Manage custom fields used across clients, contacts, leads, expenses, actions, and products.</p>
            </div>
            <PortalEditorPanel canManage={canManage} />
          </section>
        </div>
      )}
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

function PortalCard({ portal }: { portal: PortalWorkspaceRecord }) {
  const isBuilt = Boolean(portal.portalBuiltAt);
  const access = portal.portalAccessSentAt ? "Access sent" : portal.portalAccessPreparedAt ? "Access prepared" : isBuilt ? "Not invited" : "Not created";
  return (
    <article className="mm-surface-card mm-hover-lift overflow-hidden rounded-md">
      <div className="h-1" style={{ backgroundColor: portal.accentColor }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md text-sm font-bold text-white" style={{ backgroundColor: portal.accentColor }}>{initials(portal.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-black/85">{portal.name}</h2>
              <StatusChip tone={isBuilt ? "ready" : "neutral"}>{isBuilt ? MODE_LABELS[portal.portalMode] : "Needs setup"}</StatusChip>
              {portal.status !== "active" ? <StatusChip tone="warning">{titleCase(portal.status)}</StatusChip> : null}
            </div>
            <p className="mt-1 truncate text-xs text-black/45">{portal.companyName ?? "AquaOasis-Web"} · {portal.stageLabel}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-y border-black/8 py-4 sm:grid-cols-3">
          <Detail label="Access" value={access} />
          <Detail label="Sign-in" value={portal.portalLoginEmail || portal.ownerEmail || "Not set"} />
          <Detail label="Plan" value={portal.portalServicePlan || "Not set"} />
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {isBuilt ? (
            <Link href={`/client-preview/${portal.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
              <Eye size={15} /> Preview <ArrowUpRight size={14} />
            </Link>
          ) : null}
          <Link href={`/portal/clients/${portal.id}?tab=fulfilment`} className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${isBuilt ? "border border-black/12 bg-white text-black/70 hover:bg-black/[0.03]" : "bg-black text-white hover:bg-black/85"}`}>
            {isBuilt ? <FilePenLine size={15} /> : <Sparkles size={15} />}{isBuilt ? "Edit portal" : "Create portal"}
          </Link>
          <Link href={`/portal/clients/${portal.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-black/50 hover:bg-black/[0.035] hover:text-black/75">
            Client record
          </Link>
        </div>
      </div>
    </article>
  );
}

function EditorRow({ portal }: { portal: PortalWorkspaceRecord }) {
  const isBuilt = Boolean(portal.portalBuiltAt);
  return (
    <div className="mm-interactive-row mm-surface-card flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: portal.accentColor }}>{initials(portal.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-black/80">{portal.name}</p>
          <StatusChip tone={isBuilt ? "ready" : "neutral"}>{isBuilt ? MODE_LABELS[portal.portalMode] : "No portal"}</StatusChip>
        </div>
        <p className="mt-0.5 text-xs text-black/42">{portal.portalServicePlan || portal.companyName || "Client portal"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {isBuilt ? <Link href={`/client-preview/${portal.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.03]"><Eye size={15} /> Preview</Link> : null}
        <Link href={`/portal/clients/${portal.id}?tab=fulfilment`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85"><Settings2 size={15} /> {isBuilt ? "Edit portal" : "Create portal"}</Link>
        {portal.hasVisualEditor ? (
          <Link href={`/portal/clients/${portal.id}/portals`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-brand/20 bg-brand/5 px-3 text-sm font-semibold text-brand hover:bg-brand/10"><MonitorCog size={15} /> Visual editor</Link>
        ) : (
          <Link href={`/portal/clients/${portal.id}?tab=systems`} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-black/45 hover:bg-black/[0.035] hover:text-black/70">Add visual editor</Link>
        )}
      </div>
    </div>
  );
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
