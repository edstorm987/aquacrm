"use client";

import { useEffect, useState } from "react";
import { Globe2, Inbox, LoaderCircle, Plus } from "lucide-react";
import {
  WEBSITE_SOURCE_ROUTE_FALLBACK,
  readWebsiteSourceRegistry,
  routeWebsiteSourceToInbox,
  websiteSourceMutationMessage,
  websiteSourceRegistryPresentation,
  type WebsiteSourceRegistryReadState,
  type WebsiteSourceRegistrySource,
} from "@/lib/client/websiteSourceRegistryRead";

/**
 * Which of this client's tagged sites route their submissions here.
 *
 * The client-side view of the routing registry: when you tag one of this
 * client's websites, register it here and its enquiries land on the client
 * rather than in the agency inbox. The destination is fixed to this client —
 * you are inside their workspace, so that is the only sensible answer, and it
 * saves a step versus the agency-wide picker.
 */

export function ClientTagWorkspace({ clientId, clientName, canManage = true }: { clientId: string; clientName: string; canManage?: boolean }) {
  const [snapshot, setSnapshot] = useState<{ clientId: string; sources: WebsiteSourceRegistrySource[] } | null>(null);
  const [readState, setReadState] = useState<WebsiteSourceRegistryReadState>("loading");
  const [readMessage, setReadMessage] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  // The one source mutation in flight, if any. While it is set every source
  // control is disabled, so a second click cannot start a second mutation.
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasConfirmedSnapshot = snapshot?.clientId === clientId;
  const sources = hasConfirmedSnapshot ? snapshot.sources : [];
  const presentation = websiteSourceRegistryPresentation(readState, hasConfirmedSnapshot, sources.length);

  useEffect(() => {
    const controller = new AbortController();
    setReadState("loading");
    setReadMessage("");
    void (async () => {
      const read = await readWebsiteSourceRegistry({ signal: controller.signal });
      if (controller.signal.aborted) return;
      if (read.available) {
        setSnapshot({
          clientId,
          sources: read.data.sources.filter(source => source.destinationClientId === clientId),
        });
        setReadState("ready");
        return;
      }
      setReadMessage(read.message);
      setReadState("unavailable");
    })();
    return () => controller.abort();
  }, [clientId, retryToken]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!presentation.canMutate) { setError("Retry the routing read before changing any sites."); return; }
    if (!host.trim()) { setError("Enter the website address."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", host, destinationClientId: clientId }),
      });
      const data = await response.json() as { ok: boolean; error?: string; source?: WebsiteSourceRegistrySource };
      if (!response.ok || !data.ok || !data.source) throw new Error(data.error ?? "That could not be added.");
      setSnapshot(current => ({
        clientId,
        sources: [...(current?.clientId === clientId ? current.sources : []), data.source!]
          .sort((a, b) => a.host.localeCompare(b.host)),
      }));
      setHost("");
    } catch (err) { setError(err instanceof Error ? err.message : "That could not be added."); }
    finally { setBusy(false); }
  }

  // Route back to the agency inbox — NOT deletion. The registration, its tool
  // injections and imported form schemas stay; only where new enquiries land
  // changes. The row is removed from this client’s list only once the server
  // has confirmed exactly that source with no destination; any other answer
  // keeps the row, settles the busy state, says so, and can be retried.
  async function routeToInbox(source: WebsiteSourceRegistrySource) {
    if (!presentation.canMutate) { setError("Retry the routing read before changing any sites."); return; }
    if (activeSourceId) return;
    setActiveSourceId(source.id);
    setError(null);
    try {
      const routed = await routeWebsiteSourceToInbox(source.id);
      setSnapshot(current => current?.clientId === clientId
        ? { clientId, sources: current.sources.filter(item => item.id !== routed.id) }
        : current);
    } catch (cause) {
      setError(websiteSourceMutationMessage(cause, WEBSITE_SOURCE_ROUTE_FALLBACK));
    } finally {
      setActiveSourceId(null);
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

      {canManage ? <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input
          value={host}
          onChange={event => setHost(event.target.value)}
          disabled={!presentation.canMutate}
          placeholder={`${clientName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`}
          className="min-h-10 min-w-0 flex-1 rounded-md border border-black/12 bg-white px-3 text-sm outline-none focus:border-black/30 disabled:cursor-not-allowed disabled:bg-black/[0.03]"
        />
        <button
          type="submit"
          disabled={busy || !host.trim() || !presentation.canMutate}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-45"
        >
          {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
          Route a site here
        </button>
      </form> : <p className="mt-4 rounded-md bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">Routing is read-only in the public showcase.</p>}
      {error ? <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {presentation.showLoading ? (
        <p className="mt-4 text-xs text-black/40">{hasConfirmedSnapshot ? "Refreshing routing…" : "Loading routing…"}</p>
      ) : null}
      {presentation.showUnavailable ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
          <p className="min-w-0 flex-1">
            {presentation.retainedSnapshotIsStale
              ? `Routing could not be refreshed. The last confirmed sites for ${clientName} remain visible but are locked.`
              : `Routing for ${clientName} could not be read. This is unavailable, not confirmation that no sites route here.`}
            {readMessage ? <span className="block text-amber-800/75">{readMessage}</span> : null}
          </p>
          <button
            type="button"
            onClick={() => { setError(null); setRetryToken(value => value + 1); }}
            className="min-h-8 rounded-md border border-amber-300 bg-white px-2.5 font-semibold text-amber-900 hover:bg-amber-100"
          >
            Retry routing
          </button>
        </div>
      ) : null}
      {presentation.showEmpty ? (
        <p className="mt-4 rounded-md border border-dashed border-black/12 bg-black/[0.015] px-3 py-4 text-xs leading-5 text-black/50">
          No sites routed to {clientName} yet. Add one above and its enquiries will arrive on this
          client instead of the agency inbox.
        </p>
      ) : null}
      {presentation.showRows ? (
        <ul className="mt-4 grid gap-2">
          {sources.map(source => (
            <li key={source.id} aria-busy={activeSourceId === source.id || undefined} className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.015] px-3 py-2.5">
              <span className="truncate text-sm font-medium text-black/80">{source.host}</span>
              {canManage ? <button
                type="button"
                onClick={() => void routeToInbox(source)}
                disabled={!presentation.canMutate || activeSourceId !== null}
                aria-label={`Route ${source.host} back to the agency inbox`}
                title="Keep the registered site and its tools; only change where new enquiries go"
                className="grid size-9 place-items-center rounded-md border border-black/10 text-black/35 hover:border-brand/30 hover:bg-brand/[0.05] hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
              >{activeSourceId === source.id ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Inbox size={13} aria-hidden />}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
