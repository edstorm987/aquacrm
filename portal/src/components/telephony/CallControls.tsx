"use client";

// Press-to-call, and the line you press it from.
//
// ── Two components, because there are two decisions ───────────────────────
//
// WHICH NUMBER you call from is chosen once and holds for the session — Ed runs
// several burner sales lines and one official line, and picking per row would
// be a decision repeated a hundred times a morning for no reason. So
// `CallLinePicker` sits once at the top of the list and writes to a tiny shared
// store; every `CallButton` below reads it.
//
// WHO you call is per row, and that is the button.
//
// ── The store is module-level on purpose ──────────────────────────────────
//
// The contacts page is a 1,500-line client component and threading a sender id
// through it would touch everything on the way down. A subscribable module
// store keeps the change local to these two components, and the selection
// survives a re-render of the list, which matters when the list re-sorts under
// you mid-session.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Phone, PhoneOff, LoaderCircle, TriangleAlert, Check } from "lucide-react";

import { formatPhoneForDisplay } from "@/lib/telephony/phoneNumbers";

interface CallSender {
  id: string;
  label: string;
  address: string;
  provider: string;
}

const STORAGE_KEY = "aquacrm.telephony.sender";

// ─── the shared selection ─────────────────────────────────────────────────

let selectedSenderId = "";
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function setSelectedSender(id: string) {
  selectedSenderId = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode — the choice still holds for this session */
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useSelectedSender(): string {
  return useSyncExternalStore(subscribe, () => selectedSenderId, () => "");
}

// ─── senders, fetched once ────────────────────────────────────────────────

let sendersPromise: Promise<CallSender[]> | null = null;

/**
 * The voice identities this agency can call from.
 *
 * Fetched once per page load and shared. A hundred contact rows must not mean
 * a hundred identical requests — and the answer cannot change between rows.
 */
function loadSenders(): Promise<CallSender[]> {
  if (!sendersPromise) {
    // Any valid-looking number works; this request is asked for the senders
    // list, and the identity it also returns is ignored here.
    sendersPromise = fetch("/api/portal/telephony/call?phone=%2B440000000000", { cache: "no-store" })
      .then(response => response.json())
      .then(result => (result?.ok && Array.isArray(result.senders) ? result.senders as CallSender[] : []))
      .catch(() => []);
  }
  return sendersPromise;
}

export function CallLinePicker() {
  const [senders, setSenders] = useState<CallSender[] | null>(null);
  const selected = useSelectedSender();

  useEffect(() => {
    let live = true;
    void loadSenders().then(list => {
      if (!live) return;
      setSenders(list);
      // Restore last session's choice if it still exists, else take the first
      // real line. A stored id for a deleted connection must not leave the
      // picker pointing at nothing.
      const stored = readStored();
      const valid = list.some(sender => sender.id === stored);
      if (valid) setSelectedSender(stored);
      else if (list.length) setSelectedSender(list[0].id);
    });
    return () => { live = false; };
  }, []);

  if (senders === null) {
    return <span className="inline-flex items-center gap-2 text-xs text-black/40"><LoaderCircle size={13} className="animate-spin" /> Checking calling lines…</span>;
  }

  // `outboundCommunicationReadiness` ALWAYS pushes a `device:call` sender, so
  // the list is never empty and an "add a Twilio connection" empty state would
  // be unreachable code. Verified in the browser 2026-08-29: with no Twilio
  // connection the picker reads "This device · Device dialler".
  //
  // What matters is therefore not "is the list empty" but "is there anything
  // here that can actually place a bridged call". Device-only means pressing
  // Call opens your phone's own dialler — which works, shows YOUR number, and
  // records nothing. Worth saying out loud rather than letting somebody assume
  // they are calling from a business line.
  const bridged = senders.filter(sender => sender.provider !== "device");

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
    <label className="inline-flex items-center gap-2 text-xs text-black/55">
      <Phone size={13} aria-hidden="true" />
      Calling from
      <select
        value={selected}
        onChange={event => setSelectedSender(event.target.value)}
        className="min-h-9 rounded-md border border-black/15 bg-white px-2 text-xs text-black/80"
      >
        {senders.map(sender => (
          <option key={sender.id} value={sender.id}>
            {sender.label} · {formatPhoneForDisplay(sender.address)}
          </option>
        ))}
      </select>
    </label>
    {bridged.length ? null : (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
        <TriangleAlert size={12} aria-hidden="true" />
        Your own phone — connect Twilio to call from a business number.
      </span>
    )}
    </span>
  );
}

