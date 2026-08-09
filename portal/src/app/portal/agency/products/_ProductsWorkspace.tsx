"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, ArrowRight, Building2, Check, ChevronRight, FolderOpen, Grid2X2, Layers3, Package, Plus, RotateCcw, X } from "lucide-react";
import type { AgencyProduct, AgencyProductKind, AgencyProductPortalRequirement, AgencyProductPricing, SopDocument, TradingCompany } from "@/server/types";
import { AGENCY_PRODUCT_CATEGORIES } from "@/lib/agencyProductCategories";

export type Draft = {
  id?: string;
  kind: AgencyProductKind;
  name: string;
  category: string;
  description: string;
  buyerHeadline: string;
  coverImageUrl: string;
  accentColor: string;
  portalRequirement: AgencyProductPortalRequirement;
  portalHeadline: string;
  portalWelcomeNote: string;
  includedProductIds: string[];
  welcomePackItems: string;
  welcomePackNotes: string;
  pricing: AgencyProductPricing;
  price: string;
  billingInterval: "month" | "quarter" | "year";
  depositPercent: string;
  taxRatePercent: string;
  paymentTermsDays: string;
  billingNotes: string;
  internalInfo: string;
  deliverables: string;
  contractTitle: string;
  contractBody: string;
  sopIds: string[];
  sopCategories: string[];
  companyIds: string[];
};

export const EMPTY_PRODUCT_DRAFT: Draft = { kind: "product", name: "", category: "Digital", description: "", buyerHeadline: "", coverImageUrl: "", accentColor: "#8E7340", portalRequirement: "optional", portalHeadline: "", portalWelcomeNote: "", includedProductIds: [], welcomePackItems: "", welcomePackNotes: "", pricing: "custom", price: "", billingInterval: "month", depositPercent: "0", taxRatePercent: "0", paymentTermsDays: "7", billingNotes: "", internalInfo: "", deliverables: "", contractTitle: "", contractBody: "", sopIds: [], sopCategories: [], companyIds: [] };

const AQUA_COMPANY_ID = "aqua-oasis-web";

type CompanyShelf = {
  id: string;
  draftCompanyId: string | null;
  name: string;
  description: string;
  colour: string;
  products: AgencyProduct[];
};

