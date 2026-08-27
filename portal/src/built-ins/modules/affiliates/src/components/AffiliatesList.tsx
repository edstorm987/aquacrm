"use client";

import { useMemo, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Affiliate, AffiliateStatus } from "../lib/domain";

export interface AffiliatesListProps {
  affiliates: Affiliate[];
  apiBase: string;
  canMutate: boolean;
}

const STATUS_LABEL: Record<AffiliateStatus, string> = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

export function AffiliatesList({ affiliates, apiBase, canMutate }: AffiliatesListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AffiliateStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return affiliates.filter(a => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !`${a.displayName} ${a.payoutEmail}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [affiliates, query, statusFilter]);

  return (
    <section className="affiliates-list">
      <header className="affiliates-list-header">
        <div>
          <h1>Affiliates</h1>
          <p>{affiliates.length === 0 ? "No affiliates yet." : `${filtered.length} of ${affiliates.length}.`}</p>
        </div>
        <div className="affiliates-list-actions">
          <input
            type="search"
            placeholder="Search name / email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as AffiliateStatus | "all")}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="removed">Removed</option>
          </select>
        </div>
      </header>

      {affiliates.length === 0 ? (
        <div className="affiliates-empty" role="status">
          <h3>No affiliates yet</h3>
          <p>Affiliates will appear here once they sign up via your storefront affiliate signup block.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="affiliates-empty" role="status">
          <h3>No matches</h3>
          <p>No affiliates match the current filters.</p>
        </div>
      ) : (
        <ul className="affiliates-grid">
          {filtered.map(a => (
            <li key={a.id}>
              <article className={`affiliates-card affiliates-card-${a.status}`}>
                <header>
                  <h3>{a.displayName}</h3>
                  <span className={`affiliates-pill affiliates-pill-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                </header>
                <p className="affiliates-meta">{a.payoutEmail}</p>
                <p className="affiliates-meta">
                  {a.totalReferred} referrals · {formatTotals(a.lifetimeEarningsByCurrency, a.lifetimeEarnings)} earned
                </p>
                {canMutate && a.status === "pending" && (
                  <ApproveButton apiBase={apiBase} affiliateId={a.id} />
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTotals(byCurrency: Record<string, number> | undefined, legacyTotal: number): string {
  const entries = Object.entries(byCurrency ?? {}).filter(([, amount]) => amount !== 0);
  if (entries.length === 0) return legacyTotal === 0 ? "No paid earnings" : `${(legacyTotal / 100).toFixed(2)} legacy total`;
  return entries.map(([currency, amount]) => {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
    } catch {
      return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  }).join(" · ");
}

function ApproveButton({ apiBase, affiliateId }: { apiBase: string; affiliateId: string }) {
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
            await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/affiliates`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: affiliateId, patch: { status: "active" } }),
            }, {
              fallback: "The affiliate could not be approved.",
              validate: payload => payload.ok === true,
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "The affiliate could not be approved."));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : "Approve"}
      </button>
      {error && <span role="alert" className="affiliates-form-error">{error}</span>}
    </span>
  );
}
