"use client";

import { Check, CreditCard, Info, Printer } from "lucide-react";
import { useState } from "react";

import { formatUkDate } from "@/lib/shared/formatDateTime";

export function ProposalActions({
  token,
  accepted,
  openForSignature,
  version,
  acceptedVersion,
  acceptedAt,
  checkoutUrl,
}: {
  token: string;
  accepted: boolean;
  /** Is THIS version the one that was sent for signature? */
  openForSignature: boolean;
  version: number;
  acceptedVersion?: number;
  acceptedAt?: number;
  checkoutUrl?: string;
}) {
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<{ accepted: boolean; version?: number; at?: number }>({
    accepted,
    version: acceptedVersion,
    at: acceptedAt,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/proposals/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedBy: name, confirmed }),
      });
      const result = await response.json() as {
        ok?: boolean;
        error?: string;
        acceptedAt?: number;
        acceptedVersion?: number;
      };
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Could not record acceptance.");
        return;
      }
      setState({ accepted: true, version: result.acceptedVersion, at: result.acceptedAt });
    } finally {
      setBusy(false);
    }
  }

  // Which version was agreed is the whole record: an amendment starts a new
  // version, so naming it here is the difference between "they accepted" and
  // "they accepted THIS".
  const acceptedLabel = state.accepted
    ? `Agreement accepted${state.version ? ` — version ${state.version}` : ""}${state.at ? ` on ${formatUkDate(state.at, { dateStyle: "long" })}` : ""}`
    : null;

  return (
    <aside className="space-y-4 border-t border-black/10 pt-6 print:hidden">
      {acceptedLabel ? (
        <p className="flex items-center gap-2 border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><Check size={17} /> {acceptedLabel}</p>
      ) : openForSignature ? (
        <div className="space-y-3">
          <label className="grid gap-1 text-sm font-medium text-black/65">Your full name<input value={name} onChange={event => setName(event.target.value)} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm" /></label>
          <label className="flex items-start gap-2 text-sm leading-6 text-black/60"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I have read and agree to version {version} of the service agreement shown above.</label>
          <button type="button" disabled={busy || !confirmed || !name.trim()} onClick={accept} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"><Check size={17} /> {busy ? "Recording..." : "Accept agreement"}</button>
        </div>
      ) : (
        <p className="flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <Info size={17} className="mt-0.5 shrink-0" />
          <span>These terms have not been issued for signature yet, so they cannot be accepted here. {version > 1 ? "They were amended after the last version was sent — " : ""}Contact us and we will send version {version} across for you to review and sign.</span>
        </p>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {checkoutUrl ? <a href={checkoutUrl} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><CreditCard size={17} /> Pay securely</a> : null}
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/15 bg-white px-4 text-sm font-medium"><Printer size={17} /> Print / save copy</button>
      </div>
    </aside>
  );
}
