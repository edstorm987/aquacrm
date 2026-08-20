"use client";

import { useEffect, useState } from "react";
import { Globe2, LoaderCircle, Plus, Trash2 } from "lucide-react";

/**
 * Which of this client's tagged sites route their submissions here.
 *
 * The client-side view of the routing registry: when you tag one of this
 * client's websites, register it here and its enquiries land on the client
 * rather than in the agency inbox. The destination is fixed to this client —
 * you are inside their workspace, so that is the only sensible answer, and it
 * saves a step versus the agency-wide picker.
 */

interface WebsiteSource {
  id: string;
  host: string;
  destinationClientId?: string;
}

export function ClientTagWorkspace({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [sources, setSources] = useState<WebsiteSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await (await fetch("/api/portal/website-sources")).json() as { ok: boolean; sources?: WebsiteSource[] };
        if (data.ok) setSources((data.sources ?? []).filter(source => source.destinationClientId === clientId));
      } catch { /* leave empty */ }
      finally { setLoading(false); }
    })();
  }, [clientId]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!host.trim()) { setError("Enter the website address."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", host, destinationClientId: clientId }),
      });
      const data = await response.json() as { ok: boolean; error?: string; source?: WebsiteSource };
      if (!response.ok || !data.ok || !data.source) throw new Error(data.error ?? "That could not be added.");
      setSources(current => [...current, data.source!].sort((a, b) => a.host.localeCompare(b.host)));
      setHost("");
    } catch (err) { setError(err instanceof Error ? err.message : "That could not be added."); }
    finally { setBusy(false); }
  }

  async function remove(source: WebsiteSource) {
    setError(null);
    setSources(current => current.filter(s => s.id !== source.id));
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", id: source.id }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setError("That could not be removed.");
      setSources(current => [...current, source].sort((a, b) => a.host.localeCompare(b.host)));
    }
  }

  return (
    <section className="rounded-md border border-black/10 bg-white p-4">
      <div className="flex items-start gap-3 border-b border-black/10 pb-3">
        <span className="grid size-9 place-items-center rounded-md bg-brand/10 text-brand"><Globe2 size={18} aria-hidden /></span>
        <div>
          <h2 className="text-sm font-semibold text-black/80">Tagged sites routing to {clientName}</h2>
          <p className="mt-1 text-xs leading-5 text-black/50">
            Install the Aqua tag above, then register {clientName}&rsquo;s sites here so their form
            submissions route to them — not the agency inbox.
          </p>
        </div>
      </div>

      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input
          value={host}
          onChange={event => setHost(event.target.value)}
          placeholder={`${clientName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`}
          className="min-h-10 min-w-0 flex-1 rounded-md border border-black/12 bg-white px-3 text-sm outline-none focus:border-black/30"
        />
        <button
          type="submit"
          disabled={busy || !host.trim()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-45"
        >
          {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
          Route a site here
        </button>
      </form>
      {error ? <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-xs text-black/40">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-black/12 bg-black/[0.015] px-3 py-4 text-xs leading-5 text-black/50">
          No sites routed to {clientName} yet. Add one above and its enquiries will arrive on this
          client instead of the agency inbox.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {sources.map(source => (
            <li key={source.id} className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.015] px-3 py-2.5">
              <span className="truncate text-sm font-medium text-black/80">{source.host}</span>
              <button
                type="button"
                onClick={() => void remove(source)}
                aria-label={`Stop routing ${source.host} to ${clientName}`}
                className="grid size-8 place-items-center rounded-md border border-black/10 text-black/35 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              ><Trash2 size={13} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
