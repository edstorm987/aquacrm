"use client";

import { useState } from "react";

interface ClientStatusActionsProps {
  clientId: string;
  status: "active" | "suspended" | "archived";
}

export function ClientStatusActions({ clientId, status }: ClientStatusActionsProps) {
  const [busy, setBusy] = useState<"active" | "suspended" | "archived" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const archived = status === "archived";
  const paused = status === "suspended";

  async function submit(nextStatus: "active" | "suspended" | "archived") {
    const confirmed = nextStatus === "archived"
      ? window.confirm("Archive this client? They will be hidden from the main client list.")
      : nextStatus === "suspended"
        ? window.confirm("Pause this client? Their record and portal will stay available, while active work and reminders are held.")
      : true;
    if (!confirmed) return;

    setBusy(nextStatus);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, status: nextStatus }),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Could not update client status.");
      }
      window.location.href = nextStatus === "archived" ? "/portal/clients" : `/portal/clients/${clientId}/settings`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update client status.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-black/85">Client status</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-black/60">
            Pause active work without losing the client&apos;s history or portal. Archive only when the relationship is finished.
          </p>
        </div>
        {archived ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => submit("active")}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "active" ? "Reactivating..." : "Reactivate client"}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {paused ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => submit("active")}
                className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "active" ? "Resuming..." : "Resume client"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => submit("suspended")}
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "suspended" ? "Pausing..." : "Pause client"}
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => submit("archived")}
              className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "archived" ? "Archiving..." : "Archive client"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
