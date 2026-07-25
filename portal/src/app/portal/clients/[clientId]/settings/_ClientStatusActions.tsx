"use client";

import { useState } from "react";

interface ClientStatusActionsProps {
  clientId: string;
  status: "active" | "suspended" | "archived";
}

export function ClientStatusActions({ clientId, status }: ClientStatusActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = status === "archived";

  async function submit(nextStatus: "active" | "archived") {
    const confirmed = nextStatus === "archived"
      ? window.confirm("Archive this client? They will be hidden from the main client list.")
      : true;
    if (!confirmed) return;

    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-black/85">Client status</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-black/60">
            Archive a client when the work is finished, cancelled, or no longer needs to sit in the live workspace.
          </p>
        </div>
        {archived ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("active")}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Reactivating..." : "Reactivate client"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("archived")}
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Archiving..." : "Archive client"}
          </button>
        )}
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
