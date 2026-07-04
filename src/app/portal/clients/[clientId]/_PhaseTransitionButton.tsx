"use client";

// Phase transition button (T1 R12). Founder-facing operator control
// pinned in the per-client header. Surfaces:
//   - primary `Advance to {nextPhase} →` action,
//   - dropdown for `Regress to {prev}` and `Skip to: …`,
//   - confirm modal that previews the pluginPreset delta
//     (install / disable) before firing fulfillment's
//     `/phase/advance` endpoint. The fulfillment
//     `transitionService` does the heavy lifting under the hood
//     (disable old + enable new + activity log + archivedConfig).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Phase {
  id: string;        // PhaseDefinition.id (per-agency)
  stage: string;     // ClientStage enum
  label: string;
  order: number;
  pluginPreset: string[];
}

const AQUA_ORDER = [
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
];

export function PhaseTransitionButton({
  clientId,
  currentStage,
  isFounder,
}: {
  clientId: string;
  currentStage: string;
  isFounder: boolean;
}) {
  const router = useRouter();
  const [phases, setPhases] = useState<Phase[] | null>(null);
  const [target, setTarget] = useState<Phase | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!isFounder) return;
    let cancelled = false;
    fetch("/api/portal/fulfillment/phases", { method: "GET" })
      .then(r => r.ok ? r.json() as Promise<{ ok: boolean; phases?: Phase[] }> : null)
      .then(data => {
        if (cancelled || !data?.phases) return;
        const ordered = [...data.phases].sort((a, b) => {
          const ai = AQUA_ORDER.indexOf(a.stage);
          const bi = AQUA_ORDER.indexOf(b.stage);
          if (ai >= 0 && bi >= 0) return ai - bi;
          return a.order - b.order;
        });
        setPhases(ordered);
      })
      .catch(() => { /* fulfillment not available — degrade silently */ });
    return () => { cancelled = true; };
  }, [isFounder]);

  if (!isFounder) return null;

  const currentIdx = phases?.findIndex(p => p.stage === currentStage) ?? -1;
  const current = currentIdx >= 0 ? phases![currentIdx] : null;
  const next = currentIdx >= 0 && phases && currentIdx + 1 < phases.length ? phases[currentIdx + 1] : null;
  const prev = currentIdx > 0 ? phases![currentIdx - 1] : null;

  function diff(from: Phase, to: Phase) {
    const fromSet = new Set(from.pluginPreset);
    const toSet = new Set(to.pluginPreset);
    return {
      toInstall: to.pluginPreset.filter(p => !fromSet.has(p)),
      toDisable: from.pluginPreset.filter(p => !toSet.has(p)),
    };
  }

  async function commit() {
    if (!current || !target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/fulfillment/phase/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, fromPhaseId: current.id, toPhaseId: target.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Phase transition failed.");
        return;
      }
      setTarget(null);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (!phases || phases.length === 0 || !current) {
    return null;
  }

  const delta = target ? diff(current, target) : null;
  const direction = target ? (target.order > current.order ? "Advance" : "Regress") : "";

  return (
    <div data-testid="phase-transition-button" className="relative inline-flex items-center gap-1">
      {next && (
        <button
          type="button"
          onClick={() => setTarget(next)}
          disabled={busy}
          className="rounded-md bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
        >
          Advance to {next.label} →
        </button>
      )}
      <button
        type="button"
        onClick={() => setMenuOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy}
        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50"
      >
        ▾
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-black/10 bg-white p-1 shadow-lg"
        >
          {prev && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setTarget(prev); }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-black/85 hover:bg-black/5"
            >
              ← Regress to {prev.label}
            </button>
          )}
          <div className="mt-1 border-t border-black/10 pt-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Skip to</div>
            {phases.filter(p => p.stage !== currentStage).map(p => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setTarget(p); }}
                className="block w-full rounded-md px-2 py-1 text-left text-xs text-black/75 hover:bg-black/5"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {target && delta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="phase-transition-title"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
          onClick={e => { if (e.target === e.currentTarget && !busy) setTarget(null); }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <header className="flex items-baseline justify-between border-b border-black/10 px-5 py-4">
              <h2 id="phase-transition-title" className="text-lg font-semibold text-black/90">
                {direction}: {current.label} → {target.label}
              </h2>
              <button
                type="button"
                onClick={() => { if (!busy) setTarget(null); }}
                className="text-xs text-black/55 hover:text-black/90"
              >
                Close
              </button>
            </header>
            <div className="flex flex-col gap-4 px-5 py-4 text-sm">
              <p className="text-xs text-black/55">
                Fulfillment&apos;s transitionService will apply these changes. Disabled plugin
                installs keep their config (reversible). Activity log entry will be written.
              </p>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Will install / enable ({delta.toInstall.length})
                </h3>
                {delta.toInstall.length === 0 ? (
                  <p className="mt-1 text-xs text-black/45">None.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1 text-xs">
                    {delta.toInstall.map(p => (
                      <li key={p} className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-emerald-800">{p}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Will disable ({delta.toDisable.length})
                </h3>
                {delta.toDisable.length === 0 ? (
                  <p className="mt-1 text-xs text-black/45">None.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1 text-xs">
                    {delta.toDisable.map(p => (
                      <li key={p} className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-amber-900">{p}</li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-black/10 bg-black/[0.02] px-5 py-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!busy) setTarget(null); }}
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={busy}
                className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Transitioning…" : `Confirm ${direction.toLowerCase()}`}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
