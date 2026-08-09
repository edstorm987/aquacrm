"use client";

import { Building2, ExternalLink, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [notice, setNotice] = useState("");

  return (
    <section className="mx-auto mb-8 w-full max-w-6xl border-b border-black/10 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Service brands</p>
          <h2 className="mt-1 text-xl font-semibold text-black/85">One internal business, multiple customer-facing identities.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-black/50">Everything is managed together in AquaOasis-Web. Attach a service brand to products, clients and portals only when the customer should see it.</p>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
            <Plus size={15} /> Add service brand
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="border-l-4 border-black bg-white px-4 py-4 shadow-sm">
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
          <HealthBar score={workspace.healthScore} />
        </article>
        {companies.map(company => (
          <article key={company.id} className="border-l-4 bg-white px-4 py-4 shadow-sm" style={{ borderLeftColor: company.brand.primaryColor }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: company.brand.primaryColor }} /><h3 className="truncate font-semibold text-black/85">{company.name}</h3></div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/45">{company.description || "No description added yet."}</p>
              </div>
              {canEdit ? <button type="button" onClick={() => setEditing(company)} aria-label={`Edit ${company.name}`} className="grid size-8 shrink-0 place-items-center rounded-md text-black/40 hover:bg-black/[0.04]"><Pencil size={14} /></button> : null}
            </div>
            <div className="mt-4 grid grid-cols-3 border-y border-black/8 py-2 text-center">
              <Metric value={company.clientCount} label="Clients" />
              <Metric value={company.productCount} label="Offers" />
              <Metric value={company.staffCount} label="People" />
            </div>
            <HealthBar score={company.healthScore} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase text-black/40">Client-facing brand</span>
              {company.website ? <a href={company.website} target="_blank" rel="noreferrer" aria-label={`Open ${company.name} website`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><ExternalLink size={14} /></a> : null}
            </div>
          </article>
        ))}
      </div>
      {!companies.length ? <p className="mt-4 border-y border-dashed border-black/10 py-6 text-center text-sm text-black/40">No service brands yet. AquaOasis-Web can still run every product directly.</p> : null}
      {notice ? <p role="status" className="mt-3 text-xs text-black/50">{notice}</p> : null}
      {editing ? <CompanyEditor
        company={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={message => { setEditing(null); setNotice(message); router.refresh(); }}
      /> : null}
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><strong className="block text-sm text-black/75">{value}</strong><span className="text-[10px] text-black/40">{label}</span></div>;
}

function HealthBar({ score }: { score: number }) {
  const label = score >= 80 ? "Strong" : score >= 60 ? "Watch" : "Needs attention";
  const tone = score >= 80 ? "bg-emerald-600" : score >= 60 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="mt-3" title="Health uses live clients, offers, people, profile completeness and operating status.">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase">
        <span className="text-black/45">Company health</span>
        <span className="text-black/65">{label} · {score}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]" role="meter" aria-label="Company health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
        <span className={`block h-full rounded-full transition-all ${tone}`} style={{ width: `${score}%` }} />
      </div>
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
