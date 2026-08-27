"use client";

import { useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Affiliate, Attribution, AttributionStatus } from "../lib/domain";

export interface AttributionsListProps {
  attributions: Attribution[];
  affiliates: Affiliate[];
  apiBase: string;
  canMutate: boolean;
}

export function AttributionsList({ attributions, affiliates, apiBase, canMutate }: AttributionsListProps) {
  const [filter, setFilter] = useState<AttributionStatus | "all">("pending");
  const affiliateById = new Map(affiliates.map(a => [a.id, a]));
  const filtered = filter === "all" ? attributions : attributions.filter(a => a.status === filter);
  return (
    <section className="affiliates-attributions">
      <header className="affiliates-list-header">
        <div>
          <h1>Attributions</h1>
          <p>{attributions.length === 0 ? "No attributions yet." : `${filtered.length} of ${attributions.length}`}</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as AttributionStatus | "all")}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="reversed">Reversed</option>
        </select>
      </header>
      <ul className="affiliates-attribution-grid">
        {filtered.map(a => {
          const aff = affiliateById.get(a.affiliateId);
          return (
            <li key={a.id}>
              <article className="affiliates-attribution-card">
                <header>
                  <h3>{aff?.displayName ?? a.affiliateId}</h3>
                  <span className={`affiliates-pill affiliates-pill-attr-${a.status}`}>{a.status}</span>
                </header>
                <p className="affiliates-meta">Order {a.orderId} · {a.commissionPercentSnapshot}%</p>
                <p className="affiliates-meta">{formatMoney(a.amountCents, a.currency)} earned</p>
                {(a.reversedAmountCents ?? 0) > 0 && (
                  <p className="affiliates-meta">
                    {formatMoney(a.reversedAmountCents ?? 0, a.currency)} reversed
                    {(a.offsetAmountCents ?? 0) > (a.offsetAppliedCents ?? 0)
                      ? ` · ${formatMoney((a.offsetAmountCents ?? 0) - (a.offsetAppliedCents ?? 0), a.currency)} future offset`
                      : ""}
                  </p>
                )}
                {canMutate && a.status === "pending" && (
                  <ApproveButton apiBase={apiBase} attributionId={a.id} />
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function ApproveButton({ apiBase, attributionId }: { apiBase: string; attributionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/attributions/approve`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: attributionId }),
            }, {
              fallback: "The attribution could not be approved.",
              validate: payload => payload.ok === true,
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "The attribution could not be approved."));
          } finally { setBusy(false); }
        }}
      >
        {busy ? "…" : "Approve"}
      </button>
      {error && <span role="alert" className="affiliates-form-error">{error}</span>}
    </span>
  );
}
