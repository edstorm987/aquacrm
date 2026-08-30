"use client";

// Convert a lead into a client — the handoff dialog.
//
// Lifted out of `_LeadsPipelineWorkspace` on 2026-08-29. An adversarial check
// could not fault the block itself: contiguous, no outside references to its
// internals, and — the decisive one — a top-level function rather than a
// closure over the workspace's state, so all six inputs arrive as props.
//
// Its three helpers were parked at the tail of the parent file but belong here:
// `inferProduct`, `defaultBillingCadence` and `priceLabel` are called ONLY from
// inside this component. Leaving them behind would have kept the parent long
// for no benefit and made this file lie about what it needs.

import { useState } from "react";
import { X } from "lucide-react";

import type { AgencyProductOption, ClientConversionPackage, LeadView } from "./_leadTypes";

export function ConvertLeadModal({
  lead,
  busy,
  updating,
  products,
  onCancel,
  onSubmit,
}: {
  lead: LeadView;
  busy: boolean;
  updating: boolean;
  products: AgencyProductOption[];
  onCancel: () => void;
  onSubmit: (conversion: ClientConversionPackage) => void;
}) {
  const clientName = lead.company || lead.name || lead.email;
  const initialProduct = products.find(product => product.id === lead.existingProductId)
    ?? inferProduct(lead, products)
    ?? products[0];
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const selectedProduct = products.find(product => product.id === productId);
  const [projectValue, setProjectValue] = useState(
    lead.existingProjectValue || lead.pricePoints || lead.budgetRange || priceLabel(initialProduct),
  );
  const [billingCadence, setBillingCadence] = useState(
    lead.existingBillingCadence || defaultBillingCadence(initialProduct),
  );
  const [createPortal, setCreatePortal] = useState(initialProduct?.portalRequirement !== "none");
  const [validation, setValidation] = useState<string | null>(null);

  function chooseProduct(nextProductId: string) {
    const product = products.find(item => item.id === nextProductId);
    setProductId(nextProductId);
    if (!product) return;
    setCreatePortal(product.portalRequirement !== "none");
    if (!projectValue.trim()) setProjectValue(priceLabel(product));
    if (!lead.existingBillingCadence) setBillingCadence(defaultBillingCadence(product));
    setValidation(null);
  }

  function submit() {
    if (!selectedProduct) {
      setValidation("Choose a product or package.");
      return;
    }
    onSubmit({
      productId: selectedProduct.id,
      createPortal,
      projectValue: projectValue.trim(),
      billingCadence,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-lead-title"
        className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-y-auto rounded-md bg-[#fbfaf8] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">Client handoff</p>
            <h2 id="convert-lead-title" className="mt-2 font-serif text-3xl text-black/90">
              Start {clientName}&apos;s delivery.
            </h2>
            <p className="mt-2 text-sm leading-6 text-black/52">
              Their sales history moves with them. Choose the product or package that was agreed and its editable setup will carry into delivery.
            </p>
          </div>
          <button type="button" onClick={onCancel} className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/48 hover:bg-black/[0.03]" aria-label="Close client handoff">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-6 px-5 py-6 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-black/62">
              Product or package
              <select value={productId} onChange={event => chooseProduct(event.target.value)} className="mt-1.5 w-full rounded-md border border-black/12 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name}{product.kind === "package" ? " (package)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-black/62">
              Agreed project value
              <input value={projectValue} onChange={event => setProjectValue(event.target.value)} placeholder="£6,500 + £195 monthly care" className="mt-1.5 w-full rounded-md border border-black/12 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
            </label>
          </div>

          {selectedProduct ? (
            <section className="rounded-md border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-black/80">{selectedProduct.name}</h3>
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">{selectedProduct.category}</span>
                {selectedProduct.kind === "package" ? <span className="text-[10px] font-semibold uppercase text-brand">{selectedProduct.includedProductIds.length} included products</span> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-black/50">{selectedProduct.buyerHeadline || selectedProduct.description || "Configured in Products."}</p>
              <p className="mt-2 text-xs font-medium text-black/65">{priceLabel(selectedProduct) || "Custom quote"}</p>
            </section>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Create an active product or package before converting this lead.
            </p>
          )}

          {selectedProduct?.portalRequirement !== "none" ? (
            <label className="flex items-start gap-3 rounded-md border border-black/10 bg-white p-4 text-sm text-black/65">
              <input
                type="checkbox"
                checked={createPortal}
                onChange={event => setCreatePortal(event.target.checked)}
                disabled={selectedProduct?.portalRequirement === "required"}
                className="mt-0.5 size-4 accent-black"
              />
              <span>
                <span className="block font-medium text-black/78">Create their AquaCRM client portal</span>
                <span className="mt-1 block text-xs leading-5 text-black/45">
                  {selectedProduct?.portalRequirement === "required"
                    ? "Included and required by this product."
                    : "Optional. It can also be created later from the client record."}
                </span>
              </span>
            </label>
          ) : null}

          <label className="max-w-sm text-xs font-medium text-black/62">
            Payment schedule
            <select value={billingCadence} onChange={event => setBillingCadence(event.target.value)} className="mt-1.5 w-full rounded-md border border-black/12 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand">
              <option value="Project">Project</option>
              <option value="Project + ongoing care">Project + ongoing care</option>
              <option value="Monthly">Monthly</option>
              <option value="One-off">One-off</option>
              <option value="As agreed">As agreed</option>
            </select>
          </label>

          <div className="border-y border-black/8 py-4 text-sm text-black/58">
            <p><strong className="font-medium text-black/78">What happens now:</strong> the client record is created with this product&apos;s agreed snapshot. {createPortal ? "Their portal begins in onboarding." : "No client portal will be created yet."}</p>
          </div>

          {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onCancel} className="min-h-10 rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/62">Cancel</button>
            <button type="button" onClick={submit} disabled={busy} className="min-h-10 rounded-md bg-black px-5 text-sm font-semibold text-white disabled:opacity-45">
              {busy ? "Preparing client..." : updating ? "Update client" : createPortal ? "Create client and portal" : "Create client"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function inferProduct(lead: LeadView, products: AgencyProductOption[]): AgencyProductOption | undefined {
  const context = [
    lead.tags.join(" "),
    lead.notes,
    lead.potentialProblems,
    lead.potentialSolutions,
    lead.pricePoints,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const signals = [
    { pattern: /\b(web|website|site|seo)\b/, names: /\b(web|website|seo)\b/i },
    { pattern: /\b(brand|branding|logo|identity)\b/, names: /\b(brand|branding|logo|identity)\b/i },
    { pattern: /\b(photo|photography|shoot|images)\b/, names: /\b(photo|photography|shoot)\b/i },
    { pattern: /\b(google|profile|local search|maps)\b/, names: /\b(google|profile|local)\b/i },
    { pattern: /\b(content|social|copy)\b/, names: /\b(content|social|copy)\b/i },
    { pattern: /\b(automation|workflow|system)\b/, names: /\b(automation|workflow|system)\b/i },
    { pattern: /\b(software|app|platform)\b/, names: /\b(software|app|platform)\b/i },
    { pattern: /\b(care|support|maintenance|monthly)\b/, names: /\b(care|support|maintenance)\b/i },
  ];
  for (const signal of signals) {
    if (!signal.pattern.test(context)) continue;
    const match = products.find(product => signal.names.test(`${product.name} ${product.category}`));
    if (match) return match;
  }
  return products.find(product => /\bwebsite\b/i.test(product.name)) ?? products[0];
}

function defaultBillingCadence(product?: AgencyProductOption): string {
  if (product?.pricing === "recurring") {
    const interval = product.billingInterval ?? "month";
    return interval === "month" ? "Monthly" : interval === "quarter" ? "Quarterly" : "Yearly";
  }
  return product?.pricing === "fixed" || product?.pricing === "from" ? "Project" : "As agreed";
}

function priceLabel(product?: AgencyProductOption): string {
  if (!product || product.priceCents === undefined || product.pricing === "custom") return "";
  const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(product.priceCents / 100);
  if (product.pricing === "from") return `From ${amount}`;
  if (product.pricing === "recurring") return `${amount} / ${product.billingInterval ?? "month"}`;
  return amount;
}
