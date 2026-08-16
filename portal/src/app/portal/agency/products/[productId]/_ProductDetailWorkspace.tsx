"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleDollarSign, FileCheck2, MonitorCog, Package, Pencil, Sparkles, Workflow } from "lucide-react";
import { useState } from "react";

import type { AgencyProduct, SopDocument, TradingCompany } from "@/server/types";
import { PORTAL_PRODUCT_CATALOG } from "@/lib/portalProducts";
import { ProductEditor, linkedSopCount, portalLabel, priceLabel, toDraft } from "../_ProductsWorkspace";
import { ProductRolloutCentre, type ProductRolloutClient } from "./_ProductRolloutCentre";

export function ProductDetailWorkspace({ initialProduct, products, sops, companies, rolloutClients, productTemplateNeedsRefresh }: { initialProduct: AgencyProduct; products: AgencyProduct[]; sops: SopDocument[]; companies: TradingCompany[]; rolloutClients: ProductRolloutClient[]; productTemplateNeedsRefresh: boolean }) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [editing, setEditing] = useState(false);
  const linkedSops = sops.filter(sop => product.sopIds.includes(sop.id) || Boolean(sop.category && product.sopCategories.includes(sop.category)));
  const includedProducts = products.filter(item => product.includedProductIds.includes(item.id));
  const portalTemplate = PORTAL_PRODUCT_CATALOG.find(template => template.catalogKey === product.portalTemplateKey);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="border-b border-black/10 pb-7">
        <Link href="/portal/agency/company?view=products" className="inline-flex items-center gap-1.5 text-xs font-medium text-black/45 hover:text-black/75"><ArrowLeft size={14} />All products</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="mt-1 size-4 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: product.accentColor ?? "#8E7340" }} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase text-brand">{product.kind === "package" ? "Product package" : "Product"} · {product.category}</p>
                {!product.active ? <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase text-black/45">Archived</span> : null}
              </div>
              <h1 className="mt-1 text-3xl font-semibold text-black/90">{product.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">{product.buyerHeadline || product.description || "Add a customer-facing description for this product."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.portalRequirement !== "none" ? <Link href={`/portal/agency/portals/editor?scope=template&productId=${encodeURIComponent(product.id)}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"><MonitorCog size={15} />Edit portal template</Link> : null}
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Pencil size={15} />Edit product</button>
          </div>
        </div>
        <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-black/10 bg-black/10 sm:grid-cols-4">
          <Metric label="Price" value={priceLabel(product)} />
          <Metric label="Portal" value={portalLabel(product.portalRequirement)} />
          <Metric label="Payment terms" value={`${product.paymentTermsDays ?? 7} days`} />
          <Metric label="Linked SOPs" value={String(linkedSopCount(product, sops))} />
        </div>
      </header>

      <Section icon={<Package size={17} />} title="The offer" detail="What the client buys and what the team delivers.">
        {product.description ? <p className="max-w-3xl text-sm leading-6 text-black/65">{product.description}</p> : <Empty>Add a customer-facing description.</Empty>}
        <div className="mt-5">
          <Label>Deliverables</Label>
          {product.deliverables.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{product.deliverables.map(item => <li key={item} className="flex items-start gap-2 text-sm text-black/65"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>)}</ul> : <Empty>No deliverables added yet.</Empty>}
        </div>
        {product.kind === "package" ? <div className="mt-5"><Label>Products in this package</Label>{includedProducts.length ? <div className="mt-2 flex flex-wrap gap-2">{includedProducts.map(item => <Link key={item.id} href={`/portal/agency/products/${item.id}`} className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-black/65 hover:bg-black/[0.03]">{item.name}</Link>)}</div> : <Empty>No products included yet.</Empty>}</div> : null}
      </Section>

      <Section icon={<CircleDollarSign size={17} />} title="Commercial setup" detail="Defaults used when quoting, invoicing, and collecting payment.">
        <div className="grid gap-5 sm:grid-cols-4">
          <FieldValue label="Pricing model" value={readable(product.pricing)} />
          <FieldValue label="Deposit" value={`${product.depositPercent ?? 0}%`} />
          <FieldValue label="Tax rate" value={`${product.taxRatePercent ?? 0}%`} />
          <FieldValue label="Payment terms" value={`${product.paymentTermsDays ?? 7} days`} />
        </div>
        {product.billingNotes ? <div className="mt-5"><Label>Invoice note</Label><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{product.billingNotes}</p></div> : null}
      </Section>

      <Section icon={<Sparkles size={17} />} title="Client experience" detail="How this product appears when a client buys it.">
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

      <Section icon={<FileCheck2 size={17} />} title="Contract" detail="The reusable agreement attached to this product.">
        <p className="font-semibold text-black/75">{product.contractTitle || "No contract title"}</p>
        {product.contractBody ? <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap border-l-2 border-black/10 pl-4 text-sm leading-6 text-black/60">{product.contractBody}</div> : <Empty>No contract terms have been added.</Empty>}
      </Section>

      <Section icon={<Workflow size={17} />} title="Delivery knowledge" detail="Internal context and procedures linked to this product.">
        <div><Label>Internal product brief</Label>{product.internalInfo ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{product.internalInfo}</p> : <Empty>No internal brief added.</Empty>}</div>
        <div className="mt-5"><Label>SOPs</Label>{linkedSops.length ? <div className="mt-2 divide-y divide-black/10 border-y border-black/10">{linkedSops.map(sop => <Link key={sop.id} href={`/portal/agency/sop-library?sop=${sop.id}`} className="flex items-center justify-between gap-3 py-3 text-sm text-black/65 hover:text-black"><span>{sop.title}</span><span className="text-xs text-black/35">{sop.category || sop.kind}</span></Link>)}</div> : <Empty>No SOPs or SOP categories linked.</Empty>}</div>
      </Section>

      {editing ? <ProductEditor draft={toDraft(product)} products={products.map(item => item.id === product.id ? product : item)} sops={sops} companies={companies} onClose={() => setEditing(false)} onSaved={saved => { setProduct(saved); setEditing(false); router.refresh(); }} /> : null}
    </div>
  );
}

function Section({ icon, title, detail, children }: { icon: React.ReactNode; title: string; detail: string; children: React.ReactNode }) {
  return <section className="border-b border-black/10 pb-8"><div className="mb-5 flex items-start gap-3"><span className="mt-0.5 text-brand">{icon}</span><div><h2 className="font-semibold text-black/85">{title}</h2><p className="mt-0.5 text-xs text-black/45">{detail}</p></div></div>{children}</section>;
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
