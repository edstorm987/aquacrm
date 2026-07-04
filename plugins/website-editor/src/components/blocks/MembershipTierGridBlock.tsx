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

export default function MembershipTierGridBlock({ block, editorMode }: BlockRenderProps) {
  const columns = (block.props.columns as number | undefined) ?? 3;
  const highlightPlanId = block.props.highlightPlanId as string | undefined;

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (editorMode) { setLoading(false); return; }
    let cancelled = false;
    void fetch("/api/portal/memberships/plans", { cache: "no-store", credentials: "include" })
      .then(r => r.ok ? r.json() as Promise<{ plans?: MembershipPlan[] }> : { plans: [] })
      .then(data => { if (!cancelled) setPlans(data.plans ?? []); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode]);
  void loading;

  const containerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 24,
    padding: "32px 24px",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="membership-tier-grid" style={containerStyle}>
      {plans.length === 0 ? (
        <div
          style={{
            gridColumn: "1 / -1",
            padding: 24,
            textAlign: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            border: "1px dashed rgba(255,255,255,0.15)",
            borderRadius: 12,
          }}
        >
          {editorMode ? "Membership tier grid — tiers render here when published" : "No tiers available right now."}
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
