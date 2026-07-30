"use client";

// Inline modal for "+ New client" on the agency home.
//
// The display name composes "<Primary contact> · <Business>" (with sensible
// fallback when only one is supplied). Product / WhatsApp link /
// lock-in deposit / Stripe link all ride on `client.metadata` so no
// foundation schema needs to change. Phase preset list is fetched from
// the fulfillment plugin (`/api/portal/fulfillment/presets`) which now
// returns Aqua's six phases (chapter #59 §5).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PORTAL_PRODUCT_CATALOG } from "@/lib/portalProducts";

interface PhasePreset {
  stage: string;
  label: string;
  pluginPreset: readonly string[];
}

interface FormState {
  entityType: "company" | "person";
  contactName: string;
  contactPhone: string;
  businessName: string;
  niche: string;
  slug: string;
  email: string;
  createPortal: boolean;
  productIds: string[];
  brandColor: string;
  logoUrl: string;
  stage: string;
  stageReason: string;
  whatsappLink: string;
  stripeLink: string;
}

export interface NewClientDefaults {
  defaultClientStage: string;
  createPortalByDefault: boolean;
  clientWelcomeMessage?: string;
}

const FALLBACK_DEFAULTS: NewClientDefaults = {
  defaultClientStage: "aqua-epic-intro",
  createPortalByDefault: false,
};

function defaultState(product: NewClientProductOption, defaults: NewClientDefaults): FormState {
  return {
  entityType: "company",
  contactName: "",
  contactPhone: "",
  businessName: "",
  niche: "",
  slug: "",
  email: "",
  createPortal: product.portalRequirement === "required"
    ? true
    : product.portalRequirement === "none"
      ? false
      : defaults.createPortalByDefault,
  productIds: [product.id],
  brandColor: product.accentColor ?? "#0B6F6D",
  logoUrl: "",
  stage: defaults.defaultClientStage,
  stageReason: "",
  whatsappLink: "",
  stripeLink: "",
  };
}

export interface NewClientProductOption {
  id: string;
  name: string;
  description: string;
  deliverables: string[];
  buyerHeadline?: string;
  coverImageUrl?: string;
  accentColor?: string;
  portalRequirement?: "required" | "optional" | "none";
  portalHeadline?: string;
  portalWelcomeNote?: string;
  includedProductIds?: string[];
  welcomePackItems?: string[];
  welcomePackNotes?: string;
  kind?: "product" | "package";
  category?: string;
  pricing?: "fixed" | "from" | "recurring" | "custom";
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
  depositPercent?: number;
  taxRatePercent?: number;
  paymentTermsDays?: number;
  billingNotes?: string;
  internalInfo?: string;
  contractTitle?: string;
  contractBody?: string;
  sopIds?: string[];
  sopCategories?: string[];
}

const FALLBACK_PRODUCTS: NewClientProductOption[] = PORTAL_PRODUCT_CATALOG.map(product => ({
  id: product.id,
  name: product.name,
  description: product.description,
  deliverables: product.deliverables,
  portalRequirement: "optional",
}));

const FALLBACK_PRESETS: PhasePreset[] = [
  { stage: "aqua-epic-intro",    label: "Onboarding",                   pluginPreset: [] },
  { stage: "aqua-blueprint",     label: "Planning",                     pluginPreset: ["website-editor", "client-crm"] },
  { stage: "aqua-diagnostics",   label: "Content & foundations",        pluginPreset: ["website-editor", "client-crm"] },
  { stage: "aqua-brand-builder", label: "Design",                       pluginPreset: ["website-editor", "client-crm"] },
  { stage: "aqua-traffic",       label: "Build & launch",               pluginPreset: ["website-editor", "client-crm", "ecommerce", "agency-marketing", "email-sender"] },
  { stage: "aqua-mastery",       label: "Live care",                    pluginPreset: ["website-editor", "client-crm", "ecommerce", "agency-marketing", "email-sender", "memberships", "affiliates"] },
];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function composedDisplayName(state: FormState): string {
  const t = state.contactName.trim();
  const p = state.businessName.trim();
  return state.entityType === "company" ? p || t : t || p;
}

