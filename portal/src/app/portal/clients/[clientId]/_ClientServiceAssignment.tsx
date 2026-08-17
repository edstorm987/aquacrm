"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, LoaderCircle, PackageCheck, Pencil, RotateCcw, Settings2 } from "lucide-react";

import type { AgencyProduct, AgencyProductStatus, SopDocument } from "@/server/types";
import { ProductEditor, toDraft } from "@/app/portal/agency/products/_ProductsWorkspace";

export interface ClientServiceOption {
  id: string;
  name: string;
  category: string;
  description?: string;
  kind: "product" | "package";
  active: boolean;
  status: AgencyProductStatus;
  includedProductNames: string[];
}

export interface ClientCompanyOption {
  id: string;
  name: string;
  status: "active" | "paused" | "archived";
}

export function ClientServiceAssignment({
  clientId,
  clientName,
  options,
  companies,
  initialProducts,
  initialSelectedProductIds,
  initialCompanyId,
  defaultProviderName,
  canManage,
  variationProductIds,
  sops,
}: {
  clientId: string;
  clientName: string;
  options: ClientServiceOption[];
  companies: ClientCompanyOption[];
  initialProducts: AgencyProduct[];
  initialSelectedProductIds: string[];
  initialCompanyId?: string;
  defaultProviderName: string;
  canManage: boolean;
  variationProductIds: string[];
  sops: SopDocument[];
}) {
  const router = useRouter();
  const initialIds = useMemo(() => initialSelectedProductIds, [initialSelectedProductIds]);
  const [selectedIds, setSelectedIds] = useState(initialIds);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId ?? "");
  const [editing, setEditing] = useState(initialProducts.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variationProduct, setVariationProduct] = useState<AgencyProduct | null>(null);
  const [variationBusyId, setVariationBusyId] = useState("");

  useEffect(() => setSelectedIds(initialIds), [initialIds]);
  useEffect(() => setSelectedCompanyId(initialCompanyId ?? ""), [initialCompanyId]);

  const selectedOptions = options.filter(option => selectedIds.includes(option.id));
  const selectedCompany = companies.find(company => company.id === selectedCompanyId);
  const providerName = selectedCompany?.name ?? defaultProviderName;
  const dirty = selectedCompanyId !== (initialCompanyId ?? "")
    || selectedIds.length !== initialIds.length
    || selectedIds.some(id => !initialIds.includes(id));

  function toggle(id: string) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    setError("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, productIds: selectedIds, companyId: selectedCompanyId || null }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save the assigned services.");
      setEditing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the assigned services.");
    } finally {
      setBusy(false);
    }
  }

  async function resetVariation(product: AgencyProduct) {
    if (!window.confirm(`Reset ${product.name} to the official catalogue service for ${clientName}? Client work and history will remain.`)) return;
    setVariationBusyId(product.id);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-product-variation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset", clientId, productId: product.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not reset the client variation.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset the client variation.");
    } finally {
      setVariationBusyId("");
    }
  }

  if (!canManage && !initialProducts.length) {
    return <section className="border-l-2 border-amber-500 bg-amber-50 px-4 py-4"><p className="text-sm font-semibold text-amber-950">Services are being prepared</p><p className="mt-1 text-xs leading-5 text-amber-900/65">The delivery workspace will appear when the service package for {clientName} is confirmed.</p></section>;
  }

  return <section id="service-assignment" className={`overflow-hidden rounded-md border ${initialProducts.length ? "border-black/10 bg-white" : "border-amber-300 bg-amber-50"}`}>
    <header className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-md ${initialProducts.length ? "bg-brand/10 text-brand" : "bg-amber-100 text-amber-800"}`}><PackageCheck size={18} /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Client service architecture</p>
          <h2 className="mt-1 text-base font-semibold text-black/82">{initialProducts.length ? `${initialProducts.length} service${initialProducts.length === 1 ? "" : "s"} · ${providerName}` : "Assign a company and service"}</h2>
          <p className="mt-1 text-xs leading-5 text-black/48">{initialProducts.length ? `${initialProducts.map(product => product.name).join(" · ")}. The client portal is presented by ${providerName}.` : `Choose which company serves ${clientName} and what they bought. Their internal workspace and portal will adapt automatically.`}</p>
        </div>
      </div>
      {canManage ? <button type="button" onClick={() => setEditing(value => !value)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]"><Settings2 size={14} />{editing ? "Close" : "Manage services"}<ChevronDown size={13} className={editing ? "rotate-180" : ""} /></button> : null}
    </header>

    {editing && canManage ? <div className="border-t border-black/10 bg-white p-4 sm:p-5">
      <div className="mb-5 grid gap-4 border-b border-black/10 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-end">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/55"><Building2 size={17} /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Delivering company</p>
            <h3 className="mt-1 text-sm font-semibold text-black/78">Who this client sees</h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-black/45">This company owns the relationship across the client portal, portfolio reporting, finance allocation, Journey filters, and customer-facing messages.</p>
          </div>
        </div>
        <label className="grid gap-1.5 text-xs font-semibold text-black/60">
          Company
          <select value={selectedCompanyId} onChange={event => { setSelectedCompanyId(event.target.value); setError(""); }} className="min-h-10 w-full rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/75 outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10">
            <option value="">{defaultProviderName} (workspace default)</option>
            {companies.map(company => <option key={company.id} value={company.id} disabled={company.status === "archived" && company.id !== initialCompanyId}>{company.name}{company.status === "active" ? "" : ` (${company.status})`}</option>)}
          </select>
        </label>
      </div>
      {options.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{options.map(option => {
        const selected = selectedIds.includes(option.id);
        const disabled = option.status !== "live" && !selected;
        return <button key={option.id} type="button" aria-pressed={selected} disabled={disabled} onClick={() => toggle(option.id)} className={`flex min-h-28 items-start gap-3 rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-brand/35 bg-brand/[0.055]" : "border-black/10 hover:border-black/20 hover:bg-black/[0.018]"}`}>
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${selected ? "border-brand bg-brand text-white" : "border-black/18 text-transparent"}`}><Check size={12} /></span>
          <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-black/78">{option.name}</strong>{option.kind === "package" ? <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/45">Package</span> : null}{option.status !== "live" ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${option.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{option.status === "draft" ? "Draft" : "Archived"}</span> : null}</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-black/35">{option.category}</span><span className="mt-1 line-clamp-2 text-xs leading-5 text-black/45">{option.description || "Configured delivery service."}</span>{option.includedProductNames.length ? <span className="mt-1.5 block text-[10px] text-brand/80">Includes {option.includedProductNames.join(", ")}</span> : null}</span>
        </button>;
      })}</div> : <div className="border border-dashed border-black/15 p-5 text-center"><p className="text-sm font-semibold text-black/70">No services are available to assign</p><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-black/45">A workspace owner can add catalogue services from the agency workspace. Client operators remain inside this client record.</p></div>}
      {error ? <p role="alert" className="mt-3 text-xs font-medium text-red-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4"><p className="text-xs text-black/45"><strong className="font-semibold text-black/60">{providerName}</strong>{selectedOptions.length ? ` · ${selectedOptions.length} selected: ${selectedOptions.map(option => option.name).join(", ")}` : " · No service selected. Saving will return this client to assignment required."}</p><button type="button" disabled={busy || !dirty} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}{busy ? "Saving" : "Save company & services"}</button></div>
    </div> : null}

    {initialProducts.length ? <div className="border-t border-black/10 bg-black/[0.018] px-4 py-4 sm:px-5">
      <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Client-specific services</p><p className="mt-1 text-xs leading-5 text-black/45">The catalogue stays reusable. Customise only when this client needs different scope, pricing, stages, contract terms or portal copy.</p></div>
      <div className="grid gap-2 lg:grid-cols-2">{initialProducts.map(product => {
        const varied = variationProductIds.includes(product.id);
        return <article key={product.id} className="flex min-w-0 items-center gap-3 rounded-md border border-black/10 bg-white px-3 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/48"><PackageCheck size={15} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-black/75">{product.name}</strong>{varied ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-700">Client variation</span> : null}</span><span className="mt-0.5 block truncate text-[11px] text-black/40">{varied ? "Overrides the official service for this client only" : "Inheriting the official catalogue service"}</span></span>{canManage ? <span className="flex shrink-0 items-center gap-1">{varied ? <button type="button" disabled={variationBusyId === product.id} onClick={() => void resetVariation(product)} title="Reset to catalogue" aria-label={`Reset ${product.name} to catalogue`} className="grid size-9 place-items-center rounded-md text-black/42 hover:bg-black/[0.04] disabled:opacity-40">{variationBusyId === product.id ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}</button> : null}<button type="button" onClick={() => setVariationProduct(product)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]"><Pencil size={13} /> Customise</button></span> : null}</article>;
      })}</div>
    </div> : null}

    {variationProduct ? <ProductEditor draft={toDraft(variationProduct)} products={initialProducts} sops={sops} companies={[]} clientContext={{ clientId, clientName }} onClose={() => setVariationProduct(null)} onSaved={() => { setVariationProduct(null); router.refresh(); }} /> : null}
  </section>;
}
