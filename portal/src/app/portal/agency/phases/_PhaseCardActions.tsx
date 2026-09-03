"use client";

import { useRef, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import {
  isPhaseDeleteReceipt,
  isPhasePreviewReceipt,
  type PhaseDeleteReceipt,
  type PhasePreviewReceipt,
} from "@/lib/client/phaseAdminMutationPayloads";

// Both actions follow the checked mutation contract (issue #47): the request
// is validated end to end — transport, readable JSON, 2xx, `{ok:true}` and a
// receipt bound to THIS phase id — before anything navigates or reloads. A
// refusal keeps the card exactly as it was, settles the busy state in
// `finally`, and says so in an inline `role="alert"` the operator can act on.

export function PreviewAsClientButton({ phaseId, label }: { phaseId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let navigating = false;
    try {
      const receipt = await checkedJsonMutation<PhasePreviewReceipt>(
        "/api/auth/preview-as-client-at-phase",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phaseId }),
        },
        {
          fallback: "Preview could not start.",
          validate: value => isPhasePreviewReceipt(value, phaseId),
        },
      );
      // Only a validated receipt for this phase, carrying a safe relative
      // demo-client path, may change where the operator is. The button stays
      // busy until that navigation lands so a second click cannot re-issue it.
      navigating = true;
      window.location.assign(receipt.redirect);
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Preview could not start."));
    } finally {
      if (!navigating) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        aria-busy={busy || undefined}
        title={`Sign in as demo client at ${label}`}
        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Starting preview…" : "Preview as demo client"}
      </button>
      {error ? <span role="alert" className="max-w-56 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</span> : null}
    </span>
  );
}

export function DeletePhaseButton({ phaseId, label }: { phaseId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onClick() {
    if (inFlight.current) return;
    if (!window.confirm(`Delete phase "${label}"? This cannot be undone.`)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let reloading = false;
    try {
      await checkedJsonMutation<PhaseDeleteReceipt>(
        "/api/portal/phases/delete",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phaseId }),
        },
        {
          fallback: "The phase could not be deleted.",
          validate: value => isPhaseDeleteReceipt(value, phaseId),
        },
      );
      // The list is server-rendered; a validated delete receipt is the only
      // thing that may refresh it. A refusal leaves the card in place; a
      // success keeps the button busy until the reload lands.
      reloading = true;
      window.location.reload();
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The phase could not be deleted."));
    } finally {
      if (!reloading) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        aria-busy={busy || undefined}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error ? <span role="alert" className="max-w-56 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</span> : null}
    </span>
  );
}
