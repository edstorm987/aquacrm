"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDown, ArrowRight, ArrowUp, Building2, Check, ChevronRight, FolderOpen, Grid2X2, Layers3, Lightbulb, ListChecks, Package, Plus, Rocket, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { AgencyProduct, AgencyProductInternalWorkspace, AgencyProductKind, AgencyProductPortalMode, AgencyProductPortalRequirement, AgencyProductPortalTemplateKey, AgencyProductPricing, AgencyProductStatus, AgencyProductWorkspaceModule, AgencyProductWorkspaceStage, AgencyProductWorkspaceStep, PortalFormFieldDefinition, PortalFormFieldValue, SopDocument, TradingCompany } from "@/server/types";
import { AGENCY_PRODUCT_CATEGORIES } from "@/lib/products/agencyProductCategories";
import { PORTAL_PRODUCT_CATALOG, PORTAL_PHASE_LABELS } from "@/lib/portal/portalProducts";
import { defaultProductInternalWorkspace, PRODUCT_STAGE_PORTAL_MODES, PRODUCT_WORKSPACE_MODULES } from "@/lib/products/productInternalWorkspace";
import { PortalCustomFields } from "@/components/forms/PortalCustomFields";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

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
  portalTemplateKey: AgencyProductPortalTemplateKey | "";
  portalHeadline: string;
  portalWelcomeNote: string;
  portalStageFocus: Record<AgencyProductPortalMode, string>;
  portalSupportCta: string;
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
  internalWorkspace: AgencyProductInternalWorkspace;
  deliverables: string;
  contractTitle: string;
  contractBody: string;
  sopIds: string[];
  sopCategories: string[];
  companyIds: string[];
  customFields: Record<string, PortalFormFieldValue>;
  status: AgencyProductStatus;
};

export const EMPTY_PRODUCT_DRAFT: Draft = { kind: "product", name: "", category: "Digital", description: "", buyerHeadline: "", coverImageUrl: "", accentColor: "#8E7340", portalRequirement: "optional", portalTemplateKey: "", portalHeadline: "", portalWelcomeNote: "", portalStageFocus: { onboarding: "", designing: "", "developed-launch": "", maintenance: "" }, portalSupportCta: "Send request", includedProductIds: [], welcomePackItems: "", welcomePackNotes: "", pricing: "custom", price: "", billingInterval: "month", depositPercent: "0", taxRatePercent: "0", paymentTermsDays: "7", billingNotes: "", internalInfo: "", internalWorkspace: defaultProductInternalWorkspace({ name: "New service" }), deliverables: "", contractTitle: "", contractBody: "", sopIds: [], sopCategories: [], companyIds: [], customFields: {}, status: "live" };

const AQUA_COMPANY_ID = "aqua-oasis-web";

type CompanyShelf = {
  id: string;
  draftCompanyId: string | null;
  name: string;
  description: string;
  colour: string;
  products: AgencyProduct[];
};

