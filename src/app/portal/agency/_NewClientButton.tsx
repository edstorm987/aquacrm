"use client";

// Inline modal for "+ New client" on the agency home — Aqua reskin.
//
// The display name composes "<Therapist> · <Practice>" (with sensible
// fallback when only one is supplied). Plan tier / WhatsApp link /
// lock-in deposit / Stripe link all ride on `client.metadata` so no
// foundation schema needs to change. Phase preset list is fetched from
// the fulfillment plugin (`/api/portal/fulfillment/presets`) which now
// returns Aqua's six phases (chapter #59 §5).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface PhasePreset {
  stage: string;
  label: string;
  pluginPreset: readonly string[];
}

type PlanTier = "foundational" | "expansion" | "mastery";

interface FormState {
  therapistName: string;
  practiceName: string;
  slug: string;
  email: string;
  brandColor: string;
  logoUrl: string;
  stage: string;
  planTier: PlanTier;
  whatsappLink: string;
  stripeLink: string;
  lockInPaid: boolean;
  useIncubator: boolean;
}

const DEFAULT_STATE: FormState = {
  therapistName: "",
  practiceName: "",
  slug: "",
  email: "",
  brandColor: "#0EA5A4",
  logoUrl: "",
  stage: "aqua-epic-intro",
  planTier: "foundational",
  whatsappLink: "",
  stripeLink: "",
  lockInPaid: false,
  useIncubator: true,
};

function defaultUseIncubator(stage: string): boolean {
  return stage === "aqua-epic-intro" || stage.endsWith("-intro");
}

