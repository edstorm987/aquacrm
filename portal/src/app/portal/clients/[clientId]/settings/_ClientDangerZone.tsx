"use client";

import { useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";

/**
 * Permanent deletion of a client and all its data.
 *
 * Kept apart, styled as a hazard, and gated behind typing the client's exact
 * name — because this is the one action in the app with no undo. For a data
 * erasure request that finality is the requirement, not a flaw, so the screen
 * is honest about it rather than softening it.
 */
export function ClientDangerZone({ clientId, clientName, recordCount }: {
  clientId: string;
  clientName: string;
  /** How many records the erasure will remove, shown so it is not a leap in the dark. */
  recordCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal/clients/${encodeURIComponent(clientId)}/erase`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; recordsErased?: number };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "That could not be deleted.");
      // The client no longer exists — there is nowhere on this page to return
      // to, so leave for the client list.
      window.location.href = "/portal/clients";
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be deleted.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-red-100 text-red-700">
          <ShieldAlert size={17} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-red-900">Delete permanently</h2>
          <p className="mt-1 text-sm leading-6 text-red-900/70">
            Erase <strong className="font-semibold">{clientName}</strong> and all of its data —
            records, portal, files, enquiries, everything ({recordCount} records). This is for a data-erasure
            request or a record that must be removed for good. <strong className="font-semibold">It cannot be
            undone,</strong> and the data cannot be recovered.
          </p>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex min-h-10 items-center rounded-md border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Delete this client permanently
            </button>
          ) : (
            <div className="mt-4 grid gap-2">
              <label htmlFor="confirm-erase" className="text-sm font-medium text-red-900/80">
                Type <strong className="font-semibold">{clientName}</strong> to confirm.
              </label>
              <input
                id="confirm-erase"
                value={confirmName}
                onChange={event => setConfirmName(event.target.value)}
                autoComplete="off"
                autoFocus
                className="w-full rounded-md border border-red-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500"
                placeholder={clientName}
              />
              {error ? <p role="alert" className="text-xs leading-5 text-red-700">{error}</p> : null}
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || confirmName.trim() !== clientName}
                  onClick={() => void erase()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40"
                >
                  {busy ? <><LoaderCircle size={14} className="animate-spin" aria-hidden />Erasing…</> : "Erase everything, permanently"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setOpen(false); setConfirmName(""); setError(null); }}
                  className="inline-flex min-h-10 items-center rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/65"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