export function ProductsWorkspace({ initialProducts, sops, companies, defaults = { taxRatePercent: 0, paymentTermsDays: 7 } }: { initialProducts: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; defaults?: { taxRatePercent: number; paymentTermsDays: number } }) {
  const [products, setProducts] = useState(initialProducts);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<"browse" | "all">("browse");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const visible = useMemo(() => products.filter(product => showArchived || product.active), [products, showArchived]);
  const categories = useMemo(() => [...new Set(visible.map(product => product.category))].sort(), [visible]);
  const companyShelves = useMemo<CompanyShelf[]>(() => {
    const activeCompanies = companies.filter(company => showArchived || company.status !== "archived");
    const primaryCompany = activeCompanies.find(company => company.slug === "aquaoasis-web" || company.name.toLowerCase() === "aquaoasis-web");
    const sharedProducts = visible.filter(product => !(product.companyIds ?? []).length);
    const shelves = activeCompanies.map(company => ({
      id: company.id,
      draftCompanyId: company.id === primaryCompany?.id ? null : company.id,
      name: company.name,
      description: company.description || "Products and services presented through this company.",
      colour: company.brand.primaryColor || "#171717",
      products: visible.filter(product => (product.companyIds ?? []).includes(company.id) || (company.id === primaryCompany?.id && !(product.companyIds ?? []).length)),
    }));
    if (!primaryCompany) {
      shelves.unshift({
        id: AQUA_COMPANY_ID,
        draftCompanyId: null,
        name: "AquaOasis-Web",
        description: "Shared offers delivered directly through the main business.",
        colour: "#0F766E",
        products: sharedProducts,
      });
    }
    return shelves;
  }, [companies, showArchived, visible]);
  const selectedShelf = companyShelves.find(company => company.id === selectedCompanyId) ?? null;
  const shelfCategories = useMemo(() => {
    if (!selectedShelf) return [];
    return [...new Set(selectedShelf.products.map(product => product.category))].sort();
  }, [selectedShelf]);
  const categoryProducts = selectedShelf && selectedCategory
    ? selectedShelf.products.filter(product => product.category === selectedCategory)
    : [];

  function upsert(product: AgencyProduct) {
    setProducts(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product]);
  }

  async function toggle(product: AgencyProduct) {
    const response = await fetch("/api/portal/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", productId: product.id, active: !product.active }) });
    const json = await response.json().catch(() => null) as { product?: AgencyProduct } | null;
    if (response.ok && json?.product) upsert(json.product);
  }

  function openNewProduct(companyId = selectedCompanyId, category = selectedCategory) {
    const company = companyShelves.find(item => item.id === companyId);
    setDraft({
      ...EMPTY_PRODUCT_DRAFT,
      includedProductIds: [],
      sopIds: [],
      sopCategories: [],
      companyIds: company?.draftCompanyId ? [company.draftCompanyId] : [],
      category: category || "Digital",
      taxRatePercent: String(defaults.taxRatePercent),
      paymentTermsDays: String(defaults.paymentTermsDays),
    });
  }

  function selectCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    setSelectedCategory(null);
    window.requestAnimationFrame(() => document.getElementById("categories-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    window.requestAnimationFrame(() => document.getElementById("category-products-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Products</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Your complete offer catalogue.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Every service, package, price and delivery process, organised around the company that sells it.</p></div>
        <button type="button" onClick={() => openNewProduct()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />New product</button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-black/10 py-3">
        <p className="text-sm text-black/55">{products.filter(product => product.active).length} active product{products.filter(product => product.active).length === 1 ? "" : "s"} · {categories.length} categor{categories.length === 1 ? "y" : "ies"} · {companyShelves.length} compan{companyShelves.length === 1 ? "y" : "ies"}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-1" aria-label="Catalogue view">
            <button type="button" onClick={() => setView("browse")} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${view === "browse" ? "bg-white text-black shadow-sm" : "text-black/50"}`}><Layers3 size={14} />Browse</button>
            <button type="button" onClick={() => setView("all")} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold ${view === "all" ? "bg-white text-black shadow-sm" : "text-black/50"}`}><Grid2X2 size={14} />View all</button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-black/55"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Show archived</label>
        </div>
      </div>

      {view === "browse" ? <>
        <section aria-labelledby="companies-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Company</p><h2 id="companies-heading" className="mt-0.5 text-lg font-semibold text-black/85">Companies</h2></div>
            {selectedShelf ? <button type="button" onClick={() => { setSelectedCompanyId(null); setSelectedCategory(null); }} className="text-xs font-semibold text-black/50 hover:text-black">Clear selection</button> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {companyShelves.map(company => <CompanyCard key={company.id} company={company} selected={company.id === selectedCompanyId} onSelect={() => selectCompany(company.id)} />)}
          </div>
        </section>

        {selectedShelf ? <section aria-labelledby="categories-heading" className="scroll-mt-20 border-t border-black/10 pt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">{selectedShelf.name}</p><h2 id="categories-heading" className="mt-0.5 text-lg font-semibold text-black/85">Categories</h2></div>
            <button type="button" onClick={() => openNewProduct(selectedShelf.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-2.5 text-xs font-semibold text-black/65"><Plus size={14} />Add to {selectedShelf.name}</button>
          </div>
          {shelfCategories.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shelfCategories.map(category => <CategoryCard key={category} category={category} products={selectedShelf.products.filter(product => product.category === category)} colour={selectedShelf.colour} selected={category === selectedCategory} onSelect={() => selectCategory(category)} />)}
          </div> : <EmptyCatalogue title={`No products for ${selectedShelf.name}.`} actionLabel="Add the first product" onAction={() => openNewProduct(selectedShelf.id)} />}
        </section> : null}

        {selectedShelf && selectedCategory ? <section aria-labelledby="category-products-heading" className="scroll-mt-20 border-t border-black/10 pt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">{selectedShelf.name} <ChevronRight className="mx-1 inline" size={11} /> {selectedCategory}</p><h2 id="category-products-heading" className="mt-1 text-xl font-semibold text-black/90">{selectedCategory}</h2></div>
            <button type="button" onClick={() => openNewProduct(selectedShelf.id, selectedCategory)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-2.5 text-xs font-semibold text-black/65"><Plus size={14} />New product</button>
          </div>
          <ProductGrid products={categoryProducts} sops={sops} companies={companies} onToggle={toggle} />
        </section> : null}
      </> : <section aria-labelledby="all-products-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Complete catalogue</p><h2 id="all-products-heading" className="mt-0.5 text-xl font-semibold text-black/90">All products</h2></div>
          <button type="button" onClick={() => setView("browse")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-2.5 text-xs font-semibold text-black/65"><Layers3 size={14} />Browse by company</button>
        </div>
        {visible.length ? <ProductGrid products={visible} sops={sops} companies={companies} onToggle={toggle} /> : <EmptyCatalogue title="No products in this view." actionLabel="Create a product" onAction={() => openNewProduct()} />}
      </section>}

      {draft ? <ProductEditor draft={draft} products={products} sops={sops} companies={companies} onClose={() => setDraft(null)} onSaved={product => { upsert(product); setDraft(null); }} /> : null}
    </div>
  );
}

function CompanyCard({ company, selected, onSelect }: { company: CompanyShelf; selected: boolean; onSelect: () => void }) {
  const cover = company.products.find(product => product.coverImageUrl)?.coverImageUrl;
  const categoryCount = new Set(company.products.map(product => product.category)).size;
  const coverColours = [...new Set(company.products.map(product => product.accentColor).filter(Boolean))].slice(0, 4);
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`group overflow-hidden rounded-lg border bg-white text-left transition ${selected ? "border-black shadow-md" : "border-black/10 hover:border-black/25 hover:shadow-sm"}`}>
    <div className="relative aspect-[16/7] overflow-hidden" style={{ backgroundColor: company.colour }}>
      {cover ? <div className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.02]" style={{ backgroundImage: `url(${cover})` }} /> : coverColours.length ? <div className="absolute inset-0 flex">{coverColours.map(colour => <span key={colour} className="h-full flex-1" style={{ backgroundColor: colour }} />)}</div> : null}
      {cover ? <div className="absolute inset-0 bg-black/20" /> : <div className="absolute inset-0 grid place-items-center bg-black/15 text-white/90"><Building2 size={28} /></div>}
      <span className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-black/65">{company.products.length} product{company.products.length === 1 ? "" : "s"}</span>
    </div>
    <div className="flex min-h-32 flex-col p-4">
      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-black/85">{company.name}</h3><ChevronRight className={`mt-0.5 shrink-0 ${selected ? "text-black" : "text-black/35"}`} size={17} /></div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/50">{company.description}</p>
      <p className="mt-auto pt-3 text-[10px] font-semibold uppercase text-black/40">{categoryCount} categor{categoryCount === 1 ? "y" : "ies"}</p>
    </div>
  </button>;
}

function CategoryCard({ category, products, colour, selected, onSelect }: { category: string; products: AgencyProduct[]; colour: string; selected: boolean; onSelect: () => void }) {
  const cover = products.find(product => product.coverImageUrl)?.coverImageUrl;
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`grid min-h-28 grid-cols-[92px_1fr] overflow-hidden rounded-lg border bg-white text-left transition ${selected ? "border-black shadow-md" : "border-black/10 hover:border-black/25 hover:shadow-sm"}`}>
    <div className="relative h-full min-h-28 bg-cover bg-center" style={{ backgroundColor: colour, backgroundImage: cover ? `url(${cover})` : undefined }}>
      {cover ? <div className="absolute inset-0 bg-black/15" /> : <div className="grid h-full place-items-center text-white/85"><FolderOpen size={24} /></div>}
    </div>
    <div className="flex min-w-0 flex-col p-3">
      <div className="flex items-start justify-between gap-2"><h3 className="truncate text-sm font-semibold text-black/85">{category}</h3><ChevronRight className={`shrink-0 ${selected ? "text-black" : "text-black/35"}`} size={16} /></div>
      <p className="mt-1 text-xs text-black/45">{products.length} product{products.length === 1 ? "" : "s"}</p>
      <div className="mt-auto flex gap-1 pt-3">{products.slice(0, 4).map(product => <span key={product.id} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: product.accentColor || colour }} />)}</div>
    </div>
  </button>;
}

