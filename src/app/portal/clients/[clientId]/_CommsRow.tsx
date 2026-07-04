"use client";

// Per-client comms row (T1 R9 — chapter §7 Communication SOP).
// WhatsApp pill + Mailto pill + Last-contact + inline edit + Mark
// contacted button. Pinned in the per-client header.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface InitialState {
  whatsappLink: string;
  clientEmail: string;
  lastContactedAt: number;
}

function formatRelative(ts: number): string {
  if (!ts) return "never";
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function CommsRow({
  clientId,
  initial,
}: {
  clientId: string;
  initial: InitialState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState(initial.whatsappLink);
  const [emailDraft, setEmailDraft] = useState(initial.clientEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function patch(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-comms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, patch: body }),
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        metadata?: { whatsappLink: string | null; clientEmail: string | null; lastContactedAt: number | null };
      };
      if (!data.ok) {
        setError(data.error ?? "Save failed.");
        return false;
      }
      const m = data.metadata ?? { whatsappLink: null, clientEmail: null, lastContactedAt: null };
      setState({
        whatsappLink: m.whatsappLink ?? "",
        clientEmail: m.clientEmail ?? "",
        lastContactedAt: m.lastContactedAt ?? 0,
      });
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    const ok = await patch({ whatsappLink: whatsappDraft.trim(), clientEmail: emailDraft.trim() });
    if (ok) setEditing(false);
  }

  async function markContacted() {
    await patch({ lastContactedAt: "now" });
  }

  const hasWhatsapp = !!state.whatsappLink;
  const hasEmail = !!state.clientEmail;
  const lastTs = state.lastContactedAt;
  const stale = lastTs > 0 && Date.now() - lastTs > 7 * 86_400_000;
  const lastLabel = lastTs ? `last contact ${formatRelative(lastTs)}` : "never contacted";

  return (
    <div data-testid="client-comms-row" className="flex flex-wrap items-center gap-2 text-xs">
      {hasWhatsapp ? (
        <a
          href={state.whatsappLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 hover:bg-emerald-100"
        >
          <span aria-hidden="true">💬</span> WhatsApp ↗
        </a>
      ) : (
        <span className="rounded-full border border-dashed border-emerald-200 bg-emerald-50/40 px-2 py-0.5 text-emerald-800/60">
          + WhatsApp
        </span>
      )}
      {hasEmail ? (
        <a
          href={`mailto:${state.clientEmail}`}
          className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 font-medium text-blue-800 hover:bg-blue-100"
        >
          <span aria-hidden="true">✉</span> {state.clientEmail}
        </a>
      ) : (
        <span className="rounded-full border border-dashed border-blue-200 bg-blue-50/40 px-2 py-0.5 text-blue-800/60">
          + Email
        </span>
      )}
      <span
        title={lastTs ? new Date(lastTs).toLocaleString() : ""}
        className={[
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
          stale ? "bg-amber-100 text-amber-900" : "text-black/55",
        ].join(" ")}
      >
        <span aria-hidden="true">🕘</span> {lastLabel}
      </span>
      <button
        type="button"
        onClick={markContacted}
        disabled={busy}
        className="rounded-md border border-black/15 px-2 py-0.5 hover:bg-black/5 disabled:opacity-50"
      >
        Mark contacted
      </button>
      <button
        type="button"
        onClick={() => setEditing(o => !o)}
        disabled={busy}
        className="rounded-md border border-black/15 px-2 py-0.5 hover:bg-black/5 disabled:opacity-50"
      >
        {editing ? "Cancel" : "Edit"}
      </button>

      {editing && (
        <div
          role="group"
          aria-label="Edit comms"
          className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-md border border-black/10 bg-white p-2"
        >
          <label className="flex flex-1 min-w-[14rem] flex-col text-[11px]">
            <span className="text-black/55">WhatsApp invite URL</span>
            <input
              type="url"
              value={whatsappDraft}
              disabled={busy}
              onChange={e => setWhatsappDraft(e.target.value)}
              placeholder="https://chat.whatsapp.com/…"
              className="rounded-md border border-black/15 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-1 min-w-[14rem] flex-col text-[11px]">
            <span className="text-black/55">Comms email</span>
            <input
              type="email"
              value={emailDraft}
              disabled={busy}
              onChange={e => setEmailDraft(e.target.value)}
              placeholder="client@example.com"
              className="rounded-md border border-black/15 px-2 py-1 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy}
            className="self-end rounded-md bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          {error && <p role="alert" className="w-full rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
