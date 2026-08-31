"use client";

// Inline modal for "+ New client" on the agency home.
//
// The display name composes the primary contact and business with sensible
// fallbacks. New records only capture the work in the client's own words;
// products, billing and portal details can be configured later.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PortalCustomFields, type PortalCustomFieldValues } from "@/components/forms/PortalCustomFields";
import { businessCalendarDate } from "@/lib/shared/formatDateTime";
import type { PortalFormFieldDefinition } from "@/server/types";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

interface PhasePreset {
  id?: string;
  stage: string;
  label: string;
  description?: string;
  pluginPreset: readonly string[];
  portalVariantId?: string;
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
  helpingWith: string;
  clientFacingBrandId: string;
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

function defaultState(defaults: NewClientDefaults): FormState {
  return {
  entityType: "company",
  contactName: "",
  contactPhone: "",
  businessName: "",
  niche: "",
  slug: "",
  email: "",
  createPortal: defaults.createPortalByDefault,
  helpingWith: "",
  clientFacingBrandId: "",
  brandColor: "#0B6F6D",
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
  companyIds?: string[];
}

export interface NewClientBrandOption {
  id: string;
  name: string;
  primaryColor: string;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function freshOperationId(): string {
  return `new-client:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function composedDisplayName(state: FormState): string {
  const t = state.contactName.trim();
  const p = state.businessName.trim();
  return state.entityType === "company" ? p || t : t || p;
}

export function NewClientButton({ brands = [], defaults = FALLBACK_DEFAULTS, customFields = [], className, commandDeck = false }: { products?: NewClientProductOption[]; brands?: NewClientBrandOption[]; defaults?: NewClientDefaults; customFields?: PortalFormFieldDefinition[]; className?: string; commandDeck?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => defaultState(defaults));
  const [presets, setPresets] = useState<PhasePreset[]>([]);
  const [busy, setBusy] = useState(false);
  // Modal keyboard contract: focus enters the form, Tab stays inside it,
  // Escape backs out (except mid-save), focus returns to the New client button.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: busy ? undefined : () => setOpen(false) });
  const [error, setError] = useState<string | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<PortalCustomFieldValues>({});
  const slugTouched = useRef(false);
  const operationId = useRef(freshOperationId());

  useEffect(() => {
    if (!open) return;
    setState(defaultState(defaults));
    setPresets([]);
    setError(null);
    setCustomFieldValues({});
    slugTouched.current = false;
    operationId.current = freshOperationId();
    fetch("/api/portal/fulfillment/presets")
      .then(async r => {
        const data = await r.json().catch(() => null) as { presets?: PhasePreset[]; error?: string } | null;
        if (!r.ok) throw new Error(data?.error ?? "Could not load lifecycle phases.");
        return data;
      })
      .then(data => {
        if (!data || !Array.isArray(data.presets) || data.presets.length === 0) {
          throw new Error("No lifecycle phases are available. Add one in Fulfilment settings first.");
        }
        setPresets(data.presets);
        setState(current => ({
          ...current,
          stage: data.presets!.some(preset => preset.stage === current.stage)
            ? current.stage
            : data.presets![0]!.stage,
        }));
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, [open, defaults]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    operationId.current = freshOperationId();
    setState(s => {
      const next = { ...s, [key]: value };
      if ((key === "contactName" || key === "businessName") && !slugTouched.current) {
        next.slug = slugify(composedDisplayName(next));
      }
      if (key === "slug") slugTouched.current = true;
      return next;
    });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const display = composedDisplayName(state);
    if (!display) {
      setError(state.entityType === "company" ? "Business name is required." : "Person name is required.");
      return;
    }
    if (!presets.some(preset => preset.stage === state.stage)) {
      setError("Choose an available lifecycle phase before creating this client.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const helpingWith = state.helpingWith.trim();
      const res = await fetch("/api/portal/fulfillment/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: operationId.current,
          name: display,
          slug: state.slug.trim() || undefined,
          ownerEmail: state.email.trim() || undefined,
          companyId: state.clientFacingBrandId || undefined,
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
                  id: `contact_${operationId.current.replace(/[^a-zA-Z0-9]/g, "_").slice(-80)}`,
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
            helpingWith: helpingWith || undefined,
            serviceBrief: helpingWith || undefined,
            portalServicePlan: helpingWith || undefined,
            clientFacingBrandId: state.clientFacingBrandId || undefined,
            lifecycleStartReason: state.stageReason.trim() || undefined,
            whatsappLink:  state.whatsappLink.trim()  || undefined,
            stripeLink:    state.stripeLink.trim()    || undefined,
            portalWelcomeNote: defaults.clientWelcomeMessage || undefined,
            customFields: customFieldValues,
          },
          ...(state.createPortal
            ? {
                starterPortal: {
                  phase: presets.find(p => p.stage === state.stage)?.label ?? state.stage,
                  planTier: helpingWith || "Custom work",
                  contactName: state.contactName.trim() || undefined,
                  businessName: state.businessName.trim() || undefined,
                  onboardingStartedAt: businessCalendarDate(),
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
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"}
      >
        {commandDeck ? <><span className="grid size-8 shrink-0 place-items-center border border-[#68f5d0]/30 bg-[#68f5d0]/[0.07] text-[#68f5d0]"><UserPlus size={15} /></span><span><span className="block text-[8px] font-semibold uppercase text-[#68f5d0]/60">Order 04 · Commission</span><span className="mt-1 block text-sm font-semibold">New client</span></span></> : <><span aria-hidden="true">＋</span>New client</>}
      </button>

      {open && (
        <div
          role="dialog"
          ref={dialogRef} aria-modal="true"
          aria-labelledby="new-client-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <form
            onSubmit={submit}
            className="max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-4 shadow-xl sm:max-h-[92dvh] sm:rounded-xl sm:p-6"
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

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-black/70">What are we helping with?</span>
                <textarea
                  value={state.helpingWith}
                  onChange={(event) => update("helpingWith", event.target.value)}
                  rows={4}
                  maxLength={2_000}
                  disabled={busy}
                  placeholder="Write whatever is useful: a website, photoshoot, software idea, ongoing support, or a mix of things. You can organise products and the portal later."
                  className="min-h-28 resize-y rounded-md border border-black/15 px-3 py-2 text-sm leading-6 outline-none placeholder:text-black/35 focus:border-black/35"
                />
                <span className="text-[11px] leading-5 text-black/50">A simple internal brief. Products, billing and portal setup can be added from the client record later.</span>
              </label>

              <PortalCustomFields
                fields={customFields}
                values={customFieldValues}
                onChange={values => {
                  operationId.current = freshOperationId();
                  setCustomFieldValues(values);
                }}
                disabled={busy}
                legend="Client custom fields"
              />

              {brands.length ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Client-facing brand</span>
                  <select
                    value={state.clientFacingBrandId}
                    onChange={(event) => {
                      const brandId = event.target.value;
                      update("clientFacingBrandId", brandId);
                      const brand = brands.find(option => option.id === brandId);
                      if (brand) update("brandColor", brand.primaryColor);
                    }}
                    disabled={busy}
                    className="rounded-md border border-black/15 bg-white px-3 py-2"
                  >
                    <option value="">AquaOasis-Web (main brand)</option>
                    {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                  </select>
                  <span className="text-[11px] leading-5 text-black/50">Controls the customer-facing portal and paperwork. Internally, every record stays together here.</span>
                </label>
              ) : null}

              <details className="group border-y border-black/10">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-black/65">
                  More setup
                  <span aria-hidden className="text-black/35 transition group-open:rotate-45">+</span>
                </summary>
                <div className="grid gap-3 border-t border-black/10 py-4">
                  <label className="flex items-start gap-3 rounded-md border border-[#9b7a3e]/20 bg-[#f8f4ec] px-3 py-3">
                    <input type="checkbox" checked={state.createPortal} onChange={(e) => update("createPortal", e.target.checked)} disabled={busy} className="mt-0.5 size-4 accent-[#725724]" />
                    <span>
                      <span className="block text-xs font-medium text-[#725724]">Create a client portal now</span>
                      <span className="mt-1 block text-[11px] leading-5 text-[#725724]/75">Optional. Leave this off and set up their portal later from the client record.</span>
                    </span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-black/70">Starting stage</span>
                      <select value={state.stage} onChange={(e) => update("stage", e.target.value)} disabled={busy || presets.length === 0} className="rounded-md border border-black/15 px-3 py-2">
                        {presets.length === 0 ? <option value="">Loading phases…</option> : null}
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
              <button type="submit" disabled={busy || presets.length === 0}
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
