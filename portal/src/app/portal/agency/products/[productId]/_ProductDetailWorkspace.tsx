"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Check, CircleDollarSign, FileCheck2, LayoutDashboard, ListChecks, MonitorCog, Package, Pencil, Sparkles, Users, Workflow } from "lucide-react";
import { useState } from "react";

import type { AgencyProduct, SopDocument, TradingCompany } from "@/server/types";
import { PORTAL_PRODUCT_CATALOG } from "@/lib/portal/portalProducts";
import { defaultProductInternalWorkspace, productWorkspaceModuleLabel } from "@/lib/products/productInternalWorkspace";
import { ProductEditor, catalogueStatus, linkedSopCount, portalLabel, priceLabel, toDraft } from "../_ProductsWorkspace";
import { ProductRolloutCentre, type ProductRolloutClient } from "./_ProductRolloutCentre";

export function ProductDetailWorkspace({ initialProduct, products, sops, companies, rolloutClients, productTemplateNeedsRefresh, initialEditing = false }: { initialProduct: AgencyProduct; products: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; rolloutClients: ProductRolloutClient[]; productTemplateNeedsRefresh: boolean; initialEditing?: boolean }) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [editing, setEditing] = useState(initialEditing);
  const linkedSops = sops.filter(sop => product.sopIds.includes(sop.id) || Boolean(sop.category && product.sopCategories.includes(sop.category)));
  const includedProducts = products.filter(item => product.includedProductIds.includes(item.id));
  const portalTemplate = PORTAL_PRODUCT_CATALOG.find(template => template.catalogKey === product.portalTemplateKey);
  const internalWorkspace = product.internalWorkspace ?? defaultProductInternalWorkspace(product);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="border-b border-black/10 pb-7">
        <Link href="/portal/agency/fulfilment?view=services" className="inline-flex items-center gap-1.5 text-xs font-medium text-black/45 hover:text-black/75"><ArrowLeft size={14} />All services</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="mt-1 size-4 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: product.accentColor ?? "#8E7340" }} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase text-brand">Product service workspace · {product.kind === "package" ? "Package" : "Service"} · {product.category}</p>
                {catalogueStatus(product) !== "live" ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${catalogueStatus(product) === "draft" ? "bg-amber-100 text-amber-800" : "bg-black/[0.06] text-black/45"}`}>{catalogueStatus(product) === "draft" ? "Draft idea" : "Archived"}</span> : null}
              </div>
              <h1 className="mt-1 text-3xl font-semibold text-black/90">{product.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">{product.buyerHeadline || product.description || "Add a customer-facing description for this product."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.portalRequirement !== "none" ? <Link href={`/portal/agency/portals/editor?scope=template&productId=${encodeURIComponent(product.id)}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"><MonitorCog size={15} />Edit base portal</Link> : null}
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Pencil size={15} />Edit service</button>
          </div>
        </div>
        <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-4">
          <Metric label="Price" value={priceLabel(product)} />
          <Metric label="Portal" value={portalLabel(product.portalRequirement)} />
          <Metric label="Payment terms" value={`${product.paymentTermsDays ?? 7} days`} />
          <Metric label="Linked SOPs" value={String(linkedSopCount(product, sops))} />
        </div>
      </header>

      <nav aria-label="Product service workspace stations" className="sticky top-0 z-20 -mt-8 grid overflow-x-auto border-y border-black/10 bg-white/95 shadow-sm backdrop-blur sm:grid-cols-4 lg:grid-cols-7">
        <Station href="#service-overview" icon={<LayoutDashboard size={15} />} label="Overview" detail="Offer and scope" />
        <Station href="#assigned-clients" icon={<Users size={15} />} label="Clients" detail={`${rolloutClients.length} assigned`} />
        <Station href="#service-process" icon={<ListChecks size={15} />} label="Process" detail={`${internalWorkspace.processSteps.length} steps`} />
        <Station href="#service-pricing" icon={<CircleDollarSign size={15} />} label="Pricing" detail={priceLabel(product)} />
        <Station href="#service-portal" icon={<MonitorCog size={15} />} label="Base portal" detail={portalLabel(product.portalRequirement)} />
        <Station href="#service-contract" icon={<FileCheck2 size={15} />} label="Contract" detail={product.contractBody ? "Configured" : "Missing"} />
        <Station href="#service-sops" icon={<BookOpen size={15} />} label="SOPs" detail={`${linkedSopCount(product, sops)} linked`} />
      </nav>

      {catalogueStatus(product) === "draft" ? <div className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3"><p className="text-sm font-semibold text-amber-950">This is an internal draft service</p><p className="mt-1 text-xs leading-5 text-amber-900/65">Build the pricing, contract, portal, process and SOPs here. Publish it from Edit service when it is ready to be assigned to clients.</p></div> : null}

      <Section id="service-overview" icon={<Package size={17} />} title="Master service definition" detail="The official offer inherited by every assignment unless a client variation is created." action={<EditButton label="Edit offer" onClick={() => setEditing(true)} />}>
        {product.description ? <p className="max-w-3xl text-sm leading-6 text-black/65">{product.description}</p> : <Empty>Add a customer-facing description.</Empty>}
        <div className="mt-5">
          <Label>Deliverables</Label>
          {product.deliverables.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{product.deliverables.map(item => <li key={item} className="flex items-start gap-2 text-sm text-black/65"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>)}</ul> : <Empty>No deliverables added yet.</Empty>}
        </div>
        {product.kind === "package" ? <div className="mt-5"><Label>Products in this package</Label>{includedProducts.length ? <div className="mt-2 flex flex-wrap gap-2">{includedProducts.map(item => <Link key={item.id} href={`/portal/agency/products/${item.id}`} className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/65 hover:bg-black/[0.03]">{item.name}</Link>)}</div> : <Empty>No products included yet.</Empty>}</div> : null}
      </Section>

      <Section id="service-process" icon={<ListChecks size={17} />} title="Internal fulfilment process" detail="The operating path inherited by every client assigned this product. Stages, steps, modules and SOP actions remain editable here." action={<EditButton label="Edit process" onClick={() => setEditing(true)} />}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Label>Workspace</Label><p className="mt-1 text-lg font-semibold text-black/78">{internalWorkspace.title}</p><p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">{internalWorkspace.objective}</p></div>
        </div>
        <div className="mt-5 grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">{internalWorkspace.lifecycleStages.map((stage, index) => <div key={stage.id} className="bg-white p-3"><p className="text-[9px] font-semibold uppercase text-black/35">Stage {String(index + 1).padStart(2, "0")}</p><p className="mt-1 text-xs font-semibold text-black/70">{stage.label}</p><p className="mt-1 text-[10px] leading-4 text-black/42">{stage.description || "No exit condition added."}</p></div>)}</div>
        <ol className="mt-5 grid gap-px overflow-hidden border border-black/10 bg-black/10 md:grid-cols-2">
          {internalWorkspace.processSteps.map((step, index) => {
            const stepSops = sops.filter(sop => step.sopIds.includes(sop.id));
            const stage = internalWorkspace.lifecycleStages.find(item => item.id === step.stageId);
            return <li key={step.id} className="bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase text-brand">Step {String(index + 1).padStart(2, "0")}{stage ? ` · ${stage.label}` : ""}</span>{step.advanced ? <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/42">Advanced</span> : null}</div><p className="mt-2 text-sm font-semibold text-black/72">{step.title}</p><p className="mt-1 text-xs leading-5 text-black/45">{step.instruction || "No operating instruction added."}</p><p className="mt-3 text-[10px] font-semibold uppercase text-black/35">Opens {productWorkspaceModuleLabel(step.module)}{stepSops.length ? ` · ${stepSops.map(sop => sop.title).join(" · ")}` : ""}</p></li>;
          })}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">{internalWorkspace.quickActions.map(module => <span key={module} className="rounded-md bg-black/[0.04] px-3 py-1.5 text-xs text-black/58">{productWorkspaceModuleLabel(module)}</span>)}</div>
      </Section>

      <Section id="service-pricing" icon={<CircleDollarSign size={17} />} title="Pricing and billing" detail="Defaults used when quoting, invoicing, collecting payment and creating client variations." action={<EditButton label="Edit pricing" onClick={() => setEditing(true)} />}>
        <div className="grid gap-5 sm:grid-cols-4">
          <FieldValue label="Pricing model" value={readable(product.pricing)} />
          <FieldValue label="Deposit" value={`${product.depositPercent ?? 0}%`} />
          <FieldValue label="Tax rate" value={`${product.taxRatePercent ?? 0}%`} />
          <FieldValue label="Payment terms" value={`${product.paymentTermsDays ?? 7} days`} />
        </div>
        {product.billingNotes ? <div className="mt-5"><Label>Invoice note</Label><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{product.billingNotes}</p></div> : null}
      </Section>

      <Section id="service-portal" icon={<Sparkles size={17} />} title="Base portal and client experience" detail="The master portal layer, welcome pack and client-facing copy for this service." action={<EditButton label="Edit portal content" onClick={() => setEditing(true)} />}>
        {product.portalRequirement !== "none" ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-5"><div><p className="text-sm font-semibold text-black/75">{product.name} · Stunning Standard</p><p className="mt-1 text-xs text-black/45">Independent draft, publishing and version history for this product.</p></div><Link href={`/portal/agency/portals/editor?scope=template&productId=${encodeURIComponent(product.id)}`} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85"><MonitorCog size={14} />Open template editor</Link></div> : null}
        <div className="grid gap-5 md:grid-cols-2">
          <FieldValue label="Client portal" value={readable(portalLabel(product.portalRequirement))} />
          <FieldValue label="Portal template" value={portalTemplate ? `${portalTemplate.name} portal` : "Not attached"} />
          <FieldValue label="Portal headline" value={product.portalHeadline || "Not set"} />
          <FieldValue label="Support button" value={product.portalSupportCta || "Send request"} />
        </div>
        {product.portalWelcomeNote ? <div className="mt-5"><Label>Portal welcome message</Label><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{product.portalWelcomeNote}</p></div> : null}
        {product.portalStageFocus && Object.values(product.portalStageFocus).some(Boolean) ? <div className="mt-5"><Label>Lifecycle copy</Label><div className="mt-2 grid gap-3 sm:grid-cols-2">{Object.entries(product.portalStageFocus).map(([stage, copy]) => copy ? <div key={stage} className="border-l-2 border-black/10 pl-3"><p className="text-[10px] font-semibold uppercase text-black/35">{readable(stage)}</p><p className="mt-1 text-sm leading-5 text-black/58">{copy}</p></div> : null)}</div></div> : null}
        <div className="mt-5"><Label>Welcome pack</Label>{product.welcomePackItems.length ? <ul className="mt-2 flex flex-wrap gap-2">{product.welcomePackItems.map(item => <li key={item} className="rounded-md bg-black/[0.04] px-3 py-1.5 text-xs text-black/60">{item}</li>)}</ul> : <Empty>No welcome items added.</Empty>}{product.welcomePackNotes ? <p className="mt-3 text-sm leading-6 text-black/55">{product.welcomePackNotes}</p> : null}</div>
      </Section>

      <ProductRolloutCentre
        productId={product.id}
        productName={product.name}
        portalEnabled={product.portalRequirement !== "none"}
        productTemplateNeedsRefresh={productTemplateNeedsRefresh || product.updatedAt > initialProduct.updatedAt}
        clients={rolloutClients}
      />

      <Section id="service-contract" icon={<FileCheck2 size={17} />} title="Contract" detail="The reusable agreement attached to this service and available for client-specific variation." action={<EditButton label="Edit contract" onClick={() => setEditing(true)} />}>
        <p className="font-semibold text-black/75">{product.contractTitle || "No contract title"}</p>
        {product.contractBody ? <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap border-l-2 border-black/10 pl-4 text-sm leading-6 text-black/60">{product.contractBody}</div> : <Empty>No contract terms have been added.</Empty>}
      </Section>

      <Section id="service-sops" icon={<Workflow size={17} />} title="SOPs and delivery knowledge" detail="Everything the team needs to fulfil this service consistently." action={<div className="flex flex-wrap gap-2"><Link href="/portal/agency/sop-library" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/62"><BookOpen size={13} />SOP library</Link><EditButton label="Manage SOP links" onClick={() => setEditing(true)} /></div>}>
        <div><Label>Internal product brief</Label>{product.internalInfo ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{product.internalInfo}</p> : <Empty>No internal brief added.</Empty>}</div>
        <div className="mt-5"><Label>SOPs</Label>{linkedSops.length ? <div className="mt-2 divide-y divide-black/10 border-y border-black/10">{linkedSops.map(sop => <Link key={sop.id} href={`/portal/agency/sop-library?sop=${sop.id}`} className="flex items-center justify-between gap-3 py-3 text-sm text-black/65 hover:text-black"><span>{sop.title}</span><span className="text-xs text-black/35">{sop.category || sop.kind}</span></Link>)}</div> : <Empty>No SOPs or SOP categories linked.</Empty>}</div>
      </Section>

      {editing ? <ProductEditor draft={toDraft(product)} products={products.map(item => item.id === product.id ? product : item)} sops={sops} companies={companies} focusSection={initialEditing ? "stages" : undefined} onClose={() => setEditing(false)} onSaved={saved => { setProduct(saved); setEditing(false); router.refresh(); }} /> : null}
    </div>
  );
}

function Section({ id, icon, title, detail, action, children }: { id: string; icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 border-b border-black/10 pb-8"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="mt-0.5 text-brand">{icon}</span><div><h2 className="font-semibold text-black/85">{title}</h2><p className="mt-0.5 text-xs text-black/45">{detail}</p></div></div>{action}</div>{children}</section>;
}

function Station({ href, icon, label, detail }: { href: string; icon: React.ReactNode; label: string; detail: string }) {
  return <a href={href} className="flex min-w-36 items-center gap-2 border-r border-black/10 px-3 py-3 transition-colors hover:bg-black/[0.035]"><span className="text-brand">{icon}</span><span className="min-w-0"><span className="block text-xs font-semibold text-black/72">{label}</span><span className="block truncate text-[9px] uppercase text-black/35">{detail}</span></span></a>;
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]"><Pencil size={13} />{label}</button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 truncate text-sm font-semibold text-black/75">{value}</p></div>;
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return <div><Label>{label}</Label><p className="mt-1 text-sm font-medium text-black/70">{value}</p></div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase text-black/40">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-black/35">{children}</p>;
}

function readable(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
