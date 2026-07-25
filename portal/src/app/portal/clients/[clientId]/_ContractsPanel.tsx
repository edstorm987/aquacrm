"use client";

import { Check, ExternalLink, FileSignature, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ClientContract } from "@/lib/clientContracts";

const CONTROL = "min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35 focus:ring-2 focus:ring-black/5";

function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

export function ContractsPanel({
  clientId,
  initialContracts,
}: {
  clientId: string;
  initialContracts: ClientContract[];
}) {
  const [contracts, setContracts] = useState(initialContracts);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", summary: "", documentUrl: "" });

  async function act(action: "create" | "send" | "accept" | "delete", contractId?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          action,
          contractId,
          ...(action === "create" ? draft : {}),
        }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; contracts?: ClientContract[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Agreement update failed.");
      setContracts(payload.contracts ?? contracts);
      if (action === "create") {
        setDraft({ title: "", summary: "", documentUrl: "" });
        setAdding(false);
      }
      setNotice(action === "send" ? "Agreement is now visible to the customer." : "Agreement updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Agreement update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-black/10 bg-white" data-testid="client-contracts-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-black/40">Client record</p>
          <h2 className="mt-1 text-sm font-medium text-black/85">Agreements</h2>
        </div>
        <button
          type="button"
          onClick={() => setAdding(value => !value)}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-xs font-medium hover:bg-black/[0.03]"
        >
          <Plus size={14} aria-hidden="true" />
          {adding ? "Close" : "New agreement"}
        </button>
      </header>

      {adding && (
        <form
          onSubmit={event => { event.preventDefault(); void act("create"); }}
          className="grid gap-3 border-b border-black/10 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={draft.title}
              onChange={event => setDraft(value => ({ ...value, title: event.target.value }))}
              className={CONTROL}
              placeholder="Website design and development agreement"
              aria-label="Agreement title"
            />
            <input
              value={draft.documentUrl}
              onChange={event => setDraft(value => ({ ...value, documentUrl: event.target.value }))}
              className={CONTROL}
              type="url"
              placeholder="Document link (optional)"
              aria-label="Agreement document link"
            />
          </div>
          <textarea
            value={draft.summary}
            onChange={event => setDraft(value => ({ ...value, summary: event.target.value }))}
            className={`${CONTROL} min-h-24 resize-y py-3`}
            placeholder="A short plain-English summary of what the customer is agreeing to."
            aria-label="Agreement summary"
          />
          <button
            type="submit"
            disabled={busy || !draft.title.trim()}
            className="inline-flex min-h-10 items-center justify-center gap-2 justify-self-end rounded-md bg-black px-4 text-xs font-medium text-white disabled:opacity-45"
          >
            <FileSignature size={14} aria-hidden="true" />
            Save draft
          </button>
        </form>
      )}

      {contracts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium text-black/70">No agreements yet.</p>
          <p className="mt-1 text-xs text-black/45">Create one here, review it, then send it into the customer portal.</p>
        </div>
      ) : (
        <ul className="divide-y divide-black/8">
          {contracts.map(contract => (
            <li key={contract.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-black/85">{contract.title}</p>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/55">
                    {contract.status}
                  </span>
                </div>
                {contract.summary && <p className="mt-2 max-w-3xl text-xs leading-5 text-black/50">{contract.summary}</p>}
                {contract.acceptedAt && (
                  <p className="mt-2 text-[11px] text-emerald-700">
                    Accepted by {contract.acceptedBy} on {formatShortDate(contract.acceptedAt)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {contract.documentUrl && (
                  <a href={contract.documentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/15 px-3 text-xs">
                    Open <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
                {contract.status === "draft" && (
                  <>
                    <button onClick={() => void act("delete", contract.id)} disabled={busy} title="Delete draft" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/15 text-black/55">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                    <button onClick={() => void act("send", contract.id)} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-medium text-white">
                      <Send size={13} aria-hidden="true" /> Send
                    </button>
                  </>
                )}
                {(contract.status === "sent" || contract.status === "declined") && (
                  <button onClick={() => void act("accept", contract.id)} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-xs font-medium">
                    <Check size={13} aria-hidden="true" /> Mark accepted
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && <p aria-live="polite" className="border-t border-black/10 px-4 py-3 text-xs text-black/50">{notice}</p>}
    </section>
  );
}
