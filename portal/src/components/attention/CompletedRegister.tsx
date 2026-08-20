"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";

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

  const load = useCallback(() => {
    fetch("/api/portal/attention/completed", { cache: "no-store" })
      .then(response => response.json())
      .then((payload: { completed?: CompletedAction[] }) => {
        setEntries(payload.completed ?? []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    setRemoving(id);
    try {
      const response = await fetch(`/api/portal/attention/completed?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json() as { ok: boolean; completed?: CompletedAction[] };
      // Only drop it locally once the server confirms, so a failed delete does
      // not look like success and reappear on the next load.
      if (payload.ok) setEntries(payload.completed ?? []);
    } finally {
      setRemoving(null);
    }
  }

  if (state === "loading") {
    return (
      <p className="flex items-center gap-2 px-4 py-6 text-sm text-black/45">
        <LoaderCircle size={14} className="animate-spin" aria-hidden />Loading what you have finished…
      </p>
    );
  }

  if (state === "error") {
    return <p className="px-4 py-6 text-sm text-red-700">The completed register could not be loaded.</p>;
  }

  if (!entries.length) {
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
            disabled={removing === entry.id}
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
  );
}