// ─── the button ───────────────────────────────────────────────────────────

type CallState =
  | { status: "idle" }
  | { status: "calling" }
  | { status: "ringing"; message: string }
  | { status: "blocked"; message: string }
  | { status: "failed"; message: string };

export function CallButton({
  phone,
  name,
  contactId,
  prospectId,
  onCalled,
}: {
  phone?: string;
  name?: string;
  contactId?: string;
  /** When set, the server gates on the prospect's inspection + opt-out and records the attempt itself. */
  prospectId?: string;
  /** Fired once a call is actually placed, so the list can mark it contacted. */
  onCalled?: () => void;
}) {
  const senderId = useSelectedSender();
  const [state, setState] = useState<CallState>({ status: "idle" });

  const call = useCallback(async () => {
    if (!phone || state.status === "calling") return;
    setState({ status: "calling" });
    try {
      const response = await fetch("/api/portal/telephony/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, senderId, ...(contactId ? { contactId } : {}), ...(prospectId ? { prospectId } : {}) }),
      });
      const result = await response.json().catch(() => null) as
        { ok?: boolean; error?: string; via?: string } | null;

      if (response.status === 409) {
        // Do-not-call. Refused by the server, and said in words rather than by
        // a button that quietly does nothing.
        setState({ status: "blocked", message: result?.error ?? "This number is on the do-not-call list." });
        return;
      }
      if (!response.ok || !result?.ok) {
        setState({ status: "failed", message: result?.error ?? "The call could not be placed." });
        return;
      }
      if (result.via === "device") {
        // No Twilio line selected — this identity is the handset itself. The
        // SERVER has already recorded the attempt (device calls have no later
        // callback that ever fires); onCalled here is UI refresh, not the
        // ledger. Fired BEFORE the tel: handoff so it cannot be lost to it.
        onCalled?.();
        window.location.href = `tel:${phone}`;
        setState({ status: "idle" });
        return;
      }
      setState({ status: "ringing", message: "Your phone is ringing — pick up and it will connect." });
      onCalled?.();
    } catch {
      setState({ status: "failed", message: "The call could not be placed." });
    }
  }, [phone, senderId, contactId, prospectId, state.status, onCalled]);

  if (!phone) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-black/30" title="No phone number on this record">
        <PhoneOff size={12} aria-hidden="true" /> No number
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void call()}
        disabled={state.status === "calling" || state.status === "blocked"}
        aria-label={name ? `Call ${name}` : `Call ${phone}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0b6f6d] px-3 text-xs font-semibold text-white hover:bg-[#095b59] disabled:opacity-50"
      >
        {state.status === "calling"
          ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
          : state.status === "ringing"
            ? <Check size={13} aria-hidden="true" />
            : <Phone size={13} aria-hidden="true" />}
        {state.status === "calling" ? "Connecting…" : state.status === "ringing" ? "Calling" : "Call"}
      </button>
      {state.status === "blocked" || state.status === "failed" ? (
        <span role="alert" className={`max-w-56 text-right text-[10px] leading-4 ${state.status === "blocked" ? "text-amber-800" : "text-red-700"}`}>
          {state.message}
        </span>
      ) : null}
      {state.status === "ringing" ? (
        <span className="max-w-56 text-right text-[10px] leading-4 text-black/45">{state.message}</span>
      ) : null}
    </span>
  );
}