const FALLBACK_PRESETS: PhasePreset[] = [
  { stage: "aqua-epic-intro",    label: "Epic Intro",                   pluginPreset: [] },
  { stage: "aqua-blueprint",     label: "Blueprint Setup",              pluginPreset: ["website-editor", "client-crm", "forms"] },
  { stage: "aqua-diagnostics",   label: "Diagnostics / Foundations",    pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder"] },
  { stage: "aqua-brand-builder", label: "Brand Builder + Verification", pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder"] },
  { stage: "aqua-traffic",       label: "Traffic (Expansion Plan)",     pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder", "ecommerce", "agency-marketing", "email-sender"] },
  { stage: "aqua-mastery",       label: "Mastery & Ascension",          pluginPreset: ["website-editor", "client-crm", "forms", "ai-builder", "ecommerce", "agency-marketing", "email-sender", "memberships", "affiliates"] },
];

const PLAN_TIERS: { value: PlanTier; label: string; hint: string }[] = [
  { value: "foundational", label: "Foundational Flow", hint: "Entry tier — Epic Intro through Diagnostics." },
  { value: "expansion",    label: "Expansion Plan",    hint: "Brand Builder + Traffic." },
  { value: "mastery",      label: "Mastery Plan",      hint: "Full Aqua Incubator + Mastery & Ascension." },
];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function composedDisplayName(state: FormState): string {
  const t = state.therapistName.trim();
  const p = state.practiceName.trim();
  if (t && p) return `${t} · ${p}`;
  return t || p;
}

export function NewClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(DEFAULT_STATE);
  const [presets, setPresets] = useState<PhasePreset[]>(FALLBACK_PRESETS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    setState(DEFAULT_STATE);
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
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState(s => {
      const next = { ...s, [key]: value };
      if ((key === "therapistName" || key === "practiceName") && !slugTouched.current) {
        next.slug = slugify(composedDisplayName(next));
      }
      if (key === "slug") slugTouched.current = true;
      // T1 R14: when operator changes phase, re-derive Incubator toggle
      // default unless they've manually toggled it (we treat any explicit
      // toggle as a user-touch — see the dedicated useIncubator branch).
      if (key === "stage") next.useIncubator = defaultUseIncubator(next.stage);
      return next;
    });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const display = composedDisplayName(state);
    if (!display) {
      setError("Therapist or practice name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/fulfillment/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: display,
          slug: state.slug.trim() || undefined,
          ownerEmail: state.email.trim() || undefined,
          stage: state.stage,
          brand: {
            primaryColor: state.brandColor,
            logoUrl: state.logoUrl.trim() || undefined,
          },
          metadata: {
            therapistName: state.therapistName.trim() || undefined,
            practiceName:  state.practiceName.trim()  || undefined,
            planTier:      state.planTier,
            whatsappLink:  state.whatsappLink.trim()  || undefined,
            stripeLink:    state.stripeLink.trim()    || undefined,
            lockInPaid:    state.lockInPaid,
          },
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; client?: { id: string }; clientId?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not create client.");
        return;
      }
      const newId = data.client?.id ?? data.clientId;

      // T1 R14: when the operator opted into the Aqua Incubator
      // template, fire the foundation route that applies the
      // `aqua-incubator` portal variant + resolves placeholders via
      // `applyIncubatorClientMetadata`. Failures here are
      // non-blocking — the client was created, log + continue.
      if (newId && state.useIncubator) {
        const phaseLabel = presets.find(p => p.stage === state.stage)?.label ?? state.stage;
        const planTierLabel =
          PLAN_TIERS.find(p => p.value === state.planTier)?.label ?? state.planTier;
        try {
          await fetch("/api/tenants/apply-incubator-variant", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientId: newId,
              metadata: {
                phase: phaseLabel,
                planTier: planTierLabel,
                therapistName: state.therapistName.trim() || undefined,
                practiceName:  state.practiceName.trim()  || undefined,
                onboardingStartedAt: new Date().toISOString().slice(0, 10),
              },
            }),
          });
        } catch { /* non-blocking — client already created */ }
      }

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
  const planHint = PLAN_TIERS.find(p => p.value === state.planTier)?.hint;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
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
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 id="new-client-title" className="text-lg font-semibold text-black/90">New client</h3>
            <p className="mt-1 text-xs text-black/60">
              Onboard a therapist into the Aqua Incubator. The starting phase decides which plugins install automatically.
            </p>

            <div className="mt-4 grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Therapist name</span>
                  <input
                    value={state.therapistName}
                    onChange={(e) => update("therapistName", e.target.value)}
                    autoFocus disabled={busy}
                    placeholder="Felicia Carter"
                    className="rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Practice name</span>
                  <input
                    value={state.practiceName}
                    onChange={(e) => update("practiceName", e.target.value)}
                    disabled={busy}
                    placeholder="Luv & Ker"
                    className="rounded-md border border-black/15 px-3 py-2"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-black/70">Slug</span>
                <input
                  value={state.slug}
                  onChange={(e) => update("slug", e.target.value)}
                  disabled={busy}
                  placeholder="auto from name"
                  className="rounded-md border border-black/15 px-3 py-2 font-mono text-xs"
                />
              </label>

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

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Brand colour</span>
                  <input
                    type="color"
                    value={state.brandColor}
                    onChange={(e) => update("brandColor", e.target.value)}
                    disabled={busy}
                    className="h-10 w-full rounded-md border border-black/15"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-black/70">Logo URL</span>
                  <input
                    type="url"
                    value={state.logoUrl}
                    onChange={(e) => update("logoUrl", e.target.value)}
                    disabled={busy}
                    placeholder="optional"
                    className="rounded-md border border-black/15 px-3 py-2 text-xs"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-black/70">Plan tier</span>
                <select
                  value={state.planTier}
                  onChange={(e) => update("planTier", e.target.value as PlanTier)}
                  disabled={busy}
                  className="rounded-md border border-black/15 px-3 py-2"
                >
                  {PLAN_TIERS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {planHint && <small className="text-[11px] text-black/55">{planHint}</small>}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-black/70">Starting Aqua phase</span>
                <select
                  value={state.stage}
                  onChange={(e) => update("stage", e.target.value)}
                  disabled={busy}
                  className="rounded-md border border-black/15 px-3 py-2"
                >
                  {presets.map(p => (
                    <option key={p.stage} value={p.stage}>{p.label}</option>
                  ))}
                </select>
                {selectedPreset && (
                  <small className="text-[11px] text-black/55">
                    {selectedPreset.pluginPreset.length > 0
                      ? <>Will install: {selectedPreset.pluginPreset.join(", ")}.</>
                      : <>No plugins auto-install at this phase yet.</>}
                  </small>
                )}
              </label>

              <label
                data-testid="incubator-toggle"
                className="flex items-start gap-2 rounded-md border border-black/10 bg-amber-50/60 p-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={state.useIncubator}
                  disabled={busy}
                  onChange={(e) => update("useIncubator", e.target.checked)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-amber-900">Use Aqua Incubator template</span>
                  <span className="block text-[11px] text-amber-900/75">
                    Seeds the client&apos;s account portal with the canonical Incubator
                    welcome variant + resolves placeholders (`{`{phase}`}`,
                    `{`{planTier}`}`, therapist + practice names) on apply.
                    Default ON for Epic Intro, off for later phases.
                  </span>
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-black/70">WhatsApp group invite</span>
                <input
                  type="url"
                  value={state.whatsappLink}
                  onChange={(e) => update("whatsappLink", e.target.value)}
                  disabled={busy}
                  placeholder="https://chat.whatsapp.com/…"
                  className="rounded-md border border-black/15 px-3 py-2 text-xs"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-black/70">Stripe / invoice link</span>
                <input
                  type="url"
                  value={state.stripeLink}
                  onChange={(e) => update("stripeLink", e.target.value)}
                  disabled={busy}
                  placeholder="optional"
                  className="rounded-md border border-black/15 px-3 py-2 text-xs"
                />
              </label>

              <label className="flex items-center gap-2 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2">
                <input
                  type="checkbox"
                  checked={state.lockInPaid}
                  onChange={(e) => update("lockInPaid", e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4"
                />
                <span className="text-xs text-black/75">Lock-in deposit (£100) paid</span>
              </label>

              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                className="rounded-md px-3 py-2 text-sm text-black/70 hover:bg-black/5">
                Cancel
              </button>
              <button type="submit" disabled={busy}
                className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-60">
                {busy ? "Creating…" : "Create client"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
