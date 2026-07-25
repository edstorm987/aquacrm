"use client";

import { useState } from "react";

import type { Affiliate, Payout, PayoutStatus } from "../lib/domain";

export interface PayoutsListProps {
  payouts: Payout[];
  affiliates: Affiliate[];
  apiBase: string;
  canMutate: boolean;
}

export function PayoutsList({ payouts, affiliates, apiBase, canMutate }: PayoutsListProps) {
  const [filter, setFilter] = useState<PayoutStatus | "all">("scheduled");
  const affiliateById = new Map(affiliates.map(a => [a.id, a]));
  const filtered = filter === "all" ? payouts : payouts.filter(p => p.status === filter);
  return (
    <section className="affiliates-payouts">
      <header className="affiliates-list-header">
        <div>
          <h1>Payouts</h1>
          <p>{payouts.length === 0 ? "No payouts yet." : `${filtered.length} of ${payouts.length}`}</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as PayoutStatus | "all")}>
          <option value="all">All</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </header>
      <ul className="affiliates-payout-grid">
        {filtered.map(p => {
          const aff = affiliateById.get(p.affiliateId);
          return (
            <li key={p.id}>
              <article className="affiliates-payout-card">
                <header>
                  <h3>{aff?.displayName ?? p.affiliateId}</h3>
                  <span className={`affiliates-pill affiliates-pill-payout-${p.status}`}>{p.status}</span>
                </header>
                <p className="affiliates-meta">{(p.amountCents / 100).toFixed(2)} · {p.method}</p>
                <p className="affiliates-meta">{p.attributionIds.length} attributions</p>
                {p.externalRef && <p className="affiliates-meta">Ref: {p.externalRef}</p>}
                {canMutate && p.status === "scheduled" && (
                  <div className="affiliates-payout-actions">
                    <ProcessViaStripeButton apiBase={apiBase} payoutId={p.id} affiliate={aff} />
                    <MarkPaidButton apiBase={apiBase} payoutId={p.id} />
                  </div>
                )}
                {p.status === "in_progress" && (
                  <p className="affiliates-meta">Stripe transfer pending — webhook flips to completed.</p>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProcessViaStripeButton({
  apiBase,
  payoutId,
  affiliate,
}: {
  apiBase: string;
  payoutId: string;
  affiliate: Affiliate | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = affiliate?.stripeOnboardingStatus === "complete";
  const reason = !affiliate
    ? "affiliate not found"
    : !affiliate.stripeAccountId
      ? "affiliate hasn't started Stripe Connect onboarding"
      : affiliate.stripeOnboardingStatus !== "complete"
        ? `Stripe onboarding is ${affiliate.stripeOnboardingStatus ?? "pending"}`
        : null;
  return (
    <span className="affiliates-stripe-button">
      <button
        type="button"
        disabled={busy || !ready}
        title={reason ?? "Submit Stripe transfer"}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await fetch(`${apiBase}/payouts/process`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: payoutId }),
            });
            const data = await r.json();
            if (!r.ok || !data.ok) {
              setError(data?.error ?? `Failed (${r.status})`);
              return;
            }
            window.location.reload();
          } finally { setBusy(false); }
        }}
      >
        {busy ? "…" : "Process via Stripe"}
      </button>
      {!ready && <span className="affiliates-meta">{reason}</span>}
      {error && <span className="affiliates-form-error">{error}</span>}
    </span>
  );
}

function MarkPaidButton({ apiBase, payoutId }: { apiBase: string; payoutId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const ref = window.prompt("External transaction reference (e.g. PayPal txn id):");
        if (!ref) return;
        setBusy(true);
        try {
          await fetch(`${apiBase}/payouts/mark-paid`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: payoutId, externalRef: ref }),
          });
          window.location.reload();
        } finally { setBusy(false); }
      }}
    >
      {busy ? "…" : "Mark paid"}
    </button>
  );
}
