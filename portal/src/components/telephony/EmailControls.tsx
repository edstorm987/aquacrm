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

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mail, LoaderCircle, Check, TriangleAlert, X, RefreshCw } from "lucide-react";
import {
  readSenderCatalogue,
  type OutboundSenderOption,
  type SenderCatalogueRead,
} from "@/lib/client/senderCatalogueRead";
import {
  readProspectOutreachReceipt,
  type ProspectOutreachReceipt,
} from "@/lib/telephony/prospectOutreachReceipt";

type EmailSender = OutboundSenderOption;
type SenderReadState = "loading" | "ready" | "unavailable";

const STORAGE_KEY = "aquacrm.outreach.emailSender";

let selectedId = "";
let senderReadState: SenderReadState = "loading";
const listeners = new Set<() => void>();

function setSelected(id: string) {
  selectedId = id;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode */ }
  listeners.forEach(listener => listener());
}

function setSenderReadState(state: SenderReadState) {
  senderReadState = state;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useSelected(): string {
  return useSyncExternalStore(subscribe, () => selectedId, () => "");
}

function useSenderReadState(): SenderReadState {
  return useSyncExternalStore(subscribe, () => senderReadState, () => "loading");
}

let sendersPromise: Promise<SenderCatalogueRead> | null = null;

/** Fetched once and shared — a hundred rows must not mean a hundred requests. */
function loadSenders(force = false): Promise<SenderCatalogueRead> {
  if (force) sendersPromise = null;
  if (!sendersPromise) {
    sendersPromise = readSenderCatalogue("/api/portal/telephony/email");
  }
  return sendersPromise;
}

export function EmailLinePicker() {
  const [read, setRead] = useState<SenderCatalogueRead | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const selected = useSelected();

  useEffect(() => {
    let live = true;
    setRead(null);
    setSenderReadState("loading");
    void loadSenders(retryToken > 0).then(result => {
      if (!live) return;
      setRead(result);
      if (!result.available) {
        setSenderReadState("unavailable");
        return;
      }
      const list = result.data as EmailSender[];
      let stored = "";
      try { stored = window.localStorage.getItem(STORAGE_KEY) ?? ""; } catch { /* private mode */ }
      // A stored id for a connection since deleted must not leave the picker
      // pointing at an address that no longer exists.
      if (list.some(sender => sender.id === stored)) setSelected(stored);
      else {
        setSelected("");
        if (list.length) setSelected(list[0].id);
      }
      setSenderReadState("ready");
    });
    return () => { live = false; };
  }, [retryToken]);

  if (read === null) {
    return <span className="inline-flex items-center gap-2 text-xs text-black/40"><LoaderCircle size={13} className="animate-spin" /> Checking sending addresses…</span>;
  }

  if (!read.available) {
    return <span role="alert" className="inline-flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"><TriangleAlert size={13} aria-hidden="true" /><span>Sending addresses could not be read. This is unavailable, not confirmation that none are connected. {read.message}</span><button type="button" onClick={() => setRetryToken(value => value + 1)} className="inline-flex min-h-11 items-center gap-1 rounded border border-amber-300 bg-white px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"><RefreshCw size={11} />Retry addresses</button></span>;
  }

  const senders = read.data as EmailSender[];
  if (!senders.length) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
        <TriangleAlert size={13} aria-hidden="true" />
        No sending address connected — add Resend or SMTP in Settings → Integrations.
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-black/65">
      <Mail size={13} aria-hidden="true" />
      Sending from
      <select
        value={selected}
        onChange={event => setSelected(event.target.value)}
        className="min-h-11 rounded-md border border-black/15 bg-white px-2 text-xs text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
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
  disabled,
  onSent,
  onPrepared,
  onPendingChange,
}: {
  email?: string;
  /** Passed so the server can apply the same opt-out suppression the dialler does. */
  phone?: string;
  name?: string;
  contactId?: string;
  /** When set, the server binds the recipient, enforces opt-out, and records the send itself. */
  prospectId?: string;
  /** Parent-level lock shared with other outreach controls. */
  disabled?: boolean;
  onSent?: (receipt: ProspectOutreachReceipt) => void;
  /** Default-app handoff: the draft opened, but delivery is not claimed. */
  onPrepared?: (receipt: ProspectOutreachReceipt) => void;
  /** True only while this control has an unresolved provider request. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const senderId = useSelected();
  const usesDeviceApp = senderId === "device:email";
  const catalogueState = useSenderReadState();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad", text: string } | null>(null);
  // A network failure after the provider accepted a message is ambiguous.
  // Keep one id for retries of the exact same payload so a deliberate second
  // click cannot produce a second Resend delivery or Prospect ledger row.
  const logicalSendRef = useRef<{ fingerprint: string; id: string } | null>(null);
  // A draft belongs to the person it was started FOR. This component stays
  // mounted while the selected prospect changes above it, so without this a
  // draft addressed to A silently readdressed itself to B the moment the
  // selection moved (Ed's finding, 2026-08-30). When the recipient changes,
  // the composer closes and the draft dies with it — an unsent draft to the
  // wrong person is worse than a lost draft.
  const draftKey = JSON.stringify([prospectId ?? "", email ?? ""]);
  const [draftFor, setDraftFor] = useState(draftKey);
  if (draftFor !== draftKey) {
    setDraftFor(draftKey);
    setOpen(false);
    setSubject("");
    setBody("");
    setNote(null);
    logicalSendRef.current = null;
  }

  const send = useCallback(async () => {
    if (disabled || busy || !email || !senderId || catalogueState !== "ready") return;
    setBusy(true);
    setNote(null);
    try {
      const fingerprint = JSON.stringify({
        to: email,
        subject,
        body,
        senderId,
        phone: phone ?? "",
        contactId: contactId ?? "",
        prospectId: prospectId ?? "",
      });
      if (!logicalSendRef.current || logicalSendRef.current.fingerprint !== fingerprint) {
        logicalSendRef.current = { fingerprint, id: crypto.randomUUID() };
      }
      const logicalSendId = logicalSendRef.current.id;
      onPendingChange?.(true);
      const response = await fetch("/api/portal/telephony/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: email, subject, body, senderId, logicalSendId, ...(phone ? { phone } : {}), ...(contactId ? { contactId } : {}), ...(prospectId ? { prospectId } : {}) }),
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        from?: string;
        via?: string;
        mailto?: string;
        outcomeUnknown?: boolean;
        retry?: "safe" | "same-operation-key" | "reconcile-first";
        replayed?: boolean;
        outreachRecorded?: boolean;
        outreachAttemptId?: string;
      } | null;
      if (!response.ok || !result?.ok) {
        // Keep the operation id across a bare 5xx: the SMTP result may already
        // be durable while only the local outreach/audit reconciliation failed.
        if (response.status < 500 || result?.retry === "safe") logicalSendRef.current = null;
        setNote({
          tone: "bad",
          text: result?.outcomeUnknown
            ? result.error ?? "Email status is unknown. Check the provider before retrying; Aqua will reuse this send reference."
            : result?.error ?? "The email could not be sent.",
        });
        return;
      }
      const receipt = readProspectOutreachReceipt(result);
      if (result.via === "device") {
        if (typeof result.mailto !== "string" || !result.mailto.startsWith("mailto:")) {
          setNote({ tone: "bad", text: "The default email app handoff was not valid." });
          return;
        }
        setNote({
          tone: receipt.outreachRecorded || !prospectId ? "ok" : "bad",
          text: receipt.outreachRecorded || !prospectId
            ? "Draft opened in your default email app. Send it there, then record the real outcome below."
            : "Draft opened, but Aqua could not retain the attempted handoff. Record the outcome before moving on.",
        });
        setSubject("");
        setBody("");
        setOpen(false);
        logicalSendRef.current = null;
        onPrepared?.(receipt);
        window.location.href = result.mailto;
        return;
      }
      setNote({
        tone: receipt.outreachRecorded || !prospectId ? "ok" : "bad",
        text: receipt.outreachRecorded || !prospectId
          ? `Sent from ${result.from ?? "your address"}.`
          : `Sent from ${result.from ?? "your address"}, but the outreach history needs confirmation. Record the outcome before moving on.`,
      });
      setSubject("");
      setBody("");
      setOpen(false);
      logicalSendRef.current = null;
      onSent?.(receipt);
    } catch {
      setNote({
        tone: "bad",
        text: usesDeviceApp
          ? "Draft handoff status is unknown. Check whether your email app opened before trying again; Aqua will reuse this reference."
          : "Email status is unknown. Check the provider before retrying; Aqua will reuse this send reference.",
      });
    } finally {
      onPendingChange?.(false);
      setBusy(false);
    }
  }, [disabled, busy, email, subject, body, senderId, catalogueState, phone, contactId, prospectId, onSent, onPrepared, onPendingChange, usesDeviceApp]);

  if (!email) return null;

  return (
    <span className="relative inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        disabled={disabled || catalogueState !== "ready" || !senderId}
        aria-label={name ? `Email ${name}` : `Email ${email}`}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Mail size={13} aria-hidden="true" /> Email
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-black/10 bg-white p-2 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <p className="truncate text-[11px] text-black/45">To {email}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-11 place-items-center rounded text-black/60 hover:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f]">
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <input
            value={subject}
            onChange={event => setSubject(event.target.value)}
            placeholder="Subject"
            className="mb-1.5 min-h-11 w-full rounded-md border border-black/15 px-2 text-xs text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f]"
          />
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Write the message…"
            rows={5}
            className="mb-1.5 w-full resize-y rounded-md border border-black/15 px-2 py-2 text-xs text-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={disabled || busy || catalogueState !== "ready" || !senderId || !subject.trim() || !body.trim()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-[#0b6f6d] px-3 text-xs font-semibold text-white hover:bg-[#095b59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            {busy ? (usesDeviceApp ? "Preparing…" : "Sending…") : usesDeviceApp ? "Open default email app" : "Send"}
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
