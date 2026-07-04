"use client";

// AffiliatePayoutMeterBlock — visual gauge of earnings + next payout
// date. Reads `/api/portal/affiliates/me` (or returns empty for
// anonymous visitors). Editor mode renders a structural placeholder.
//
// T2's @aqua/plugin-affiliates declares this block id; rendering is
// delegated to T3 per architecture.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface AffiliateSummary {
  status: string;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  currency?: string;
  nextPayoutAt?: number;
  totalReferred?: number;
}

export default function AffiliatePayoutMeterBlock({ block, editorMode }: BlockRenderProps) {
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [loading, setLoading] = useState(!editorMode);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (editorMode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/portal/affiliates/me", { cache: "no-store", credentials: "include" })
      .then(async r => {
        if (r.status === 401 || r.status === 404) return { affiliate: null } as { affiliate: null };
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ affiliate?: AffiliateSummary | null; attributions?: { status: string; commissionCents: number }[]; payouts?: { status: string; amountCents: number; scheduledFor?: number }[] }>;
      })
      .then(data => {
        if (cancelled) return;
        if (!data?.affiliate) { setSummary(null); return; }
        const pendingCents = (data.attributions ?? []).filter(a => a.status === "pending").reduce((acc, a) => acc + (a.commissionCents ?? 0), 0);
        const approvedCents = (data.attributions ?? []).filter(a => a.status === "approved").reduce((acc, a) => acc + (a.commissionCents ?? 0), 0);
        const paidCents = (data.payouts ?? []).filter(p => p.status === "completed").reduce((acc, p) => acc + (p.amountCents ?? 0), 0);
        const nextScheduledPayout = (data.payouts ?? []).filter(p => p.status === "scheduled" || p.status === "in_progress").sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))[0];
        setSummary({
          ...data.affiliate,
          pendingCents,
          approvedCents,
          paidCents,
          nextPayoutAt: nextScheduledPayout?.scheduledFor,
        });
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Network error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode, retryNonce]);

  const fmt = (cents: number, currency = "GBP") =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);

  const containerStyle: React.CSSProperties = {
    padding: 24,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    ...blockStylesToCss(block.styles),
  };

  if (loading) {
    return (
      <section data-block-type="affiliate-payout-meter" aria-label="Affiliate payout meter" style={containerStyle}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)", margin: "0 0 8px" }}>
          Payout meter
        </p>
        <div role="status" aria-live="polite" aria-busy="true" style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Loading earnings</span>
          <div style={{ height: 32, width: "60%", background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 8, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
          <div style={{ height: 14, width: "80%", background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 14, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
          <div style={{ height: 8, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 4, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section data-block-type="affiliate-payout-meter" aria-label="Affiliate payout meter" style={containerStyle}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)", margin: "0 0 8px" }}>
          Payout meter
        </p>
        <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <p style={{ fontSize: 13, color: "#fca5a5", margin: 0 }}>Couldn&apos;t load your earnings.</p>
          <button
            type="button"
            onClick={() => setRetryNonce(n => n + 1)}
            style={{ minHeight: 36, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (editorMode || !summary) {
    return (
      <section data-block-type="affiliate-payout-meter" aria-label="Affiliate payout meter" style={containerStyle}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)", margin: "0 0 8px" }}>
          Payout meter
        </p>
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
          {editorMode ? "Live earnings render here when published" : "Sign in to see your earnings."}
        </p>
      </section>
    );
  }

  const total = summary.pendingCents + summary.approvedCents;
  const approvedPct = total > 0 ? Math.round((summary.approvedCents / total) * 100) : 0;
  const currency = summary.currency ?? "GBP";

  return (
    <section data-block-type="affiliate-payout-meter" style={containerStyle}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)", margin: "0 0 8px" }}>
        Your earnings
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>
        {fmt(summary.approvedCents, currency)}
        <span style={{ fontSize: 13, opacity: 0.55, fontWeight: 400, marginLeft: 6 }}>
          approved
        </span>
      </p>
      <p style={{ fontSize: 13, opacity: 0.65, margin: "0 0 16px" }}>
        + {fmt(summary.pendingCents, currency)} pending · {fmt(summary.paidCents, currency)} paid lifetime
      </p>
      {/* Approved-vs-pending bar */}
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${approvedPct}%`, height: "100%", background: "var(--brand-accent, #ff6b35)" }} />
      </div>
      {summary.nextPayoutAt && (
        <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>
          Next payout: {new Date(summary.nextPayoutAt).toLocaleDateString()}
        </p>
      )}
      {summary.totalReferred !== undefined && (
        <p style={{ fontSize: 12, opacity: 0.55, margin: "4px 0 0" }}>
          Total referred: {summary.totalReferred}
        </p>
      )}
    </section>
  );
}
