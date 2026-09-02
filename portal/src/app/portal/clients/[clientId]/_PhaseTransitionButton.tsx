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

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPhaseTransitionOperationId,
  phaseTransitionFailureMessage,
} from "@/built-ins/modules/fulfillment/src/lib/transitionFeedback";
import {
  isFulfillmentPhaseTransition,
  isFulfillmentPhaseTransitionFailure,
} from "@/built-ins/modules/fulfillment/src/lib/mutationPayloads";
import {
  readFulfillmentPhases,
  resolveFulfillmentPhaseTarget,
  type FulfillmentPhase as Phase,
} from "@/lib/clients/fulfillmentPhaseRead";
import { useMenuKeys } from "@/lib/a11y/useMenuKeys";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";
import {
  CheckedMutationError,
  checkedJsonMutation,
  mutationErrorMessage,
} from "@/lib/client/checkedMutation";

const AQUA_ORDER = [
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
];

const PHASE_LABELS: Record<string, string> = {
  "aqua-epic-intro": "Onboarding",
  "aqua-blueprint": "Planning",
  "aqua-diagnostics": "Content & foundations",
  "aqua-brand-builder": "Design",
  "aqua-traffic": "Build & launch",
  "aqua-mastery": "Live care",
};

function displayLabel(phase: Phase): string {
  return PHASE_LABELS[phase.stage] ?? phase.label;
}

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
  const [targetId, setTargetId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [phaseReadState, setPhaseReadState] = useState<"loading" | "ready" | "error">("loading");
  const [phaseReloadToken, setPhaseReloadToken] = useState(0);
  const [, startTransition] = useTransition();
  const operationIdRef = useRef<string | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  useMenuKeys(menuWrapRef, { open: menuOpen, onOpen: () => setMenuOpen(true), onClose: () => setMenuOpen(false) });

  useEffect(() => {
    operationIdRef.current = null;
  }, [clientId, currentStage, targetId, reason]);

  useEffect(() => {
    if (!isFounder) return;
    let cancelled = false;
    setPhaseReadState("loading");
    setMenuOpen(false);
    void readFulfillmentPhases().then(read => {
      if (cancelled) return;
      if (!read.available) {
        // Do not erase the last confirmed phase catalogue. It remains visible
        // but locked until a retry proves it is still current.
        setPhaseReadState("error");
        return;
      }
      const ordered = [...read.data].sort((a, b) => {
          const ai = AQUA_ORDER.indexOf(a.stage);
          const bi = AQUA_ORDER.indexOf(b.stage);
          if (ai >= 0 && bi >= 0) return ai - bi;
          return a.order - b.order;
      });
      setPhases(ordered);
      setPhaseReadState("ready");
    });
    return () => { cancelled = true; };
  }, [isFounder, phaseReloadToken]);

  // Modal keyboard contract: focus enters the confirmation, Tab stays inside it,
  // Escape backs out, focus returns to the phase menu. Declared here with the
  // other hooks — `phases` arrives from a fetch, so the early returns below run
  // on the first render and not on later ones; a hook after them would change
  // the hook count between renders and crash the component.
  const dialogRef = useRef<HTMLDivElement>(null);
  const target = resolveFulfillmentPhaseTarget(phases, targetId);
  const confirmOpen = phaseReadState === "ready" && Boolean(target && phases?.some(phase => phase.stage === currentStage));
  // Escape backs out on exactly the terms the backdrop click already used:
  // refused while the advance POST is in flight, and it clears the typed reason
  // so a reopened dialog does not carry the abandoned one.
  useFocusTrap(dialogRef, confirmOpen, {
    onEscape: busy ? undefined : () => { setTargetId(null); setReason(""); },
  });

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
    if (phaseReadState !== "ready" || !current || !target) return;
    setBusy(true);
    setError(null);
    try {
      operationIdRef.current ??= createPhaseTransitionOperationId(clientId, current.id, target.id);
      const requestOperationId = operationIdRef.current;
      await checkedJsonMutation<unknown>("/api/portal/fulfillment/phase/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          fromPhaseId: current.id,
          toPhaseId: target.id,
          reason: reason.trim() || undefined,
          operationId: requestOperationId,
        }),
      }, {
        fallback: "Phase transition failed.",
        validate: payload => isFulfillmentPhaseTransition(payload, {
          operationId: requestOperationId,
          clientId,
          stage: target.stage,
        }),
      });
      operationIdRef.current = null;
      setTargetId(null);
      setReason("");
      startTransition(() => router.refresh());
    } catch (error) {
      setError(
        error instanceof CheckedMutationError
          && isFulfillmentPhaseTransitionFailure(error.payload)
          ? phaseTransitionFailureMessage(error.payload)
          : mutationErrorMessage(error, "Phase transition failed."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!phases || phases.length === 0 || !current) {
    const message = phaseReadState === "loading"
      ? "Loading lifecycle stages…"
      : phaseReadState === "error"
        ? "Lifecycle stages could not be read. Stage controls are locked; no empty catalogue has been assumed."
        : phases?.length === 0
          ? "No lifecycle stages are configured. Add one in Fulfilment settings before changing this client."
          : "This client's current stage is not present in the confirmed lifecycle catalogue.";
    return <div role={phaseReadState === "error" ? "alert" : "status"} className="flex flex-wrap items-center gap-2 text-xs text-black/55">
      <span>{message}</span>
      {phaseReadState === "error" ? <button type="button" onClick={() => setPhaseReloadToken(value => value + 1)} className="rounded-md border border-black/15 bg-white px-2.5 py-1 font-semibold text-black/70 hover:bg-black/5">Retry stages</button> : null}
    </div>;
  }

  const delta = target ? diff(current, target) : null;
  const direction = target ? (target.order > current.order ? "Advance" : "Regress") : "";
  const targetIdx = target ? phases.findIndex(phase => phase.id === target.id) : -1;
  const jumpDistance = targetIdx >= 0 ? Math.abs(targetIdx - currentIdx) : 0;
  const isDirectJump = jumpDistance > 1;
  const skippedCount = Math.max(0, jumpDistance - 1);

  const phaseCatalogueAvailable = phaseReadState === "ready";

  return (
    <div className="flex flex-col items-end gap-1">
      {!phaseCatalogueAvailable ? <div role={phaseReadState === "error" ? "alert" : "status"} className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-amber-800">
        <span>{phaseReadState === "error" ? "Lifecycle stages are unavailable. Last confirmed stages remain visible but locked." : "Refreshing lifecycle stages; stage changes are temporarily locked."}</span>
        {phaseReadState === "error" ? <button type="button" onClick={() => setPhaseReloadToken(value => value + 1)} className="rounded border border-amber-300 bg-white px-2 py-1 font-semibold hover:bg-amber-50">Retry stages</button> : null}
      </div> : null}
      <div ref={menuWrapRef} data-testid="phase-transition-button" className="relative inline-flex items-center gap-1">
      {next && (
        <button
          type="button"
          onClick={() => setTargetId(next.id)}
          disabled={busy || !phaseCatalogueAvailable}
          className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
        >
          Advance to {displayLabel(next)} →
        </button>
      )}
      <button
        type="button"
        onClick={() => setMenuOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy || !phaseCatalogueAvailable}
        className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50"
      >
        Change stage
      </button>
      {menuOpen && phaseCatalogueAvailable && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-black/10 bg-white p-1 shadow-lg"
        >
          {prev && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setTargetId(prev.id); }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-black/85 hover:bg-black/5"
            >
              ← Regress to {displayLabel(prev)}
            </button>
          )}
          <div className={prev ? "mt-1 border-t border-black/10 pt-1" : ""}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Move directly to</div>
            {phases.filter(p => p.stage !== currentStage).map(p => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setTargetId(p.id); }}
                className="block w-full rounded-md px-2 py-1 text-left text-xs text-black/75 hover:bg-black/5"
              >
                {displayLabel(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      {phaseCatalogueAvailable && target && delta && (
        <div
          role="dialog"
          ref={dialogRef} aria-modal="true"
          aria-labelledby="phase-transition-title"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
          onClick={e => {
            if (e.target === e.currentTarget && !busy) {
              setTargetId(null);
              setReason("");
            }
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <header className="flex items-baseline justify-between border-b border-black/10 px-5 py-4">
              <h2 id="phase-transition-title" className="text-lg font-semibold text-black/90">
                {isDirectJump ? "Jump stage" : direction}: {displayLabel(current)} → {displayLabel(target)}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!busy) {
                    setTargetId(null);
                    setReason("");
                  }
                }}
                className="text-xs text-black/55 hover:text-black/90"
              >
                Close
              </button>
            </header>
            <div className="flex flex-col gap-4 px-5 py-4 text-sm">
              {isDirectJump ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-900">
                  <p className="font-semibold">
                    This moves the client directly to {displayLabel(target)}.
                  </p>
                  <p className="mt-1 text-blue-800">
                    {skippedCount} {skippedCount === 1 ? "stage" : "stages"} will be bypassed. Their checklists will stay incomplete, so the record remains honest.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-black/55">
                  Moving stage updates the client workspace and records the change in activity.
                </p>
              )}
              <label className="grid gap-1.5 text-xs font-medium text-black/70">
                Reason <span className="font-normal text-black/40">(optional)</span>
                <textarea
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={isDirectJump ? "For example: Friend project; website already built." : "Add context for the team."}
                  className="w-full resize-none rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-normal text-black/85 outline-none placeholder:text-black/35 focus:border-black/35"
                />
              </label>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Will add / turn on ({delta.toInstall.length})
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
                  Will turn off ({delta.toDisable.length})
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
                disabled={busy || !phaseCatalogueAvailable}
                onClick={() => { if (!busy) { setTargetId(null); setReason(""); } }}
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={busy || !phaseCatalogueAvailable}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Moving…" : isDirectJump ? `Move directly to ${displayLabel(target)}` : `Confirm ${direction.toLowerCase()}`}
              </button>
            </footer>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
