"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import {
  completedActionDeleteOperationId,
  completedActionsFromDeletePayload,
  readCompletedActions,
} from "@/lib/inbox/completedActionRead";
import type { CompletedAction } from "@/server/types";

const OUTCOME_LABELS: Record<CompletedAction["outcome"], string> = {
  resolved: "Resolved",
  accepted: "Accepted as work",
  dismissed: "Judged not worth acting on",
  "not-applicable": "Not applicable",
};

/**
 * What you have actually finished.
 *
 * Resolving something used to leave no trace — the alert stopped firing and
 * that was that. So "did I already deal with this?" had no answer, and a day's
 * work left nothing to look back on.
 *
 * Dismissals appear here alongside completions on purpose: deciding something
 * is not worth acting on IS a decision, and a register that only shows the
 * things you said yes to misrepresents how the time was spent.
 */
export function CompletedRegister() {
  const [entries, setEntries] = useState<CompletedAction[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null);
  const removeInFlightRef = useRef(false);
  const deleteOperationsRef = useRef(new Map<string, string>());

  const load = useCallback(() => {
    setState("loading");
    void readCompletedActions().then(read => {
      if (read.available) {
        setEntries(read.data);
        setState("ready");
      } else {
        // Keep the last confirmed entries. A refused refresh is not an empty
        // completed-work register and must not replace one with `[]`.
        setState("error");
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    // The ref closes the same-render double-click gap before React has painted
    // the disabled state. Serialising deletes means an older whole-register
    // response can never arrive after a newer one and resurrect a removed row.
    const isRetryingAmbiguousDelete = state === "error" && removeError?.id === id;
    if ((!isRetryingAmbiguousDelete && state !== "ready") || removeInFlightRef.current) return;
    removeInFlightRef.current = true;
    const operationId = deleteOperationsRef.current.get(id)
      ?? completedActionDeleteOperationId(id);
    deleteOperationsRef.current.set(id, operationId);
    setRemoving(id);
    if (!isRetryingAmbiguousDelete) setRemoveError(null);
    try {
      const response = await fetch(
        `/api/portal/attention/completed?id=${encodeURIComponent(id)}&operationId=${encodeURIComponent(operationId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json() as { ok?: boolean; operationId?: unknown; completed?: unknown; error?: string };
      // Only drop it locally once the server confirms, so a failed delete does
      // not look like success and reappear on the next load.
      const completed = completedActionsFromDeletePayload(payload, operationId);
      if (!response.ok || !completed) {
        throw new Error(payload.error || "The register entry could not be removed.");
      }
      setEntries(completed);
      setState("ready");
      setRemoveError(null);
      deleteOperationsRef.current.delete(id);
    } catch (error) {
      // The server may have committed before the acknowledgement was lost.
      // Lock all writes and repeat this exact operation. A deterministic replay
      // both confirms the current list and retries the durability flush.
      setState("error");
      setRemoveError({
        id,
        message: `${error instanceof Error ? error.message : "The register entry could not be removed."} Retry the same removal to confirm its durable result before changing the register again.`,
      });
    } finally {
      removeInFlightRef.current = false;
      setRemoving(null);
    }
  }

  if (state === "loading" && !entries.length) {
    return (
      <p className="flex items-center gap-2 px-4 py-6 text-sm text-black/45">
        <LoaderCircle size={14} className="animate-spin" aria-hidden />Loading what you have finished…
      </p>
    );
  }

  if (state === "error" && !entries.length) {
    return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-red-700">
      <span>The completed register could not be read. No empty-history conclusion has been made.</span>
      <button type="button" onClick={load} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold hover:bg-red-100">
        <RefreshCw size={13} aria-hidden /> Retry history
      </button>
    </div>;
  }

  if (state === "ready" && !entries.length) {
    return (
      <div className="px-4 py-10 text-center">
        <CheckCircle2 className="mx-auto text-emerald-600" size={22} aria-hidden />
        <p className="mt-2 text-sm font-semibold text-black/70">Nothing finished yet</p>
        <p className="mt-1 text-xs text-black/45">
          Resolved alerts, completed tasks and anything you judged not worth acting on collect here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {state !== "ready" ? <div role="status" className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-xs ${state === "error" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-black/10 bg-black/[0.02] text-black/55"}`}>
        <span>{removeError ? removeError.message : state === "error" ? "Completed history is unavailable. The last confirmed entries remain below and may be stale; changes are locked." : "Refreshing completed history. The last confirmed entries remain visible until the read answers."}</span>
        {state === "error" ? removeError
          ? <button type="button" disabled={removing !== null} onClick={() => void remove(removeError.id)} className="inline-flex min-h-8 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100 disabled:opacity-50"><RefreshCw size={12} className={removing ? "animate-spin" : undefined} aria-hidden /> Retry removal</button>
          : <button type="button" onClick={load} className="inline-flex min-h-8 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={12} aria-hidden /> Retry history</button>
          : null}
      </div> : null}
      <ol className="divide-y divide-black/[0.07]" data-testid="completed-register">
      {entries.map(entry => (
        <li key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <CheckCircle2
            size={16}
            aria-hidden
            className={`mt-0.5 shrink-0 ${entry.outcome === "dismissed" ? "text-black/25" : "text-emerald-600"}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-black/80">{entry.title}</strong>
              <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/50">
                {OUTCOME_LABELS[entry.outcome]}
              </span>
              {entry.origin ? (
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium capitalize text-black/50">
                  {entry.origin}
                </span>
              ) : null}
            </span>
            {entry.detail ? (
              <span className="mt-0.5 block truncate text-xs text-black/45">{entry.detail}</span>
            ) : null}
            <span className="mt-0.5 block text-[11px] text-black/40">
              {new Date(entry.completedAt).toLocaleString("en-GB", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </span>
          <button
            type="button"
            disabled={state !== "ready" || removing !== null}
            onClick={() => void remove(entry.id)}
            aria-label={`Remove ${entry.title} from the register`}
            title="Remove from the register"
            className="shrink-0 rounded-md p-1.5 text-black/30 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
          >
            {removing === entry.id
              ? <LoaderCircle size={14} className="animate-spin" aria-hidden />
              : <Trash2 size={14} aria-hidden />}
          </button>
        </li>
      ))}
      </ol>
    </div>
  );
}
