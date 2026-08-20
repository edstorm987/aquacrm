"use client";

import { useState } from "react";
import { Plug, X } from "lucide-react";

import { formatUkDate } from "@/lib/formatDateTime";

/**
 * The software a customer has connected to their portal, and the way out.
 *
 * The connect screen tells them "you can disconnect at any time"; this is
 * where they do it. Kept plain and reassuring — disconnecting is theirs to
 * choose, and the copy says exactly what it does rather than warning them off
 * it.
 */

export interface ConnectedApp {
  id: string;
  label: string;
  connectedAt?: number;
}

export function ConnectedApps({ initial, accentName }: { initial: ConnectedApp[]; accentName: string }) {
  const [apps, setApps] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnect(app: ConnectedApp) {
    setBusy(app.id);
    setError(null);
    try {
      const response = await fetch("/api/portal/customer/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: app.id }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; disconnectedId?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "That could not be disconnected.");
      setApps(current => current.filter(entry => entry.id !== app.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be disconnected.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5 rounded-md border border-black/10 bg-[#fbfaf8] p-6 sm:p-8">
      <div className="flex items-center gap-3 border-b border-black/10 pb-5">
        <Plug size={18} className="text-[var(--portal-accent)]" aria-hidden />
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Connected apps</p>
          <h2 className="mt-1 font-serif text-2xl">Software linked to your portal</h2>
        </div>
      </div>

      {apps.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-black/52">
          Nothing is connected right now. When you link one of your own apps to your {accentName} portal,
          it appears here — and you can disconnect it whenever you like.
        </p>
      ) : (
        <ul className="mt-5 grid gap-2.5">
          {apps.map(app => (
            <li key={app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-medium text-black/80">{app.label}</p>
                <p className="text-xs text-black/45">
                  {app.connectedAt
                    ? `Connected ${formatUkDate(app.connectedAt, { day: "numeric", month: "short", year: "numeric" })}`
                    : "Connected"}
                  {" · opens your portal without signing in again"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === app.id}
                onClick={() => void disconnect(app)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 text-xs font-medium text-black/65 hover:bg-black/[0.03] disabled:opacity-45"
              >
                <X size={13} aria-hidden />
                {busy === app.id ? "Disconnecting…" : "Disconnect"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    </section>
  );
}