export function ProductsWorkspace({ initialProducts, sops, companies, customFields = [], defaults = { taxRatePercent: 0, paymentTermsDays: 7 }, embedded = false, embeddedLabel = "Company catalogue" }: { initialProducts: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; customFields?: PortalFormFieldDefinition[]; defaults?: { taxRatePercent: number; paymentTermsDays: number }; embedded?: boolean; embeddedLabel?: string }) {
  const [products, setProducts] = useState(initialProducts);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<"browse" | "all">("browse");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const visible = useMemo(() => products.filter(product => showArchived || catalogueStatus(product) !== "archived"), [products, showArchived]);
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
    const nextStatus: AgencyProductStatus = catalogueStatus(product) === "live" ? "archived" : "live";
    const response = await fetch("/api/portal/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", productId: product.id, status: nextStatus }) });
    const json = await response.json().catch(() => null) as { product?: AgencyProduct } | null;
    if (response.ok && json?.product) upsert(json.product);
  }

  function openNewProduct(companyId = selectedCompanyId, category = selectedCategory, status: AgencyProductStatus = "live") {
    const company = companyShelves.find(item => item.id === companyId);
    setDraft({
      ...EMPTY_PRODUCT_DRAFT,
      includedProductIds: [],
      sopIds: [],
      sopCategories: [],
      internalWorkspace: defaultProductInternalWorkspace({ name: "New service" }),
      companyIds: company?.draftCompanyId ? [company.draftCompanyId] : [],
      category: category || "Digital",
      taxRatePercent: String(defaults.taxRatePercent),
      paymentTermsDays: String(defaults.paymentTermsDays),
      status,
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
        <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">{embedded ? embeddedLabel : "Products"}</p><h2 className={`${embedded ? "text-2xl" : "text-3xl"} mt-1 font-semibold tracking-tight text-black/90`}>Your complete offer catalogue.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Every service, package, price and delivery process, organised around the company that sells it.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openNewProduct(selectedCompanyId, selectedCategory, "draft")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65"><Lightbulb size={15} />Draft idea</button><button type="button" onClick={() => openNewProduct()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />New service</button></div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-black/10 py-3">
        <p className="text-sm text-black/55">{products.filter(product => catalogueStatus(product) === "live").length} live · {products.filter(product => catalogueStatus(product) === "draft").length} draft · {categories.length} categor{categories.length === 1 ? "y" : "ies"} · {companyShelves.length} compan{companyShelves.length === 1 ? "y" : "ies"}</p>
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

      {draft ? <ProductEditor draft={draft} products={products} sops={sops} companies={companies} customFields={customFields} onClose={() => setDraft(null)} onSaved={product => { upsert(product); setDraft(null); }} /> : null}
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
  const status = catalogueStatus(product);
  return <article className={`group overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm transition hover:border-black/20 hover:shadow-md ${status === "archived" ? "opacity-60" : ""}`}>
    <div className="relative aspect-[16/9] overflow-hidden bg-cover bg-center" style={{ backgroundColor: product.accentColor || "#8E7340", backgroundImage: product.coverImageUrl ? `url(${product.coverImageUrl})` : undefined }}>
      {product.coverImageUrl ? <div className="absolute inset-0 bg-black/20 transition group-hover:bg-black/10" /> : <div className="grid h-full place-items-center text-white/85">{product.kind === "package" ? <Layers3 size={34} /> : <Package size={34} />}</div>}
      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <span className="rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-black/65">{product.category}</span>
        {status === "live" ? null : <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${status === "draft" ? "bg-amber-100 text-amber-900" : "bg-black/75 text-white"}`}>{status === "draft" ? "Draft idea" : "Archived"}</span>}
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
        <Link href={`/portal/agency/products/${product.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white">Open & edit <ArrowRight size={14} /></Link>
        <button type="button" onClick={() => void onToggle(product)} aria-label={`${status === "live" ? "Archive" : status === "draft" ? "Publish" : "Restore"} ${product.name}`} title={status === "live" ? "Archive service" : status === "draft" ? "Publish service" : "Restore service"} className="grid size-9 place-items-center rounded-md text-black/50 hover:bg-black/[0.04]">{status === "live" ? <Archive size={15} /> : status === "draft" ? <Rocket size={15} /> : <RotateCcw size={15} />}</button>
      </div>
    </div>
  </article>;
}

function EmptyCatalogue({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return <div className="border-y border-dashed border-black/15 py-10 text-center"><p className="font-semibold text-black/70">{title}</p><button type="button" onClick={onAction} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/65"><Plus size={14} />{actionLabel}</button></div>;
}

export function ProductEditor({ draft, products, sops, companies, customFields = [], onClose, onSaved, clientContext, focusSection }: { draft: Draft; products: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; customFields?: PortalFormFieldDefinition[]; onClose: () => void; onSaved: (product: AgencyProduct) => void; clientContext?: { clientId: string; clientName: string }; focusSection?: "stages" }) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const stageSectionRef = useRef<HTMLDivElement>(null);
  // Modal keyboard contract: focus enters the editor, Tab stays inside it, Escape backs out (except mid-save), focus returns to the product row.
  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });

  useEffect(() => {
    if (focusSection !== "stages") return;
    const frame = window.requestAnimationFrame(() => stageSectionRef.current?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusSection]);
  const [error, setError] = useState("");
  const sopCategories = [...new Set(sops.map(sop => sop.category).filter((value): value is string => Boolean(value)))].sort();

  function toggleSop(id: string) {
    setForm(value => ({ ...value, sopIds: value.sopIds.includes(id) ? value.sopIds.filter(item => item !== id) : [...value.sopIds, id] }));
  }

  function toggleSopCategory(category: string) {
    setForm(value => ({ ...value, sopCategories: value.sopCategories.includes(category) ? value.sopCategories.filter(item => item !== category) : [...value.sopCategories, category] }));
  }

  function updateInternalWorkspace(patch: Partial<AgencyProductInternalWorkspace>) {
    setForm(value => ({ ...value, internalWorkspace: { ...value.internalWorkspace, ...patch } }));
  }

  function toggleWorkspaceModule(field: "quickActions" | "advancedModules", module: AgencyProductWorkspaceModule) {
    setForm(value => {
      const current = value.internalWorkspace[field];
      return { ...value, internalWorkspace: { ...value.internalWorkspace, [field]: current.includes(module) ? current.filter(item => item !== module) : [...current, module] } };
    });
  }

  function updateWorkspaceStep(stepId: string, patch: Partial<AgencyProductWorkspaceStep>) {
    setForm(value => ({ ...value, internalWorkspace: { ...value.internalWorkspace, processSteps: value.internalWorkspace.processSteps.map(step => step.id === stepId ? { ...step, ...patch } : step) } }));
  }

  function updateWorkspaceStage(stageId: string, patch: Partial<AgencyProductWorkspaceStage>) {
    setForm(value => ({ ...value, internalWorkspace: { ...value.internalWorkspace, lifecycleStages: value.internalWorkspace.lifecycleStages.map(stage => stage.id === stageId ? { ...stage, ...patch } : stage) } }));
  }

  function addWorkspaceStage() {
    setForm(value => value.internalWorkspace.lifecycleStages.length >= 12 ? value : ({ ...value, internalWorkspace: { ...value.internalWorkspace,
      lifecycleStages: [...value.internalWorkspace.lifecycleStages, {
        id: `workspace-stage-${Date.now().toString(36)}`,
        label: "New service stage",
        description: "Define what must be true before this service moves forward.",
        portalMode: "designing",
      }],
    } }));
  }

  function moveWorkspaceStage(index: number, direction: -1 | 1) {
    setForm(value => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= value.internalWorkspace.lifecycleStages.length) return value;
      const lifecycleStages = [...value.internalWorkspace.lifecycleStages];
      [lifecycleStages[index], lifecycleStages[nextIndex]] = [lifecycleStages[nextIndex], lifecycleStages[index]];
      return { ...value, internalWorkspace: { ...value.internalWorkspace, lifecycleStages } };
    });
  }

  function removeWorkspaceStage(stageId: string) {
    setForm(value => {
      if (value.internalWorkspace.lifecycleStages.length <= 1) return value;
      const lifecycleStages = value.internalWorkspace.lifecycleStages.filter(stage => stage.id !== stageId);
      const replacementId = lifecycleStages[0]?.id;
      return { ...value, internalWorkspace: { ...value.internalWorkspace,
        lifecycleStages,
        processSteps: value.internalWorkspace.processSteps.map(step => step.stageId === stageId ? { ...step, stageId: replacementId } : step),
      } };
    });
  }

  function addWorkspaceStep() {
    setForm(value => value.internalWorkspace.processSteps.length >= 48 ? value : ({ ...value, internalWorkspace: { ...value.internalWorkspace,
      processSteps: [...value.internalWorkspace.processSteps, {
        id: `workspace-step-${Date.now().toString(36)}`,
        title: "New process step",
        instruction: "",
        stageId: value.internalWorkspace.lifecycleStages[0]?.id,
        module: "delivery",
        sopIds: [],
      }],
    } }));
  }

  function moveWorkspaceStep(index: number, direction: -1 | 1) {
    setForm(value => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= value.internalWorkspace.processSteps.length) return value;
      const processSteps = [...value.internalWorkspace.processSteps];
      [processSteps[index], processSteps[nextIndex]] = [processSteps[nextIndex], processSteps[index]];
      return { ...value, internalWorkspace: { ...value.internalWorkspace, processSteps } };
    });
  }

  function removeWorkspaceStep(stepId: string) {
    setForm(value => ({ ...value, internalWorkspace: { ...value.internalWorkspace, processSteps: value.internalWorkspace.processSteps.filter(step => step.id !== stepId) } }));
  }

  function linkStepSop(stepId: string, sopId: string) {
    setForm(value => ({
      ...value,
      sopIds: sopId && !value.sopIds.includes(sopId) ? [...value.sopIds, sopId] : value.sopIds,
      internalWorkspace: {
        ...value.internalWorkspace,
        processSteps: value.internalWorkspace.processSteps.map(step => step.id === stepId ? { ...step, sopIds: sopId ? [sopId] : [] } : step),
      },
    }));
  }

  function resetInternalWorkspace() {
    setForm(value => ({
      ...value,
      internalWorkspace: defaultProductInternalWorkspace({
        id: value.id,
        name: value.name || "New service",
        portalTemplateKey: value.portalTemplateKey || undefined,
        sopIds: value.sopIds,
      }),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch(clientContext ? "/api/tenants/client-product-variation" : "/api/portal/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: clientContext ? "save" : form.id ? "update" : "create",
        clientId: clientContext?.clientId,
        productId: form.id,
        kind: form.kind,
        name: form.name,
        category: form.category,
        description: form.description,
        buyerHeadline: form.buyerHeadline,
        coverImageUrl: form.coverImageUrl,
        accentColor: form.accentColor,
        portalRequirement: form.portalRequirement,
        portalTemplateKey: form.portalTemplateKey || undefined,
        portalHeadline: form.portalHeadline,
        portalWelcomeNote: form.portalWelcomeNote,
        portalStageFocus: form.portalStageFocus,
        portalSupportCta: form.portalSupportCta,
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
        internalWorkspace: form.internalWorkspace,
        deliverables: form.deliverables.split("\n").map(item => item.trim()).filter(Boolean),
        contractTitle: form.contractTitle,
        contractBody: form.contractBody,
        sopIds: form.sopIds,
        sopCategories: form.sopCategories,
        companyIds: form.companyIds,
        customFields: clientContext ? undefined : form.customFields,
        status: form.status,
      }),
    });
    const json = await response.json().catch(() => null) as { product?: AgencyProduct; error?: string } | null;
    if (response.ok && json?.product) onSaved(json.product); else setError(json?.error || "Could not save product.");
    setBusy(false);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="product-editor-title" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-black/10 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-semibold uppercase text-brand">{clientContext ? `Client variation · ${clientContext.clientName}` : form.id ? "Edit product" : "New product"}</p><h2 id="product-editor-title" className="mt-1 text-xl font-semibold">{clientContext ? `Customise ${form.name} for this client.` : "Define the offer clearly."}</h2>{clientContext ? <p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">Only differences from the catalogue are retained. Resetting the variation restores the official service without deleting client work.</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mt-5 grid gap-4">
          {clientContext ? null : <div className="grid gap-4 sm:grid-cols-2"><Field label="Offer type"><select value={form.kind} onChange={event => setForm(value => ({ ...value, kind: event.target.value as AgencyProductKind }))} className={control}><option value="product">Individual product</option><option value="package">Package of products</option></select></Field><Field label="Catalogue state"><select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as AgencyProductStatus }))} className={control}><option value="draft">Draft idea · internal only</option><option value="live">Live · available to clients</option><option value="archived">Archived · retained history</option></select></Field></div>}
          <Field label={clientContext ? "Client-specific service name" : "Product name"}><input required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} className={control} placeholder="Local visibility package" /></Field>
          {!clientContext && companies.length ? <Field label="Service brand">
            <div className="flex flex-wrap gap-2 rounded-md border border-black/10 bg-black/[0.015] p-3">
              <label className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-black/65"><input type="checkbox" checked={!form.companyIds.length} onChange={() => setForm(value => ({ ...value, companyIds: [] }))} />Shared AquaOasis-Web offer</label>
              {companies.filter(company => company.status !== "archived").map(company => <label key={company.id} className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-black/65"><input type="checkbox" checked={form.companyIds.includes(company.id)} onChange={() => setForm(value => ({ ...value, companyIds: value.companyIds.includes(company.id) ? value.companyIds.filter(id => id !== company.id) : [...value.companyIds, company.id] }))} />{company.name}</label>)}
            </div>
          </Field> : null}
          <div className={`grid gap-4 ${clientContext ? "" : "sm:grid-cols-2"}`}>
            {clientContext ? null : <Field label="Category"><input list="product-categories" value={form.category} onChange={event => setForm(value => ({ ...value, category: event.target.value }))} className={control} /><datalist id="product-categories">{AGENCY_PRODUCT_CATEGORIES.map(category => <option key={category} value={category} />)}</datalist></Field>}
            <Field label="Pricing"><select value={form.pricing} onChange={event => setForm(value => ({ ...value, pricing: event.target.value as AgencyProductPricing }))} className={control}><option value="custom">Custom quote</option><option value="fixed">Fixed price</option><option value="from">Starting from</option><option value="recurring">Recurring</option></select></Field>
          </div>
          {form.pricing !== "custom" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Price (£)"><input required type="number" min="0" step="0.01" value={form.price} onChange={event => setForm(value => ({ ...value, price: event.target.value }))} className={control} /></Field>{form.pricing === "recurring" ? <Field label="Bill every"><select value={form.billingInterval} onChange={event => setForm(value => ({ ...value, billingInterval: event.target.value as Draft["billingInterval"] }))} className={control}><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></Field> : null}</div> : null}
          <Field label="Customer-facing description"><textarea rows={3} value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} className={`${control} py-2`} /></Field>
          <Field label="Deliverables (one per line)"><textarea rows={5} value={form.deliverables} onChange={event => setForm(value => ({ ...value, deliverables: event.target.value }))} className={`${control} py-2`} placeholder={"Strategy session\nWebsite design\nLaunch support"} /></Field>
          {!clientContext ? <PortalCustomFields fields={customFields} values={form.customFields} onChange={values => setForm(value => ({ ...value, customFields: values }))} legend="Product custom fields" /> : null}

          {!clientContext && form.kind === "package" ? <details className="border-t border-black/10 pt-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-black/75">Products in this package</summary>
            <p className="mt-1 text-xs leading-5 text-black/45">Bundle existing products while keeping package pricing, contract, portal and welcome experience editable.</p>
            <div className="mt-4 grid max-h-52 gap-2 overflow-y-auto rounded-md border border-black/10 p-3">
              {products.filter(product => product.id !== form.id && product.kind !== "package" && (product.active || form.includedProductIds.includes(product.id))).map(product => {
                const included = form.includedProductIds.includes(product.id);
                return <label key={product.id} className={`flex items-start gap-2 text-sm text-black/65 ${!product.active && !included ? "opacity-45" : ""}`}><input className="mt-1" type="checkbox" checked={included} disabled={!product.active && !included} onChange={() => setForm(value => ({ ...value, includedProductIds: value.includedProductIds.includes(product.id) ? value.includedProductIds.filter(id => id !== product.id) : [...value.includedProductIds, product.id] }))} /><span><strong className="font-medium text-black/75">{product.name}</strong>{!product.active ? <span className="ml-2 text-[9px] font-semibold uppercase text-red-600">Archived</span> : null}<span className="block text-[11px] text-black/40">{product.category}</span></span></label>;
              })}
            </div>
          </details> : null}

          <details className="border-t border-black/10 pt-4" open>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
              <span className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sky-50 text-sky-700"><ListChecks size={17} /></span>
                <span><span className="block text-sm font-semibold text-black/78">Internal client workspace</span><span className="mt-1 block text-xs leading-5 text-black/45">Build the operating process your team inherits whenever this product is assigned.</span></span>
              </span>
              <span className="shrink-0 rounded-full bg-black/[0.045] px-2.5 py-1 text-[10px] font-semibold text-black/45">{form.internalWorkspace.lifecycleStages.length} stages · {form.internalWorkspace.processSteps.length} steps</span>
            </summary>

            <div className="mt-5 grid gap-6 rounded-md border border-black/10 bg-black/[0.015] p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workspace name"><input value={form.internalWorkspace.title ?? ""} onChange={event => updateInternalWorkspace({ title: event.target.value })} className={control} placeholder={`${form.name || "Service"} delivery plan`} /></Field>
                <Field label="Operating objective"><input value={form.internalWorkspace.objective ?? ""} onChange={event => updateInternalWorkspace({ objective: event.target.value })} className={control} placeholder="The result this workspace must produce" /></Field>
              </div>

              <div>
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold text-black/65">Everyday controls</p><p className="mt-1 text-[11px] text-black/40">Keep only the destinations used while delivering this service.</p></div><span className="text-[10px] font-semibold uppercase text-black/35">{form.internalWorkspace.quickActions.length} visible</span></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {PRODUCT_WORKSPACE_MODULES.map(module => {
                    const selected = form.internalWorkspace.quickActions.includes(module.id);
                    return <label key={module.id} className={`cursor-pointer border px-3 py-2.5 transition ${selected ? "border-sky-300 bg-sky-50" : "border-black/10 bg-white hover:border-black/20"}`}><span className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={() => toggleWorkspaceModule("quickActions", module.id)} /><span className="text-xs font-semibold text-black/68">{module.label}</span></span><span className="mt-1 block pl-5 text-[10px] leading-4 text-black/38">{module.description}</span></label>;
                  })}
                </div>
              </div>

              <div ref={stageSectionRef} className="scroll-mt-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-black/65">Service stages</p><p className="mt-1 text-[11px] text-black/40">Each assigned service moves independently. The portal mode controls the matching client-facing experience.</p></div><button type="button" onClick={addWorkspaceStage} disabled={form.internalWorkspace.lifecycleStages.length >= 12} title={form.internalWorkspace.lifecycleStages.length >= 12 ? "A service can contain up to 12 stages" : "Add service stage"} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 disabled:cursor-not-allowed disabled:opacity-45"><Plus size={13} /> Add stage</button></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {form.internalWorkspace.lifecycleStages.map((stage, index) => <article key={stage.id} className="border border-black/10 bg-white p-3">
                    <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase text-black/38">Stage {String(index + 1).padStart(2, "0")}</span><span className="flex items-center gap-1"><button type="button" title="Move stage up" aria-label={`Move ${stage.label} up`} disabled={index === 0} onClick={() => moveWorkspaceStage(index, -1)} className="grid size-8 place-items-center text-black/42 disabled:opacity-25"><ArrowUp size={14} /></button><button type="button" title="Move stage down" aria-label={`Move ${stage.label} down`} disabled={index === form.internalWorkspace.lifecycleStages.length - 1} onClick={() => moveWorkspaceStage(index, 1)} className="grid size-8 place-items-center text-black/42 disabled:opacity-25"><ArrowDown size={14} /></button><button type="button" title="Remove stage" aria-label={`Remove ${stage.label}`} disabled={form.internalWorkspace.lifecycleStages.length <= 1} onClick={() => removeWorkspaceStage(stage.id)} className="grid size-8 place-items-center text-red-600 disabled:opacity-25"><Trash2 size={14} /></button></span></div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]"><Field label="Stage name"><input required value={stage.label} onChange={event => updateWorkspaceStage(stage.id, { label: event.target.value })} className={control} /></Field><Field label="Portal experience"><select value={stage.portalMode} onChange={event => updateWorkspaceStage(stage.id, { portalMode: event.target.value as AgencyProductPortalMode })} className={control}>{PRODUCT_STAGE_PORTAL_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field></div>
                    <div className="mt-3"><Field label="Done when"><input value={stage.description ?? ""} onChange={event => updateWorkspaceStage(stage.id, { description: event.target.value })} className={control} placeholder="What must be true before this service moves on?" /></Field></div>
                  </article>)}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-black/65">Ordered process</p><p className="mt-1 text-[11px] text-black/40">Each step can open the correct workspace and one exact SOP.</p></div><button type="button" onClick={addWorkspaceStep} disabled={form.internalWorkspace.processSteps.length >= 48} title={form.internalWorkspace.processSteps.length >= 48 ? "A service can contain up to 48 process steps" : "Add process step"} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 disabled:cursor-not-allowed disabled:opacity-45"><Plus size={13} /> Add step</button></div>
                <div className="mt-3 grid gap-3">
                  {form.internalWorkspace.processSteps.map((step, index) => <article key={step.id} className="border border-black/10 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase text-black/38">Step {String(index + 1).padStart(2, "0")}</span>
                      <span className="flex items-center gap-1">
                        <button type="button" title="Move step up" aria-label={`Move ${step.title} up`} disabled={index === 0} onClick={() => moveWorkspaceStep(index, -1)} className="grid size-8 place-items-center text-black/42 disabled:opacity-25"><ArrowUp size={14} /></button>
                        <button type="button" title="Move step down" aria-label={`Move ${step.title} down`} disabled={index === form.internalWorkspace.processSteps.length - 1} onClick={() => moveWorkspaceStep(index, 1)} className="grid size-8 place-items-center text-black/42 disabled:opacity-25"><ArrowDown size={14} /></button>
                        <button type="button" title="Remove step" aria-label={`Remove ${step.title}`} onClick={() => removeWorkspaceStep(step.id)} className="grid size-8 place-items-center text-red-600"><Trash2 size={14} /></button>
                      </span>
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
                      <Field label="Step name"><input required value={step.title} onChange={event => updateWorkspaceStep(step.id, { title: event.target.value })} className={control} /></Field>
                      <Field label="Service stage"><select value={step.stageId ?? form.internalWorkspace.lifecycleStages[0]?.id ?? ""} onChange={event => updateWorkspaceStep(step.id, { stageId: event.target.value })} className={control}>{form.internalWorkspace.lifecycleStages.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></Field>
                      <Field label="Open workspace"><select value={step.module} onChange={event => updateWorkspaceStep(step.id, { module: event.target.value as AgencyProductWorkspaceModule })} className={control}>{PRODUCT_WORKSPACE_MODULES.map(module => <option key={module.id} value={module.id}>{module.label}</option>)}</select></Field>
                    </div>
                    <div className="mt-3"><Field label="What the operator must do"><textarea rows={2} value={step.instruction ?? ""} onChange={event => updateWorkspaceStep(step.id, { instruction: event.target.value })} className={`${control} py-2`} placeholder="A concrete instruction with a clear finish condition." /></Field></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <Field label="SOP for this step"><select value={step.sopIds[0] ?? ""} onChange={event => linkStepSop(step.id, event.target.value)} className={control}><option value="">No exact SOP</option>{sops.map(sop => <option key={sop.id} value={sop.id}>{sop.title}{sop.category ? ` · ${sop.category}` : ""}</option>)}</select></Field>
                      <label className="flex min-h-11 items-center gap-2 border border-black/10 bg-black/[0.018] px-3 text-xs text-black/58"><input type="checkbox" checked={step.advanced === true} onChange={event => updateWorkspaceStep(step.id, { advanced: event.target.checked })} />Advanced step</label>
                    </div>
                  </article>)}
                  {form.internalWorkspace.processSteps.length ? null : <div className="border border-dashed border-black/15 px-4 py-7 text-center text-xs text-black/45">No steps yet. Add the first step your team should follow.</div>}
                </div>
              </div>

              <details className="border-t border-black/10 pt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-black/62"><SlidersHorizontal size={14} /> Advanced workspace tools · {form.internalWorkspace.advancedModules.length}</summary>
                <p className="mt-1 text-[11px] text-black/40">These stay behind an Advanced button in the client workspace.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">{PRODUCT_WORKSPACE_MODULES.map(module => <label key={module.id} className="flex items-center gap-2 border border-black/10 bg-white px-3 py-2.5 text-xs text-black/62"><input type="checkbox" checked={form.internalWorkspace.advancedModules.includes(module.id)} onChange={() => toggleWorkspaceModule("advancedModules", module.id)} />{module.label}</label>)}</div>
              </details>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4"><p className="max-w-xl text-[11px] leading-5 text-black/42">Packages combine their own process with every included product, so the client workspace expands without overwriting either playbook.</p><button type="button" onClick={resetInternalWorkspace} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/58"><RotateCcw size={13} /> Suggested process</button></div>
            </div>
          </details>

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
                {clientContext ? <p className="rounded-md border border-black/10 bg-black/[0.018] px-3 py-3 text-xs leading-5 text-black/48">This variation inherits the official portal template. Use the client portal studio below for page, brand, code and version changes belonging only to this client.</p> : <Field label="Portal template"><select value={form.portalTemplateKey} onChange={event => setForm(value => ({ ...value, portalTemplateKey: event.target.value as AgencyProductPortalTemplateKey | "" }))} className={control}><option value="">No template attached</option>{PORTAL_PRODUCT_CATALOG.map(template => <option key={template.catalogKey} value={template.catalogKey}>{template.name} portal</option>)}</select></Field>}
                <Field label="Portal headline"><input value={form.portalHeadline} onChange={event => setForm(value => ({ ...value, portalHeadline: event.target.value }))} className={control} placeholder="Your project, clearly managed." /></Field>
                <Field label="Portal welcome message"><textarea rows={4} value={form.portalWelcomeNote} onChange={event => setForm(value => ({ ...value, portalWelcomeNote: event.target.value }))} className={`${control} py-2`} placeholder="The first message the client sees in their branded portal." /></Field>
                <Field label="Portal support button"><input value={form.portalSupportCta} onChange={event => setForm(value => ({ ...value, portalSupportCta: event.target.value }))} className={control} placeholder="Send request" /></Field>
                <details className="border-t border-black/10 pt-4" open={Boolean(Object.values(form.portalStageFocus).some(Boolean))}>
                  <summary className="cursor-pointer text-sm font-semibold text-black/75">Lifecycle stage copy</summary>
                  <p className="mt-1 text-xs leading-5 text-black/45">Optional custom guidance for each client portal stage. Template defaults remain available when these are blank.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(Object.entries(PORTAL_PHASE_LABELS) as Array<[AgencyProductPortalMode, string]>).map(([stage, label]) => <Field key={stage} label={label}><textarea rows={3} value={form.portalStageFocus[stage]} onChange={event => setForm(value => ({ ...value, portalStageFocus: { ...value.portalStageFocus, [stage]: event.target.value } }))} className={`${control} py-2`} /></Field>)}
                  </div>
                </details>
                <Link href={clientContext ? `/portal/agency/portals/editor?scope=client&clientId=${encodeURIComponent(clientContext.clientId)}&mode=onboarding&section=home&context=client-workspace` : form.id ? `/portal/agency/portals/editor?scope=template&productId=${encodeURIComponent(form.id)}` : "/portal/agency/portals?view=templates"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-black/[0.025] px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.05]">{clientContext ? "Edit this client's portal experience" : form.id ? "Edit this product's portal template" : "Open portal template library"} <ArrowRight size={13} /></Link>
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
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Check size={14} />{busy ? "Saving..." : clientContext ? "Save client variation" : "Save product"}</button></div>
      </form>
    </div>
  );
}

