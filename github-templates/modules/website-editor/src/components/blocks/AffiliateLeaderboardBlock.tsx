"use client";

// AffiliateLeaderboardBlock — top earners table. Reads
// `/api/portal/affiliates/leaderboard?limit=N`. Editor mode renders a
// structural placeholder.
//
// T2's @aqua/plugin-affiliates declares this block id; rendering is
// delegated to T3.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface LeaderboardRow {
  rank: number;
  name: string;
  totalReferred: number;
  lifetimeEarningsCents: number;
  currency?: string;
}

export default function AffiliateLeaderboardBlock({ block, editorMode }: BlockRenderProps) {
  const limit = (block.props.limit as number | undefined) ?? 10;
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(!editorMode);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (editorMode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Q-ASSUMED (R5): T2's @aqua/plugin-affiliates doesn't yet expose
    // a /leaderboard endpoint. The block degrades gracefully when 404
    // — empty state with a placeholder. T2 R10 follow-up: add
    // /leaderboard returning top-N by lifetimeEarnings.
    void fetch(`/api/portal/affiliates/leaderboard?limit=${encodeURIComponent(limit)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async r => {
        if (r.status === 404) return { rows: [] as LeaderboardRow[] };
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ rows?: LeaderboardRow[] }>;
      })
      .then(data => { if (!cancelled) setRows(data.rows ?? []); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Network error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode, limit, retryNonce]);

  const containerStyle: React.CSSProperties = {
    padding: 24,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="affiliate-leaderboard" aria-label="Top affiliates leaderboard" style={containerStyle}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)", margin: "0 0 8px" }}>
        Top affiliates
      </p>
      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", position: "relative" }}>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Loading leaderboard</span>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 24, background: "rgba(255,255,255,0.05)", borderRadius: 6, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
          ))}
        </div>
      ) : error ? (
        <div role="alert" style={{ padding: "16px 0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <p style={{ fontSize: 13, color: "#fca5a5", margin: 0 }}>Couldn&apos;t load the leaderboard.</p>
          <button
            type="button"
            onClick={() => setRetryNonce(n => n + 1)}
            style={{ minHeight: 36, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0, padding: "16px 0" }}>
          {editorMode ? "Leaderboard rows render here when published" : "No data yet — be the first!"}
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ fontSize: 11, opacity: 0.5, textAlign: "left" }}>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>Rank</th>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>Affiliate</th>
              <th style={{ padding: "6px 0", fontWeight: 600, textAlign: "right" }}>Referrals</th>
              <th style={{ padding: "6px 0", fontWeight: 600, textAlign: "right" }}>Lifetime</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const currency = row.currency ?? "GBP";
              return (
                <tr key={row.rank} style={{ fontSize: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "10px 0", fontWeight: 600, opacity: row.rank <= 3 ? 1 : 0.7 }}>#{row.rank}</td>
                  <td style={{ padding: "10px 0" }}>{row.name}</td>
                  <td style={{ padding: "10px 0", textAlign: "right", opacity: 0.85 }}>{row.totalReferred.toLocaleString()}</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600 }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(row.lifetimeEarningsCents / 100)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