export function NewClientButton({ products = FALLBACK_PRODUCTS, defaults = FALLBACK_DEFAULTS }: { products?: NewClientProductOption[]; defaults?: NewClientDefaults }) {
  const router = useRouter();
  const availableProducts = products.length ? products : FALLBACK_PRODUCTS;
  const initialProductId = availableProducts.find(product => product.name.toLowerCase() === "website")?.id
    ?? availableProducts[0]?.id
    ?? "website";
  const initialProduct = availableProducts.find(product => product.id === initialProductId) ?? availableProducts[0]!;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => defaultState(initialProduct, defaults));
  const [presets, setPresets] = useState<PhasePreset[]>(FALLBACK_PRESETS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    setState(defaultState(initialProduct, defaults));
    setError(null);
    slugTouched.current = false;
    fetch("/api/portal/fulfillment/presets")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.presets) && data.presets.length > 0) {
          setPresets(data.presets);
        }
      })
      .catch(() => undefined);
  }, [open, initialProductId, defaults]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState(s => {
      const next = { ...s, [key]: value };
      if ((key === "contactName" || key === "businessName") && !slugTouched.current) {
        next.slug = slugify(composedDisplayName(next));
      }
      if (key === "slug") slugTouched.current = true;
      return next;
    });
  }

  function toggleProduct(productId: string) {
    setState(current => ({
      ...current,
      ...(() => {
        const alreadySelected = current.productIds.includes(productId);
        if (alreadySelected && current.productIds.length === 1) return {};

        const productIds = alreadySelected
          ? current.productIds.filter(id => id !== productId)
          : [...current.productIds, productId];
        const selected = availableProducts.filter(product => productIds.includes(product.id));
        const portalRequirement = selected.some(product => product.portalRequirement === "required")
          ? "required"
          : selected.every(product => product.portalRequirement === "none")
            ? "none"
            : "optional";
        const primaryProduct = availableProducts.find(product => product.id === productIds[0]);

        return {
          productIds,
          createPortal: portalRequirement === "required"
            ? true
            : portalRequirement === "none"
              ? false
              : current.createPortal,
          brandColor: primaryProduct?.accentColor ?? current.brandColor,
        };
      })(),
    }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const display = composedDisplayName(state);
    if (!display) {
      setError(state.entityType === "company" ? "Business name is required." : "Person name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const selectedProducts = state.productIds
        .map(productId => availableProducts.find(product => product.id === productId))
        .filter((product): product is NewClientProductOption => Boolean(product));
      const selectedProduct = selectedProducts[0];
      const selectedProductIds = new Set(selectedProducts.flatMap(product => [product.id, ...(product.includedProductIds ?? [])]));
      const selectedProductNames = selectedProducts.map(product => product.name);
      const selectedSopIds = [...new Set(selectedProducts.flatMap(product => product.sopIds ?? []))];
      const selectedSopCategories = [...new Set(selectedProducts.flatMap(product => product.sopCategories ?? []))];
      const welcomePackItems = [...new Set(selectedProducts.flatMap(product => product.welcomePackItems ?? []))];
      const welcomePackNotes = selectedProducts
        .map(product => product.welcomePackNotes?.trim())
        .filter((note): note is string => Boolean(note))
        .join("\n\n");
      const res = await fetch("/api/portal/fulfillment/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: display,
          slug: state.slug.trim() || undefined,
          ownerEmail: state.email.trim() || undefined,
          createPortal: state.createPortal,
          stage: state.stage,
          brand: {
            primaryColor: state.brandColor,
            logoUrl: state.logoUrl.trim() || undefined,
          },
          metadata: {
            clientEntityType: state.entityType,
            contactName: state.contactName.trim() || undefined,
            linkedContacts: state.contactName.trim()
              ? [{
                  id: `contact_${Date.now()}`,
                  name: state.contactName.trim(),
                  email: state.email.trim() || undefined,
                  phone: state.contactPhone.trim() || undefined,
                  role: state.entityType === "company" ? "Primary contact" : "Client",
                  primary: true,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                }]
              : [],
            businessName:  state.businessName.trim()  || undefined,
            niche: state.niche.trim() || undefined,
            therapistName: state.contactName.trim() || undefined,
            practiceName:  state.businessName.trim()  || undefined,
            portalServicePlan: selectedProductNames.join(" + "),
            agencyProductId: selectedProduct?.id,
            agencyProductIds: selectedProducts.map(product => product.id),
            clientProducts: selectedProducts.map(product => ({
              id: product.id,
              name: product.name,
              kind: product.kind,
              category: product.category,
              pricing: product.pricing,
              priceCents: product.priceCents,
              billingInterval: product.billingInterval,
              depositPercent: product.depositPercent,
              taxRatePercent: product.taxRatePercent,
              paymentTermsDays: product.paymentTermsDays,
              billingNotes: product.billingNotes,
              internalInfo: product.internalInfo,
              contractTitle: product.contractTitle,
              contractBody: product.contractBody,
              sopIds: product.sopIds ?? [],
              sopCategories: product.sopCategories ?? [],
            })),
            productKind: selectedProduct?.kind,
            productCategory: selectedProduct?.category,
            productPricing: selectedProduct?.pricing,
            productPriceCents: selectedProduct?.priceCents,
            productBillingInterval: selectedProduct?.billingInterval,
            productDepositPercent: selectedProduct?.depositPercent,
            productTaxRatePercent: selectedProduct?.taxRatePercent,
            productPaymentTermsDays: selectedProduct?.paymentTermsDays,
            productBillingNotes: selectedProduct?.billingNotes,
            productInternalInfo: selectedProduct?.internalInfo,
            productContractTitle: selectedProduct?.contractTitle,
            productContractBody: selectedProduct?.contractBody,
            productSopIds: selectedSopIds,
            productSopCategories: selectedSopCategories,
            lifecycleStartReason: state.stageReason.trim() || undefined,
            whatsappLink:  state.whatsappLink.trim()  || undefined,
            stripeLink:    state.stripeLink.trim()    || undefined,
            portalExperienceHeadline: selectedProduct?.portalHeadline || selectedProduct?.buyerHeadline || undefined,
            portalWelcomeNote: selectedProduct?.portalWelcomeNote || defaults.clientWelcomeMessage || undefined,
            portalAccentColor: selectedProduct?.accentColor || undefined,
            welcomePackItems,
            welcomePackNotes: welcomePackNotes || undefined,
            portalProducts: availableProducts
              .filter(product => selectedProductIds.has(product.id))
              .map(product => ({
                id: product.id,
                name: product.name,
                description: product.description,
                deliverables: product.deliverables,
                buyerHeadline: product.buyerHeadline,
                coverImageUrl: product.coverImageUrl,
                accentColor: product.accentColor,
                portalHeadline: product.portalHeadline,
                portalWelcomeNote: product.portalWelcomeNote,
              })),
          },
          ...(state.createPortal
            ? {
                starterPortal: {
                  phase: presets.find(p => p.stage === state.stage)?.label ?? state.stage,
                  planTier: selectedProductNames.join(" + ") || "Milesymedia product",
                  contactName: state.contactName.trim() || undefined,
                  businessName: state.businessName.trim() || undefined,
                  onboardingStartedAt: new Date().toISOString().slice(0, 10),
                },
              }
            : {}),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; client?: { id: string }; clientId?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not create client.");
        return;
      }
      const newId = data.client?.id ?? data.clientId;

      setOpen(false);
      router.push(newId ? `/portal/clients/${newId}` : "/portal/agency");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const selectedPreset = presets.find(p => p.stage === state.stage);
  const selectedProducts = availableProducts.filter(product => state.productIds.includes(product.id));
  const portalRequirement = selectedProducts.some(product => product.portalRequirement === "required")
    ? "required"
    : selectedProducts.every(product => product.portalRequirement === "none")
      ? "none"
      : "optional";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
      >
        <span aria-hidden="true">＋</span>
        New client
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-client-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <form
            onSubmit={submit}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 id="new-client-title" className="text-lg font-semibold text-black/90">New client</h3>
            <p className="mt-1 text-xs text-black/60">
              Start with the essentials. You can finish their portal, branding, billing, and workflow setup from the client record.
            </p>

            <div className="mt-4 grid gap-3 text-sm">
              <div className="inline-flex w-fit rounded-md border border-black/10 bg-black/[0.025] p-0.5" aria-label="Client type">
                <button type="button" onClick={() => update("entityType", "company")} className={`min-h-8 rounded px-3 text-xs font-medium ${state.entityType === "company" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Company</button>
                <button type="button" onClick={() => update("entityType", "person")} className={`min-h-8 rounded px-3 text-xs font-medium ${state.entityType === "person" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>Person</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">{state.entityType === "company" ? "Primary contact" : "Person name"}</span>
                  <input
                    value={state.contactName}
                    onChange={(e) => update("contactName", e.target.value)}
                    autoFocus disabled={busy}
                    placeholder="Jane Smith"
                    required={state.entityType === "person"}
                    className="rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">{state.entityType === "company" ? "Company name" : "Company (optional)"}</span>
                  <input
                    value={state.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                    disabled={busy}
                    placeholder="Company Ltd"
                    required={state.entityType === "company"}
                    className="rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Contact email</span>
                  <input
                    type="email"
                    value={state.email}
                    onChange={(e) => update("email", e.target.value)}
                    disabled={busy}
                    placeholder="optional"
                    className="rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Contact phone</span>
                  <input
                    type="tel"
                    value={state.contactPhone}
                    onChange={(e) => update("contactPhone", e.target.value)}
                    disabled={busy}
                    placeholder="optional"
                    className="rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-black/70">Niche</span>
                <input
                  value={state.niche}
                  onChange={(e) => update("niche", e.target.value)}
                  disabled={busy}
                  placeholder="Plumber, clinic, restaurant, consultant..."
                  className="rounded-md border border-black/15 px-3 py-2"
                />
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium text-black/70">What are we helping with?</legend>
                <p className="text-[11px] text-black/50">Choose one or more products or services.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableProducts.map(product => {
                    const checked = state.productIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition ${
                          checked
                            ? "border-brand/45 bg-brand/[0.06] text-black"
                            : "border-black/10 bg-white text-black/65 hover:border-black/20"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(product.id)}
                          disabled={busy || (checked && state.productIds.length === 1)}
                          className="size-4 shrink-0 accent-brand"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{product.name}</span>
                          {product.category ? <span className="block truncate text-[10px] text-black/45">{product.category}</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <small className="text-[11px] text-black/55">
                  {selectedProducts.length} selected
                  {selectedProducts.length ? ` · ${selectedProducts.map(product => product.name).join(", ")}` : ""}
                </small>
              </fieldset>

              <details className="group border-y border-black/10">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-black/65">
                  More setup
                  <span aria-hidden className="text-black/35 transition group-open:rotate-45">+</span>
                </summary>
                <div className="grid gap-3 border-t border-black/10 py-4">
                  <label className="flex items-start gap-3 rounded-md border border-[#9b7a3e]/20 bg-[#f8f4ec] px-3 py-3">
                    <input type="checkbox" checked={state.createPortal} onChange={(e) => update("createPortal", e.target.checked)} disabled={busy || portalRequirement !== "optional"} className="mt-0.5 size-4 accent-[#725724]" />
                    <span>
                      <span className="block text-xs font-medium text-[#725724]">{portalRequirement === "required" ? "Client portal required" : portalRequirement === "none" ? "Client portal not needed" : "Create a client portal now"}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-[#725724]/75">{portalRequirement === "required" ? "One or more selected products include a client portal." : portalRequirement === "none" ? "The selected products are configured without a portal." : "Optional. You can create it later from their client record."}</span>
                    </span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">Starting stage</span>
                      <select value={state.stage} onChange={(e) => update("stage", e.target.value)} disabled={busy} className="rounded-md border border-black/15 px-3 py-2">
                        {presets.map(p => <option key={p.stage} value={p.stage}>{p.label}</option>)}
                      </select>
                      {selectedPreset ? (
                        <small className="text-[11px] leading-5 text-black/55">
                          Choose where the work really is now. Earlier stages are optional and can be skipped.
                        </small>
                      ) : null}
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">Brand colour</span>
                      <input type="color" value={state.brandColor} onChange={(e) => update("brandColor", e.target.value)} disabled={busy} className="h-10 w-full rounded-md border border-black/15" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">Logo URL</span>
                      <input type="url" value={state.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} disabled={busy} placeholder="Optional" className="rounded-md border border-black/15 px-3 py-2 text-xs" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">WhatsApp group</span>
                      <input type="url" value={state.whatsappLink} onChange={(e) => update("whatsappLink", e.target.value)} disabled={busy} placeholder="Optional" className="rounded-md border border-black/15 px-3 py-2 text-xs" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">Payment link</span>
                      <input type="url" value={state.stripeLink} onChange={(e) => update("stripeLink", e.target.value)} disabled={busy} placeholder="Optional" className="rounded-md border border-black/15 px-3 py-2 text-xs" />
                    </label>
                  </div>
                  {state.stage !== presets[0]?.stage && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">
                        Why are earlier stages being skipped? <span className="font-normal text-black/40">(optional)</span>
                      </span>
                      <textarea
                        value={state.stageReason}
                        onChange={(e) => update("stageReason", e.target.value)}
                        rows={2}
                        maxLength={500}
                        disabled={busy}
                        placeholder="For example: Friend project; website already built."
                        className="resize-none rounded-md border border-black/15 px-3 py-2 text-sm outline-none placeholder:text-black/35 focus:border-black/35"
                      />
                    </label>
                  )}
                </div>
              </details>

              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                className="rounded-md px-3 py-2 text-sm text-black/70 hover:bg-black/5">
                Cancel
              </button>
              <button type="submit" disabled={busy}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-60">
                {busy ? "Creating…" : "Create client"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
