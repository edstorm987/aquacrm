"use client";

// Onboarding Dashboard — chapter §12 deferred port from old portal's
// `OnboardingDashboardView`. Six-chip horizontal phase strip on the
// per-client Overview tab (only when the client is on an Aqua phase).
// Click a chip → expands its deliverables checklist; ticking a milestone
// POSTs `/api/tenants/onboarding-tick`. The active phase chip carries an
// "advance →" button gated on `allComplete` that calls fulfillment's
// existing `phase/advance` endpoint.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PhaseRow {
  id: string;        // foundation phase definition id (per-agency)
  stage: string;     // ClientStage enum
  label: string;
  order: number;
}

interface MilestoneRow {
  id: string;
  label: string;
  done: boolean;
}

export interface OnboardingPhase extends PhaseRow {
  state: "complete" | "active" | "future";
  milestones: MilestoneRow[];
  allComplete: boolean;
}

export function OnboardingDashboardPanel({
  clientId,
  phases,
  currentStage,
}: {
  clientId: string;
  phases: OnboardingPhase[];
  currentStage: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string>(currentStage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function tick(phaseStage: string, milestoneId: string, done: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/onboarding-tick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, phaseStage, milestoneId, done }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Tick failed.");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function advance(from: PhaseRow, to: PhaseRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/fulfillment/phase/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, fromPhaseId: from.id, toPhaseId: to.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Advance failed.");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const expanded = phases.find(p => p.stage === open) ?? null;
  const currentIdx = phases.findIndex(p => p.stage === currentStage);
  const nextPhase = currentIdx >= 0 ? phases[currentIdx + 1] : null;
  const currentPhase = currentIdx >= 0 ? phases[currentIdx] : null;

  return (
    <section
      data-testid="onboarding-dashboard"
      aria-labelledby="onboarding-title"
      className="rounded-xl border border-black/10 bg-white p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="onboarding-title" className="text-sm font-medium uppercase tracking-wide text-black/55">
          Onboarding journey
        </h2>
        <span className="text-[11px] text-black/45">Aqua Incubator · Epic Intro → Mastery</span>
      </header>

      <ol className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-6">
        {phases.map(p => {
          const isOpen = p.stage === open;
          const palette =
            p.state === "complete" ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : p.state === "active" ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-black/90 font-semibold"
            : "border-black/10 bg-white text-black/45";
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={isOpen}
                onClick={() => setOpen(p.stage)}
                className={`flex w-full flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-black/[0.02] ${palette}`}
              >
                <span className="flex w-full items-center justify-between gap-1">
                  <span className="truncate">{p.label}</span>
                  {p.state === "complete" && <span aria-hidden="true">✓</span>}
                </span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {p.milestones.filter(m => m.done).length}/{p.milestones.length}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {expanded && (
        <div className="mt-4 rounded-md border border-black/10 bg-black/[0.02] p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-black/85">{expanded.label} — deliverables</h3>
            {expanded.stage === currentStage && nextPhase && currentPhase && (
              <button
                type="button"
                disabled={!expanded.allComplete || busy}
                onClick={() => advance(currentPhase, nextPhase)}
                className="rounded-md bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-40"
                title={expanded.allComplete ? "Advance to next phase" : "Tick all deliverables to advance"}
              >
                Mark phase complete → advance
              </button>
            )}
          </div>
          {expanded.milestones.length === 0 ? (
            <p className="mt-2 text-xs text-black/55">No milestones for this phase.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {expanded.milestones.map(m => (
                <li key={m.id}>
                  <label className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-black/85 hover:bg-black/[0.02]">
                    <input
                      type="checkbox"
                      checked={m.done}
                      disabled={busy}
                      onChange={e => tick(expanded.stage, m.id, e.target.checked)}
                    />
                    <span className={m.done ? "line-through opacity-60" : ""}>{m.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
        </div>
      )}
    </section>
  );
}