function ProductGrid({ products, sops, companies, onToggle }: { products: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; onToggle: (product: AgencyProduct) => Promise<void> }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {products.map(product => <ProductCard key={product.id} product={product} sops={sops} companies={companies} onToggle={onToggle} />)}
  </div>;
}

function ProductCard({ product, sops, companies, onToggle }: { product: AgencyProduct; sops: SopDocument[]; companies: TradingCompany[]; onToggle: (product: AgencyProduct) => Promise<void> }) {
  const brandNames = (product.companyIds ?? []).length
    ? companies.filter(company => (product.companyIds ?? []).includes(company.id)).map(company => company.name).join(" · ")
    : "AquaOasis-Web";
  const sopCount = linkedSopCount(product, sops);
  return <article className={`group overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm transition hover:border-black/20 hover:shadow-md ${product.active ? "" : "opacity-60"}`}>
    <div className="relative aspect-[16/9] overflow-hidden bg-cover bg-center" style={{ backgroundColor: product.accentColor || "#8E7340", backgroundImage: product.coverImageUrl ? `url(${product.coverImageUrl})` : undefined }}>
      {product.coverImageUrl ? <div className="absolute inset-0 bg-black/20 transition group-hover:bg-black/10" /> : <div className="grid h-full place-items-center text-white/85">{product.kind === "package" ? <Layers3 size={34} /> : <Package size={34} />}</div>}
      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <span className="rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-black/65">{product.category}</span>
        {product.active ? null : <span className="rounded-md bg-black/75 px-2 py-1 text-[10px] font-bold text-white">Archived</span>}
      </div>
    </div>
    <div className="flex min-h-64 flex-col p-4">
      <p className="truncate text-[10px] font-semibold uppercase text-black/40">{brandNames}</p>
      <h3 className="mt-1 text-lg font-semibold text-black/90"><Link href={`/portal/agency/products/${product.id}`} className="hover:underline">{product.name}</Link></h3>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-black/55">{product.buyerHeadline || product.description || "Buyer-facing summary not added yet."}</p>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/10 pt-3 text-[11px] text-black/50">
        <span><strong className="block font-semibold text-black/70">{priceLabel(product)}</strong>Pricing</span>
        <span><strong className="block font-semibold text-black/70">{portalLabel(product.portalRequirement)}</strong>Portal</span>
        <span><strong className={`block font-semibold ${product.contractBody ? "text-emerald-700" : "text-amber-700"}`}>{product.contractBody ? "Ready" : "Missing"}</strong>Contract</span>
        <span><strong className="block font-semibold text-black/70">{sopCount}</strong>Linked SOP{sopCount === 1 ? "" : "s"}</span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <Link href={`/portal/agency/products/${product.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white">Open product <ArrowRight size={14} /></Link>
        <button type="button" onClick={() => void onToggle(product)} aria-label={`${product.active ? "Archive" : "Restore"} ${product.name}`} className="grid size-9 place-items-center rounded-md text-black/50 hover:bg-black/[0.04]">{product.active ? <Archive size={15} /> : <RotateCcw size={15} />}</button>
      </div>
    </div>
  </article>;
}

function EmptyCatalogue({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return <div className="border-y border-dashed border-black/15 py-10 text-center"><p className="font-semibold text-black/70">{title}</p><button type="button" onClick={onAction} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/65"><Plus size={14} />{actionLabel}</button></div>;
}

export function ProductEditor({ draft, products, sops, companies, onClose, onSaved }: { draft: Draft; products: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; onClose: () => void; onSaved: (product: AgencyProduct) => void }) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sopCategories = [...new Set(sops.map(sop => sop.category).filter((value): value is string => Boolean(value)))].sort();

  function toggleSop(id: string) {
    setForm(value => ({ ...value, sopIds: value.sopIds.includes(id) ? value.sopIds.filter(item => item !== id) : [...value.sopIds, id] }));
  }

  function toggleSopCategory(category: string) {
    setForm(value => ({ ...value, sopCategories: value.sopCategories.includes(category) ? value.sopCategories.filter(item => item !== category) : [...value.sopCategories, category] }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/portal/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: form.id ? "update" : "create",
        productId: form.id,
        kind: form.kind,
        name: form.name,
        category: form.category,
        description: form.description,
        buyerHeadline: form.buyerHeadline,
        coverImageUrl: form.coverImageUrl,
        accentColor: form.accentColor,
        portalRequirement: form.portalRequirement,
        portalHeadline: form.portalHeadline,
        portalWelcomeNote: form.portalWelcomeNote,
        includedProductIds: form.includedProductIds,
        welcomePackItems: form.welcomePackItems.split("\n").map(item => item.trim()).filter(Boolean),
        welcomePackNotes: form.welcomePackNotes,
        pricing: form.pricing,
        priceCents: form.price ? Math.round(Number(form.price) * 100) : undefined,
        billingInterval: form.billingInterval,
        depositPercent: Number(form.depositPercent || 0),
        taxRatePercent: Number(form.taxRatePercent || 0),
        paymentTermsDays: Number(form.paymentTermsDays || 0),
        billingNotes: form.billingNotes,
        internalInfo: form.internalInfo,
        deliverables: form.deliverables.split("\n").map(item => item.trim()).filter(Boolean),
        contractTitle: form.contractTitle,
        contractBody: form.contractBody,
        sopIds: form.sopIds,
        sopCategories: form.sopCategories,
        companyIds: form.companyIds,
      }),
    });
    const json = await response.json().catch(() => null) as { product?: AgencyProduct; error?: string } | null;
    if (response.ok && json?.product) onSaved(json.product); else setError(json?.error || "Could not save product.");
    setBusy(false);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="product-editor-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-black/10 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-semibold uppercase text-brand">{form.id ? "Edit product" : "New product"}</p><h2 id="product-editor-title" className="mt-1 text-xl font-semibold">Define the offer clearly.</h2></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mt-5 grid gap-4">
          <Field label="Offer type"><select value={form.kind} onChange={event => setForm(value => ({ ...value, kind: event.target.value as AgencyProductKind }))} className={control}><option value="product">Individual product</option><option value="package">Package of products</option></select></Field>
          <Field label="Product name"><input required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} className={control} placeholder="Local visibility package" /></Field>
          {companies.length ? <Field label="Service brand">
            <div className="flex flex-wrap gap-2 rounded-md border border-black/10 bg-black/[0.015] p-3">
              <label className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-black/65"><input type="checkbox" checked={!form.companyIds.length} onChange={() => setForm(value => ({ ...value, companyIds: [] }))} />Shared AquaOasis-Web offer</label>
              {companies.filter(company => company.status !== "archived").map(company => <label key={company.id} className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-black/65"><input type="checkbox" checked={form.companyIds.includes(company.id)} onChange={() => setForm(value => ({ ...value, companyIds: value.companyIds.includes(company.id) ? value.companyIds.filter(id => id !== company.id) : [...value.companyIds, company.id] }))} />{company.name}</label>)}
            </div>
          </Field> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category"><input list="product-categories" value={form.category} onChange={event => setForm(value => ({ ...value, category: event.target.value }))} className={control} /><datalist id="product-categories">{AGENCY_PRODUCT_CATEGORIES.map(category => <option key={category} value={category} />)}</datalist></Field>
            <Field label="Pricing"><select value={form.pricing} onChange={event => setForm(value => ({ ...value, pricing: event.target.value as AgencyProductPricing }))} className={control}><option value="custom">Custom quote</option><option value="fixed">Fixed price</option><option value="from">Starting from</option><option value="recurring">Recurring</option></select></Field>
          </div>
          {form.pricing !== "custom" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Price (£)"><input required type="number" min="0" step="0.01" value={form.price} onChange={event => setForm(value => ({ ...value, price: event.target.value }))} className={control} /></Field>{form.pricing === "recurring" ? <Field label="Bill every"><select value={form.billingInterval} onChange={event => setForm(value => ({ ...value, billingInterval: event.target.value as Draft["billingInterval"] }))} className={control}><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></Field> : null}</div> : null}
          <Field label="Customer-facing description"><textarea rows={3} value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} className={`${control} py-2`} /></Field>
          <Field label="Deliverables (one per line)"><textarea rows={5} value={form.deliverables} onChange={event => setForm(value => ({ ...value, deliverables: event.target.value }))} className={`${control} py-2`} placeholder={"Strategy session\nWebsite design\nLaunch support"} /></Field>

          {form.kind === "package" ? <details className="border-t border-black/10 pt-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Products in this package</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Bundle existing products while keeping package pricing, contract, portal and welcome experience editable.</p>
            <div className="mt-4 grid max-h-52 gap-2 overflow-y-auto rounded-md border border-black/10 p-3">
              {products.filter(product => product.id !== form.id && product.kind !== "package").map(product => <label key={product.id} className="flex items-start gap-2 text-sm text-black/65"><input className="mt-1" type="checkbox" checked={form.includedProductIds.includes(product.id)} onChange={() => setForm(value => ({ ...value, includedProductIds: value.includedProductIds.includes(product.id) ? value.includedProductIds.filter(id => id !== product.id) : [...value.includedProductIds, product.id] }))} /><span><strong className="font-medium text-black/75">{product.name}</strong><span className="block text-[11px] text-black/40">{product.category}</span></span></label>)}
            </div>
          </details> : null}

          <details className="border-t border-black/10 pt-4" open={Boolean(form.buyerHeadline || form.coverImageUrl || form.portalHeadline)}>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Design and buying experience</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Control how the offer is presented and what its client portal should feel like.</p>
            <div className="mt-4 grid gap-4">
              <Field label="Buyer-facing headline"><input value={form.buyerHeadline} onChange={event => setForm(value => ({ ...value, buyerHeadline: event.target.value }))} className={control} placeholder="A website that turns attention into enquiries." /></Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <Field label="Cover image URL"><input type="url" value={form.coverImageUrl} onChange={event => setForm(value => ({ ...value, coverImageUrl: event.target.value }))} className={control} placeholder="https://..." /></Field>
                <Field label="Accent colour"><input type="color" value={form.accentColor} onChange={event => setForm(value => ({ ...value, accentColor: event.target.value }))} className="h-11 w-full rounded-md border border-black/15 bg-white p-1" /></Field>
              </div>
              <Field label="Client portal"><select value={form.portalRequirement} onChange={event => setForm(value => ({ ...value, portalRequirement: event.target.value as AgencyProductPortalRequirement }))} className={control}><option value="required">Required for this product</option><option value="optional">Optional</option><option value="none">Not needed</option></select></Field>
              {form.portalRequirement !== "none" ? <>
                <Field label="Portal headline"><input value={form.portalHeadline} onChange={event => setForm(value => ({ ...value, portalHeadline: event.target.value }))} className={control} placeholder="Your project, clearly managed." /></Field>
                <Field label="Portal welcome message"><textarea rows={4} value={form.portalWelcomeNote} onChange={event => setForm(value => ({ ...value, portalWelcomeNote: event.target.value }))} className={`${control} py-2`} placeholder="The first message the client sees in their branded portal." /></Field>
              </> : null}
            </div>
          </details>

          <details className="border-t border-black/10 pt-4" open={Boolean(form.internalInfo)}>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Product information</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Internal context your team needs to sell and deliver this product properly.</p>
            <div className="mt-4"><Field label="Internal product brief"><textarea rows={7} value={form.internalInfo} onChange={event => setForm(value => ({ ...value, internalInfo: event.target.value }))} className={`${control} py-3 leading-6`} placeholder="Who it is for, exclusions, dependencies, delivery expectations and useful context." /></Field></div>
          </details>

          <details className="border-t border-black/10 pt-4" open={Boolean(form.welcomePackItems || form.welcomePackNotes)}>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Welcome pack</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Define what the client receives when they buy this product or package.</p>
            <div className="mt-4 grid gap-4">
              <Field label="Welcome pack items (one per line)"><textarea rows={6} value={form.welcomePackItems} onChange={event => setForm(value => ({ ...value, welcomePackItems: event.target.value }))} className={`${control} py-2`} placeholder={"Welcome letter\nProject roadmap\nBranded notebook"} /></Field>
              <Field label="Packing or delivery notes"><textarea rows={3} value={form.welcomePackNotes} onChange={event => setForm(value => ({ ...value, welcomePackNotes: event.target.value }))} className={`${control} py-2`} placeholder="Personalisation, supplier or sending instructions." /></Field>
            </div>
          </details>

          <details className="border-t border-black/10 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Billing defaults</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Applied when this product is selected for an invoice. Everything remains editable.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Deposit %"><input type="number" min="0" max="100" step="0.01" value={form.depositPercent} onChange={event => setForm(value => ({ ...value, depositPercent: event.target.value }))} className={control} /></Field>
              <Field label="Tax rate %"><input type="number" min="0" max="100" step="0.01" value={form.taxRatePercent} onChange={event => setForm(value => ({ ...value, taxRatePercent: event.target.value }))} className={control} /></Field>
              <Field label="Payment terms (days)"><input type="number" min="0" max="365" value={form.paymentTermsDays} onChange={event => setForm(value => ({ ...value, paymentTermsDays: event.target.value }))} className={control} /></Field>
            </div>
            <div className="mt-4"><Field label="Invoice note"><textarea rows={3} value={form.billingNotes} onChange={event => setForm(value => ({ ...value, billingNotes: event.target.value }))} className={`${control} py-2`} placeholder="Payment instructions or product-specific billing information." /></Field></div>
          </details>

          <details className="border-t border-black/10 pt-4" open={Boolean(form.contractTitle || form.contractBody)}>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Contract template</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Add the agreement for this product. It remains editable before it is sent.</p>
            <div className="mt-4 grid gap-4"><Field label="Contract title"><input value={form.contractTitle} onChange={event => setForm(value => ({ ...value, contractTitle: event.target.value }))} className={control} placeholder={`${form.name || "Product"} agreement`} /></Field><Field label="Contract terms"><textarea rows={12} value={form.contractBody} onChange={event => setForm(value => ({ ...value, contractBody: event.target.value }))} className={`${control} py-3 leading-6`} placeholder="Write or paste the terms for this product." /></Field></div>
          </details>

          <details className="border-t border-black/10 pt-4" open={Boolean(form.sopIds.length || form.sopCategories.length)}>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Delivery SOPs</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Attach individual SOPs or whole SOP categories. New SOPs added to a linked category are included automatically.</p>
            {sops.length ? <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div><p className="text-xs font-semibold text-black/55">SOP categories</p><div className="mt-2 grid gap-2">{sopCategories.map(category => <label key={category} className="flex items-center gap-2 text-sm text-black/65"><input type="checkbox" checked={form.sopCategories.includes(category)} onChange={() => toggleSopCategory(category)} />{category}</label>)}{sopCategories.length ? null : <p className="text-xs text-black/40">No categories created yet.</p>}</div></div>
              <div><p className="text-xs font-semibold text-black/55">Individual SOPs</p><div className="mt-2 grid max-h-44 gap-2 overflow-y-auto pr-2">{sops.map(sop => <label key={sop.id} className="flex items-start gap-2 text-sm text-black/65"><input className="mt-1" type="checkbox" checked={form.sopIds.includes(sop.id)} onChange={() => toggleSop(sop.id)} /><span>{sop.title}{sop.category ? <span className="block text-[10px] text-black/40">{sop.category}</span> : null}</span></label>)}</div></div>
            </div> : <div className="mt-4 rounded-md bg-black/[0.03] p-4 text-sm text-black/55">No SOPs exist yet. <a href="/portal/agency/sop-library" className="font-semibold underline">Open the SOP library</a> to write or upload one.</div>}
          </details>
        </div>

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Check size={14} />{busy ? "Saving..." : "Save product"}</button></div>
      </form>
    </div>
  );
}

const control = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/60">{label}{children}</label>; }
export function toDraft(product: AgencyProduct): Draft { return { id: product.id, kind: product.kind ?? "product", name: product.name, category: product.category, description: product.description ?? "", buyerHeadline: product.buyerHeadline ?? "", coverImageUrl: product.coverImageUrl ?? "", accentColor: product.accentColor ?? "#8E7340", portalRequirement: product.portalRequirement ?? "optional", portalHeadline: product.portalHeadline ?? "", portalWelcomeNote: product.portalWelcomeNote ?? "", includedProductIds: product.includedProductIds ?? [], welcomePackItems: (product.welcomePackItems ?? []).join("\n"), welcomePackNotes: product.welcomePackNotes ?? "", pricing: product.pricing, price: product.priceCents === undefined ? "" : (product.priceCents / 100).toFixed(2), billingInterval: product.billingInterval ?? "month", depositPercent: String(product.depositPercent ?? 0), taxRatePercent: String(product.taxRatePercent ?? 0), paymentTermsDays: String(product.paymentTermsDays ?? 7), billingNotes: product.billingNotes ?? "", internalInfo: product.internalInfo ?? "", deliverables: product.deliverables.join("\n"), contractTitle: product.contractTitle ?? "", contractBody: product.contractBody ?? "", sopIds: product.sopIds ?? [], sopCategories: product.sopCategories ?? [], companyIds: product.companyIds ?? [] }; }
export function priceLabel(product: AgencyProduct): string { if (product.pricing === "custom" || product.priceCents === undefined) return "Custom quote"; const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(product.priceCents / 100); if (product.pricing === "from") return `From ${amount}`; if (product.pricing === "recurring") return `${amount} / ${product.billingInterval ?? "month"}`; return amount; }
export function linkedSopCount(product: AgencyProduct, sops: SopDocument[]): number { return new Set(sops.filter(sop => (product.sopIds ?? []).includes(sop.id) || Boolean(sop.category && (product.sopCategories ?? []).includes(sop.category))).map(sop => sop.id)).size; }
export function portalLabel(requirement?: AgencyProductPortalRequirement): string { return requirement === "required" ? "required" : requirement === "none" ? "not needed" : "optional"; }
