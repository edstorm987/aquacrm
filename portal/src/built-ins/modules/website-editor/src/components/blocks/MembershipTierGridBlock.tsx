"use client";

// MembershipTierGridBlock — visual grid of all active plans with feature
// bullets and CTAs. Reads `/api/portal/memberships/plans` and renders
// each plan as a card with a "Choose" CTA that posts to
// `/api/portal/memberships/me/subscribe`.
//
// **Round-3 status**: T2's @aqua/plugin-memberships declares this block
// id and delegates rendering here. Same data shape as MembershipSignupBlock
// but with a wider visual grid + per-plan highlight state. Editor mode
// renders a structural placeholder so layout work doesn't require live
// data.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { classifyBlockFetch, type BlockFetchOutcome } from "../../lib/blockBackends";

interface MembershipPlan {
  id: string;
  name: string;
  description?: string;
  priceMonthly?: number;
  priceAnnual?: number;
  currency?: string;
  features?: string[];
  isHighlight?: boolean;
}

// One sentence per outcome. Only "ok" is allowed to say the catalogue is
// empty; the other three say what actually happened instead.
const EMPTY_NOTICE: Record<BlockFetchOutcome, string> = {
  ok: "No tiers available right now.",
  unavailable: "Memberships are not enabled on this site.",
  unauthorized: "Membership tiers aren't published to visitors on this site yet.",
  failed: "Couldn't load membership tiers.",
};

const NOTICE_STYLE: React.CSSProperties = {
  gridColumn: "1 / -1",
  padding: 24,
  textAlign: "center",
  color: "rgba(255,255,255,0.55)",
  fontSize: 13,
  border: "1px dashed rgba(255,255,255,0.15)",
  borderRadius: 12,
};

export default function MembershipTierGridBlock({ block, editorMode }: BlockRenderProps) {
  const columns = (block.props.columns as number | undefined) ?? 3;
  const highlightPlanId = block.props.highlightPlanId as string | undefined;

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // "No tiers available" is a claim about the catalogue. It may only be made
  // when the backend actually answered — see classifyBlockFetch.
  const [outcome, setOutcome] = useState<BlockFetchOutcome>("ok");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (editorMode) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetch("/api/portal/memberships/plans", { cache: "no-store", credentials: "include" })
      .then(async r => {
        const result = classifyBlockFetch(r);
        if (!cancelled) setOutcome(result);
        if (result !== "ok") return { plans: [] as MembershipPlan[] };
        return r.json() as Promise<{ plans?: MembershipPlan[] }>;
      })
      .then(data => { if (!cancelled) setPlans(data.plans ?? []); })
      .catch(() => { if (!cancelled) { setOutcome("failed"); setPlans([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode, retryNonce]);

  const containerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 24,
    padding: "32px 24px",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="membership-tier-grid" style={containerStyle}>
      {(loading && !editorMode) ? (
        <div role="status" aria-live="polite" aria-busy="true" style={NOTICE_STYLE}>
          Loading membership tiers…
        </div>
      ) : plans.length === 0 ? (
        <div style={NOTICE_STYLE} role={outcome === "failed" ? "alert" : undefined}>
          <p style={{ margin: 0 }}>
            {editorMode ? "Membership tier grid — tiers render here when published" : EMPTY_NOTICE[outcome]}
          </p>
          {!editorMode && outcome === "failed" && (
            <button
              type="button"
              onClick={() => setRetryNonce(n => n + 1)}
              style={{ marginTop: 12, minHeight: 36, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              Retry
            </button>
          )}
        </div>
      ) : plans.map(plan => {
        const isHighlight = (highlightPlanId && plan.id === highlightPlanId) || plan.isHighlight;
        const currency = plan.currency ?? "USD";
        return (
          <article
            key={plan.id}
            style={{
              padding: 28,
              borderRadius: 16,
              background: isHighlight ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.03)",
              border: isHighlight ? "1px solid rgba(255,107,53,0.4)" : "1px solid rgba(255,255,255,0.08)",
              transform: isHighlight ? "scale(1.04)" : "none",
              transition: "transform 200ms ease",
            }}
          >
            {isHighlight && (
              <p style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-accent, #ff6b35)" }}>
                Most popular
              </p>
            )}
            <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>{plan.name}</h3>
            {plan.description && <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.7 }}>{plan.description}</p>}
            {plan.priceMonthly !== undefined && (
              <p style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 700 }}>
                {new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(plan.priceMonthly / 100)}
                <span style={{ fontSize: 13, opacity: 0.6, fontWeight: 400 }}>/mo</span>
              </p>
            )}
            {plan.features && plan.features.length > 0 && (
              <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none", fontSize: 13 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ padding: "6px 0", opacity: 0.85 }}>✓ {f}</li>
                ))}
              </ul>
            )}
            <a
              href={`/membership?plan=${encodeURIComponent(plan.id)}`}
              style={{
                display: "block",
                padding: "12px 20px",
                borderRadius: 10,
                background: isHighlight ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.06)",
                color: isHighlight ? "#fff" : "rgba(255,255,255,0.85)",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Choose {plan.name}
            </a>
          </article>
        );
      })}
    </section>
  );
}