const control = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/60">{label}{children}</label>; }
export function toDraft(product: AgencyProduct): Draft { return { id: product.id, kind: product.kind ?? "product", name: product.name, category: product.category, description: product.description ?? "", buyerHeadline: product.buyerHeadline ?? "", coverImageUrl: product.coverImageUrl ?? "", accentColor: product.accentColor ?? "#8E7340", portalRequirement: product.portalRequirement ?? "optional", portalTemplateKey: product.portalTemplateKey ?? "", portalHeadline: product.portalHeadline ?? "", portalWelcomeNote: product.portalWelcomeNote ?? "", portalStageFocus: { onboarding: product.portalStageFocus?.onboarding ?? "", designing: product.portalStageFocus?.designing ?? "", "developed-launch": product.portalStageFocus?.["developed-launch"] ?? "", maintenance: product.portalStageFocus?.maintenance ?? "" }, portalSupportCta: product.portalSupportCta ?? "Send request", includedProductIds: product.includedProductIds ?? [], welcomePackItems: (product.welcomePackItems ?? []).join("\n"), welcomePackNotes: product.welcomePackNotes ?? "", pricing: product.pricing, price: product.priceCents === undefined ? "" : (product.priceCents / 100).toFixed(2), billingInterval: product.billingInterval ?? "month", depositPercent: String(product.depositPercent ?? 0), taxRatePercent: String(product.taxRatePercent ?? 0), paymentTermsDays: String(product.paymentTermsDays ?? 7), billingNotes: product.billingNotes ?? "", internalInfo: product.internalInfo ?? "", internalWorkspace: product.internalWorkspace ?? defaultProductInternalWorkspace(product), deliverables: product.deliverables.join("\n"), contractTitle: product.contractTitle ?? "", contractBody: product.contractBody ?? "", sopIds: product.sopIds ?? [], sopCategories: product.sopCategories ?? [], companyIds: product.companyIds ?? [], customFields: product.customFields ?? {}, status: catalogueStatus(product) }; }
export function priceLabel(product: AgencyProduct): string { if (product.pricing === "custom" || product.priceCents === undefined) return "Custom quote"; const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(product.priceCents / 100); if (product.pricing === "from") return `From ${amount}`; if (product.pricing === "recurring") return `${amount} / ${product.billingInterval ?? "month"}`; return amount; }
export function linkedSopCount(product: AgencyProduct, sops: SopDocument[]): number { return new Set(sops.filter(sop => (product.sopIds ?? []).includes(sop.id) || Boolean(sop.category && (product.sopCategories ?? []).includes(sop.category))).map(sop => sop.id)).size; }
export function portalLabel(requirement?: AgencyProductPortalRequirement): string { return requirement === "required" ? "required" : requirement === "none" ? "not needed" : "optional"; }
export function catalogueStatus(product: Pick<AgencyProduct, "active"> & { status?: AgencyProductStatus }): AgencyProductStatus { return product.status ?? (product.active ? "live" : "archived"); }
