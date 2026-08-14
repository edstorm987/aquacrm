"use client";

import Link from "next/link";
import { Building2, ExternalLink, Gauge, Info, Link2, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TradingCompany } from "@/server/types";

interface CompanySummary extends TradingCompany {
  clientCount: number;
  productCount: number;
  staffCount: number;
  healthScore: number;
}

interface WorkspaceSummary {
  clientCount: number;
  productCount: number;
  staffCount: number;
  healthScore: number;
  website?: string;
}

const blank = {
  name: "",
  slug: "",
  description: "",
  website: "",
  primaryColor: "#0B6F6D",
  secondaryColor: "#171717",
  accentColor: "#B68A4A",
  logoUrl: "",
  status: "active" as const,
};

interface HealthHelpState {
  name: string;
  score: number;
  kind: "workspace" | "brand";
}

export function TradingCompaniesPanel({
  companies,
  canEdit,
  workspace,
}: {
  companies: CompanySummary[];
  canEdit: boolean;
  workspace: WorkspaceSummary;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TradingCompany | "new" | null>(null);
  const [healthHelp, setHealthHelp] = useState<HealthHelpState | null>(null);
  const [notice, setNotice] = useState("");

  return (
    <section className="mx-auto mb-8 w-full max-w-6xl border-b border-black/10 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Service brands</p>
          <h2 className="mt-1 text-xl font-semibold text-black/85">One internal business, multiple customer-facing identities.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-black/50">Everything is managed together in AquaOasis-Web. Attach a service brand to products, clients and portals only when the customer should see it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency?station=battle&battle=systems" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 hover:border-black/20 hover:text-black">
            <Gauge size={15} /> Battle Table
          </Link>
          {canEdit ? (
            <button type="button" onClick={() => setEditing("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
              <Plus size={15} /> Add service brand
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="mm-surface-card mm-hover-lift rounded-md border-t-[3px] border-t-black p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md bg-black text-white"><Building2 size={17} /></span>
              <div><h3 className="font-semibold text-black/85">AquaOasis-Web</h3><p className="text-xs text-black/40">Internal workspace · all records</p></div>
            </div>
            <span className="text-[10px] font-semibold uppercase text-brand">Always active</span>
          </div>
          <p className="mt-4 text-xs leading-5 text-black/50">Clients, products, finance, fulfilment and reporting all live here together.</p>
          <div className="mt-4 grid grid-cols-3 border-y border-black/8 py-2 text-center">
            <Metric value={workspace.clientCount} label="Clients" />
            <Metric value={workspace.productCount} label="Offers" />
            <Metric value={workspace.staffCount} label="People" />
          </div>
          <HealthBar
            score={workspace.healthScore}
            name="AquaOasis-Web"
            onExplain={() => setHealthHelp({ name: "AquaOasis-Web", score: workspace.healthScore, kind: "workspace" })}
          />
          <div className="mt-3 flex justify-end">
            {workspace.website ? <a href={workspace.website} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/55 hover:border-black/25 hover:text-black">Open website <ExternalLink size={13} /></a> : <Link href="/portal/agency/company?view=connections" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/55 hover:border-black/25 hover:text-black"><Link2 size={13} />Connect website</Link>}
          </div>
        </article>
        {companies.map(company => (
          <article key={company.id} className="mm-surface-card mm-hover-lift rounded-md border-t-[3px] p-4" style={{ borderTopColor: company.brand.primaryColor }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${company.brand.primaryColor} 12%, transparent)`, color: company.brand.primaryColor }}><Building2 size={17} /></span>
                <div className="min-w-0"><h3 className="truncate font-semibold text-black/85">{company.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-black/45">{company.description || "No description added yet."}</p></div>
              </div>
              {canEdit ? <button type="button" onClick={() => setEditing(company)} aria-label={`Edit ${company.name}`} className="grid size-8 shrink-0 place-items-center rounded-md text-black/40 hover:bg-black/[0.04]"><Pencil size={14} /></button> : null}
            </div>
            <div className="mt-4 grid grid-cols-3 border-y border-black/8 py-2 text-center">
              <Metric value={company.clientCount} label="Clients" />
              <Metric value={company.productCount} label="Offers" />
              <Metric value={company.staffCount} label="People" />
            </div>
            <HealthBar
              score={company.healthScore}
              name={company.name}
              onExplain={() => setHealthHelp({ name: company.name, score: company.healthScore, kind: "brand" })}
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase text-black/40">Client-facing brand</span>
              {company.website ? <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/55" aria-label={`Open ${company.name} website`}>Open website <ExternalLink size={13} /></a> : canEdit ? <button type="button" onClick={() => setEditing(company)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/55"><Link2 size={13} />Connect website</button> : <span className="text-xs text-black/35">Not connected</span>}
            </div>
          </article>
        ))}
      </div>
      {!companies.length ? <p className="mm-surface-card mt-4 rounded-md border-dashed py-6 text-center text-sm text-black/40">No service brands yet. AquaOasis-Web can still run every product directly.</p> : null}
      {notice ? <p role="status" className="mt-3 text-xs text-black/50">{notice}</p> : null}
      {editing ? <CompanyEditor
        company={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={message => { setEditing(null); setNotice(message); router.refresh(); }}
      /> : null}
      {healthHelp ? <CompanyHealthExplainer {...healthHelp} onClose={() => setHealthHelp(null)} /> : null}
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><strong className="block text-sm text-black/75">{value}</strong><span className="text-[10px] text-black/40">{label}</span></div>;
}

function HealthBar({ score, name, onExplain }: { score: number; name: string; onExplain: () => void }) {
  const label = score >= 80 ? "Strong" : score >= 60 ? "Watch" : "Needs attention";
  const tone = score >= 80 ? "bg-emerald-600" : score >= 60 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase">
        <span className="flex items-center gap-1 text-black/45">
          Company health
          <button
            type="button"
            onClick={onExplain}
            aria-label={`Explain ${name} company health`}
            title="How this score works"
            className="grid size-6 place-items-center rounded-md text-black/45 transition hover:bg-black/[0.06] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          >
            <Info size={13} aria-hidden="true" />
          </button>
        </span>
        <span className="text-black/65">{label} · {score}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]" role="meter" aria-label="Company health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
        <span className={`block h-full rounded-full transition-all ${tone}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function CompanyHealthExplainer({ name, score, kind, onClose }: HealthHelpState & { onClose: () => void }) {
  const label = score >= 80 ? "Strong" : score >= 60 ? "Watch" : "Needs attention";
  const statusTone = score >= 80 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-red-700";
  const metrics = kind === "workspace" ? [
    { name: "Income", weight: "35%", detail: "Revenue collected this month compared with the target expected by today." },
    { name: "Client health", weight: "25%", detail: "The share of active clients that are not currently marked as needing attention." },
    { name: "Pipeline", weight: "25%", detail: "Meetings booked compared with the number estimated to close the remaining revenue gap." },
    { name: "Operations", weight: "15%", detail: "Open actions completed on time, with overdue work reducing this part of the score." },
  ] : [
    { name: "Active clients", weight: "30%", detail: "The share of this brand's client records that are currently active. No clients scores zero here." },
    { name: "Offers", weight: "25%", detail: "Whether at least one product or service is attached to this brand." },
    { name: "People", weight: "20%", detail: "Whether at least one staff member is assigned to this brand." },
    { name: "Profile setup", weight: "15%", detail: "Website and company description completeness. The website contributes more of this section." },
    { name: "Operating status", weight: "10%", detail: "Active scores fully, paused scores partly, and archived scores zero for this section." },
  ];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="How company health works"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-md bg-[#F8F7F3] shadow-2xl sm:max-w-2xl sm:rounded-md"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/10 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-brand">{name}</p>
            <h2 className="mt-1 text-xl font-semibold text-black/90">How company health works</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close health explanation" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/60 hover:bg-black/[0.04]"><X size={15} /></button>
        </header>

        <div className="px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
            <div>
              <p className="text-sm text-black/50">Current score</p>
              <div className="mt-1 flex items-baseline gap-2">
                <strong className="text-4xl font-semibold tracking-tight text-black/90">{score}%</strong>
                <span className={`text-sm font-semibold ${statusTone}`}>{label}</span>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-6 text-black/55">This is a live operating signal to show where attention may be useful. It is not a financial valuation or a judgement on the company.</p>
          </div>

          <div className="py-5">
            <h3 className="text-sm font-semibold text-black/80">What contributes to the score</h3>
            <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
              {metrics.map(metric => (
                <div key={metric.name} className="grid gap-1 py-3 sm:grid-cols-[140px_52px_1fr] sm:items-start sm:gap-3">
                  <strong className="text-sm font-semibold text-black/75">{metric.name}</strong>
                  <span className="text-xs font-semibold text-brand">{metric.weight}</span>
                  <p className="text-sm leading-5 text-black/50">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-black/10 pt-5">
            <h3 className="text-sm font-semibold text-black/80">Score bands</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <ScoreBand color="bg-emerald-600" label="Strong" range="80–100%" />
              <ScoreBand color="bg-amber-500" label="Watch" range="60–79%" />
              <ScoreBand color="bg-red-600" label="Needs attention" range="0–59%" />
            </div>
            <p className="mt-4 text-xs leading-5 text-black/45">The score updates automatically as the underlying records change.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScoreBand({ color, label, range }: { color: string; label: string; range: string }) {
  return (
    <div className="flex items-center gap-2 border-l border-black/10 py-1 pl-3 first:border-l-0 first:pl-0 sm:first:border-l sm:first:pl-3">
      <span className={`size-2.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
      <span><strong className="block text-xs text-black/70">{label}</strong><span className="text-[11px] text-black/40">{range}</span></span>
    </div>
  );
}

function CompanyEditor({ company, onClose, onSaved }: { company: TradingCompany | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState(company ? {
    name: company.name,
    slug: company.slug,
    description: company.description ?? "",
    website: company.website ?? "",
    primaryColor: company.brand.primaryColor,
    secondaryColor: company.brand.secondaryColor ?? "#171717",
    accentColor: company.brand.accentColor ?? "#B68A4A",
    logoUrl: company.brand.logoUrl ?? "",
    status: company.status,
  } : blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/40";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/portal/trading-companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: company ? "update" : "create",
        companyId: company?.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        website: form.website,
        status: form.status,
        brand: {
          logoUrl: form.logoUrl,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          accentColor: form.accentColor,
        },
      }),
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Service brand could not be saved.");
      return;
    }
    onSaved(company ? `${form.name} updated.` : `${form.name} added.`);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md bg-[#F8F7F3] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-black/10 bg-white px-5 py-4">
          <div><p className="text-xs font-semibold uppercase text-brand">{company ? "Edit service brand" : "New service brand"}</p><h2 className="mt-1 text-xl font-semibold">{company ? company.name : "Add a customer-facing brand"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10"><X size={15} /></button>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">Brand name<input required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} className={control} /></label>
          <label className="grid gap-1 text-xs font-medium">Short ID<input value={form.slug} onChange={event => setForm(value => ({ ...value, slug: event.target.value }))} className={control} placeholder="generated-from-name" /></label>
          <label className="grid gap-1 text-xs font-medium sm:col-span-2">What this company does<textarea rows={3} value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} className={`${control} py-2`} /></label>
          <label className="grid gap-1 text-xs font-medium">Website<input value={form.website} onChange={event => setForm(value => ({ ...value, website: event.target.value }))} className={control} placeholder="https://" /></label>
          <label className="grid gap-1 text-xs font-medium">Status<select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as typeof form.status }))} className={control}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
          <label className="grid gap-1 text-xs font-medium">Primary colour<input type="color" value={form.primaryColor} onChange={event => setForm(value => ({ ...value, primaryColor: event.target.value }))} className={`${control} p-1`} /></label>
          <label className="grid gap-1 text-xs font-medium">Accent colour<input type="color" value={form.accentColor} onChange={event => setForm(value => ({ ...value, accentColor: event.target.value }))} className={`${control} p-1`} /></label>
          <label className="grid gap-1 text-xs font-medium sm:col-span-2">Logo URL<input value={form.logoUrl} onChange={event => setForm(value => ({ ...value, logoUrl: event.target.value }))} className={control} placeholder="https://" /></label>
          {error ? <p className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-black/10 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button>
          <button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save brand"}</button>
        </footer>
      </form>
    </div>
  );
}
