"use client";

// Portal preparation modal. Shown on the per-client header once the
// client has an assigned service and
// `04-the-final-portal/clients/<slug>/` does NOT yet exist on disk.
//
// Walks the operator through:
//   1. Plugin checklist — pre-checked = currently installed (recommended
//      adds an extra hint chip); uncheck to omit, check additional ones.
//   2. Base template — luv-and-ker / compass / blank starter / one of the
//      portal-export presets (skincare-brand / membership-only / ...).
//   3. Slug confirm.
//
// Submit POSTs to `/api/portal/portal-export/clients/export` (the
// portal-export plugin's run endpoint — the prompt's `materialize` alias
// maps to this path; see plugin's ROUTES). Response is the materialized
// ExportRecord; we re-render the page so the CTA flips to
// "Open custom portal".

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

export interface WizardPlugin {
  id: string;
  name: string;
  description?: string;
  installed: boolean;
  recommended: boolean;
}

interface PresetOption {
  id: string;          // empty string = blank starter (no preset)
  label: string;
  description: string;
}

const STATIC_TEMPLATES: PresetOption[] = [
  { id: "",             label: "Blank starter",  description: "Create a simple production-ready starter for the client." },
  { id: "luv-and-ker",  label: "Luv & Ker",       description: "Use the skincare brand structure as a starting point." },
  { id: "compass",      label: "Compass Coaching", description: "Use the service-business portal structure as a starting point." },
];

export function BuildPortalWizard({
  clientId,
  clientName,
  slug,
  plugins,
}: {
  clientId: string;
  clientName: string;
  slug: string;
  plugins: WizardPlugin[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Modal keyboard contract: focus enters the wizard, Tab stays inside it, Escape backs out (except mid-build), focus returns to the Build custom portal button.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: submitting ? undefined : () => setOpen(false) });
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [confirmedSlug, setConfirmedSlug] = useState(slug);
  const [presetId, setPresetId] = useState<string>("");
  const [presetOptions, setPresetOptions] = useState<PresetOption[]>(STATIC_TEMPLATES);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of plugins) init[p.id] = p.installed || p.recommended;
    return init;
  });
  const [, startTransition] = useTransition();

  // Pull the portal-export plugin's preset list when the modal opens, and
  // merge them onto the static-template list. The plugin may not be
  // installed yet (returns 404) — when that happens we silently fall
  // back to the three static templates.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/portal/portal-export/presets", { method: "GET" })
      .then(r => r.ok ? r.json() as Promise<{ ok: boolean; presets?: { id: string; label: string; description: string }[] }> : null)
      .then(data => {
        if (cancelled || !data?.presets) return;
        setPresetOptions([
          ...STATIC_TEMPLATES,
          ...data.presets.map(p => ({ id: p.id, label: p.label, description: p.description })),
        ]);
      })
      .catch(() => { /* preset list is optional */ });
    return () => { cancelled = true; };
  }, [open]);

  const checkedIds = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);

  async function handleSubmit() {
    setError(null);
    if (!confirmedSlug.trim()) {
      setError("Slug is required.");
      return;
    }
    setSubmitting(true);
    setPhase("running");
    try {
      // v1: synchronous run. portal-export's runExportHandler returns the
      // full ExportRecord in one response; no streaming needed.
      const res = await fetch("/api/portal/portal-export/clients/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          options: {
            presetId: presetId || undefined,
            destinationOverride: confirmedSlug !== slug ? `clients/${confirmedSlug}/` : undefined,
            // installedPlugins from the wizard is informational v1 — the
            // plugin computes the install list itself from foundation
            // state. We pass it along so future versions can honour it.
            installedPluginsHint: checkedIds,
          },
        }),
      });
      const data = await res.json() as {
        ok: boolean;
        record?: { status: string; errorMessage?: string };
        error?: string;
      };
      if (!data.ok) {
        setError(data.error ?? data.record?.errorMessage ?? "Export failed.");
        setPhase("idle");
        return;
      }
      setPhase("done");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600"
      >
        Build custom portal
      </button>

      {open && (
        <div
          role="dialog"
          ref={dialogRef} aria-modal="true"
          aria-labelledby="bpw-title"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
          onClick={e => { if (e.target === e.currentTarget && !submitting) setOpen(false); }}
        >
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <header className="flex items-baseline justify-between border-b border-black/10 px-5 py-4">
              <div>
                <h2 id="bpw-title" className="text-lg font-semibold text-black/90">
                  Build custom portal
                </h2>
                <p className="text-xs text-black/55">
                  Creates a separate client portal workspace for {clientName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!submitting) setOpen(false); }}
                className="text-xs text-black/55 hover:text-black/90"
              >
                Close
              </button>
            </header>

            <div className="flex flex-col gap-5 px-5 py-4">
              {phase === "done" ? (
                <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  Custom portal created. Refreshing the client overview.
                </div>
              ) : (
                <>
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-black/55">
                      Systems
                    </h3>
                    <p className="mt-1 text-xs text-black/55">
                      Pre-checked systems are already active. Recommended items are useful for live client work.
                    </p>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                      {plugins.map(p => (
                        <li key={p.id}>
                          <label className="flex items-start gap-2 rounded-md border border-black/10 px-2 py-1.5 text-sm hover:bg-black/[0.02]">
                            <input
                              type="checkbox"
                              checked={!!selected[p.id]}
                              disabled={submitting}
                              onChange={e => setSelected(prev => ({ ...prev, [p.id]: e.target.checked }))}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-black/90">{p.name}</span>
                                {p.installed && (
                                  <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9px] uppercase tracking-wide text-emerald-800">
                                    active
                                  </span>
                                )}
                                {p.recommended && (
                                  <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] uppercase tracking-wide text-amber-900">
                                    recommended
                                  </span>
                                )}
                              </span>
                              {p.description && (
                                <span className="block text-[11px] text-black/55">{p.description}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-black/55">
                      Base template
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1">
                      {presetOptions.map(opt => (
                        <li key={opt.id || "blank"}>
                          <label className="flex items-start gap-2 rounded-md border border-black/10 px-2 py-1.5 text-sm hover:bg-black/[0.02]">
                            <input
                              type="radio"
                              name="bpw-preset"
                              value={opt.id}
                              checked={presetId === opt.id}
                              disabled={submitting}
                              onChange={() => setPresetId(opt.id)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-black/90">{opt.label}</span>
                              {opt.description && (
                                <span className="block text-[11px] text-black/55">{opt.description}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-black/55">
                        Slug
                      </span>
                      <input
                        type="text"
                        value={confirmedSlug}
                        disabled={submitting}
                        onChange={e => setConfirmedSlug(e.target.value)}
                        className="rounded-md border border-black/15 px-2 py-1.5 font-mono text-sm"
                      />
                      <span className="text-[11px] text-black/55">
                        This becomes the client&apos;s separate production workspace.
                      </span>
                    </label>
                  </section>

                  {error && (
                    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </p>
                  )}
                </>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => { if (!submitting) setOpen(false); }}
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50"
              >
                Cancel
              </button>
              {phase !== "done" && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
                >
                  {phase === "running" ? "Building…" : "Build portal"}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
