"use client";

// Emailing a scouting prospect, from the address you choose.
//
// Ed, 2026-08-29: *"same will go for emails in scouting, I need to go from
// official milesymedia and burner versions as well."*
//
// Deliberately the same shape as `CallControls`: one picker at the top of the
// list choosing the identity, one control per row doing the thing. Cold
// outreach is the same job in two channels and it should not be two different
// interfaces.
//
// ── Why this one is a composer and the call button is not ─────────────────
//
// A call needs no content — you press it and then you talk. An email needs a
// subject and a body, so this opens a small composer rather than sending on
// one click. Sending an unreviewed email to a prospect on a single press is
// exactly the kind of irreversible action that should cost one more.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Mail, LoaderCircle, Check, TriangleAlert, X } from "lucide-react";

interface EmailSender {
  id: string;
  label: string;
  address: string;
  provider: string;
}

const STORAGE_KEY = "aquacrm.outreach.emailSender";

let selectedId = "";
const listeners = new Set<() => void>();

function setSelected(id: string) {
  selectedId = id;
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useSelected(): string {
  return useSyncExternalStore(subscribe, () => selectedId, () => "");
}

let sendersPromise: Promise<EmailSender[]> | null = null;

/** Fetched once and shared — a hundred rows must not mean a hundred requests. */
function loadSenders(): Promise<EmailSender[]> {
  if (!sendersPromise) {
    sendersPromise = fetch("/api/portal/telephony/email", { cache: "no-store" })
      .then(response => response.json())
      .then(result => (result?.ok && Array.isArray(result.senders) ? result.senders as EmailSender[] : []))
      .catch(() => []);
  }
  return sendersPromise;
}

export function EmailLinePicker() {
  const [senders, setSenders] = useState<EmailSender[] | null>(null);
  const selected = useSelected();

  useEffect(() => {
    let live = true;
    void loadSenders().then(list => {
      if (!live) return;
      setSenders(list);
      let stored = "";
      try { stored = window.localStorage.getItem(STORAGE_KEY) ?? ""; } catch { /* private mode */ }
      // A stored id for a connection since deleted must not leave the picker
      // pointing at an address that no longer exists.
      if (list.some(sender => sender.id === stored)) setSelected(stored);
      else if (list.length) setSelected(list[0].id);
    });
    return () => { live = false; };
  }, []);

  if (senders === null) {
    return <span className="inline-flex items-center gap-2 text-xs text-black/40"><LoaderCircle size={13} className="animate-spin" /> Checking sending addresses…</span>;
  }

  if (!senders.length) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
        <TriangleAlert size={13} aria-hidden="true" />
        No sending address connected — add Resend or SMTP in Settings → Integrations.
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-black/55">
      <Mail size={13} aria-hidden="true" />
      Sending from
      <select
        value={selected}
        onChange={event => setSelected(event.target.value)}
        className="min-h-9 rounded-md border border-black/15 bg-white px-2 text-xs text-black/80"
      >
        {senders.map(sender => (
          <option key={sender.id} value={sender.id}>{sender.label} · {sender.address}</option>
        ))}
      </select>
    </label>
  );
}

export function EmailButton({
  email,
  phone,
  name,
  contactId,
  prospectId,
  onSent,
}: {
  email?: string;
  /** Passed so the server can apply the same opt-out suppression the dialler does. */
  phone?: string;
  name?: string;
  contactId?: string;
  /** When set, the server gates on the prospect's inspection + opt-out and records the send itself. */
  prospectId?: string;
  onSent?: () => void;
}) {
  const senderId = useSelected();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad", text: string } | null>(null);
  // A draft belongs to the person it was started FOR. This component stays
  // mounted while the selected prospect changes above it, so without this a
  // draft addressed to A silently readdressed itself to B the moment the
  // selection moved (Ed's finding, 2026-08-30). When the recipient changes,
  // the composer closes and the draft dies with it — an unsent draft to the
  // wrong person is worse than a lost draft.
  const [draftFor, setDraftFor] = useState(email);
  if (draftFor !== email) {
    setDraftFor(email);
    setOpen(false);
    setSubject("");
    setBody("");
    setNote(null);
  }

  const send = useCallback(async () => {
    if (busy || !email) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/portal/telephony/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: email, subject, body, senderId, ...(phone ? { phone } : {}), ...(contactId ? { contactId } : {}), ...(prospectId ? { prospectId } : {}) }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; from?: string } | null;
      if (!response.ok || !result?.ok) {
        setNote({ tone: "bad", text: result?.error ?? "The email could not be sent." });
        return;
      }
      setNote({ tone: "ok", text: `Sent from ${result.from ?? "your address"}.` });
      setSubject("");
      setBody("");
      setOpen(false);
      onSent?.();
    } catch {
      setNote({ tone: "bad", text: "The email could not be sent." });
    } finally {
      setBusy(false);
    }
  }, [busy, email, subject, body, senderId, phone, contactId, onSent]);

  if (!email) return null;

  return (
    <span className="relative inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={name ? `Email ${name}` : `Email ${email}`}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.03]"
      >
        <Mail size={13} aria-hidden="true" /> Email
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-black/10 bg-white p-2 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <p className="truncate text-[11px] text-black/45">To {email}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-5 place-items-center rounded text-black/35 hover:bg-black/[0.06]">
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <input
            value={subject}
            onChange={event => setSubject(event.target.value)}
            placeholder="Subject"
            className="mb-1.5 min-h-9 w-full rounded-md border border-black/15 px-2 text-xs text-black/80 outline-none focus:border-black/35"
          />
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Write the message…"
            rows={5}
            className="mb-1.5 w-full resize-y rounded-md border border-black/15 px-2 py-1.5 text-xs text-black/80 outline-none focus:border-black/35"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !subject.trim() || !body.trim()}
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#0b6f6d] px-3 text-xs font-semibold text-white hover:bg-[#095b59] disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      ) : null}

      {note ? (
        <span role="alert" className={`max-w-56 text-right text-[10px] leading-4 ${note.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>
          {note.text}
        </span>
      ) : null}
    </span>
  );
}
