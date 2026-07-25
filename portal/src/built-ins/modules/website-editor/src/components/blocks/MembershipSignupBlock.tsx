"use client";

// MembershipSignupBlock — pricing-tier picker. Lists active plans from
// `/api/portal/memberships/plans` (per-client) and posts to
// `/api/portal/memberships/me/subscribe`. Layout supports horizontal
// (cards in a row) or vertical (cards stacked).
//
// **Round-3 status**: T2's @aqua/plugin-memberships declares this block
// id and delegates rendering here. Round-3 ships a fetching renderer
// against the documented endpoints. Empty plan list → "No plans
// available" placeholder; editor mode always shows the placeholder so
// layout work doesn't require live data.

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
}

export default function MembershipSignupBlock({ block, editorMode }: BlockRenderProps) {
  const layout = (block.props.layout as "horizontal" | "vertical" | undefined) ?? "horizontal";
  const showAnnual = block.props.showAnnual !== false;

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pluginMissing, setPluginMissing] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (editorMode) { setLoading(false); return; }
    let cancelled = false;
    void fetch("/api/portal/memberships/plans", { cache: "no-store", credentials: "include" })
      .then(async r => {
        if (r.status === 404) { setPluginMissing(true); return { plans: [] as MembershipPlan[] }; }
        if (!r.ok) return { plans: [] as MembershipPlan[] };
        return r.json() as Promise<{ plans?: MembershipPlan[] }>;
      })
      .then(data => { if (!cancelled) setPlans(data.plans ?? []); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode]);

  async function subscribe(planId: string) {
    if (editorMode) return;
    setSubmitting(planId);
    setSubmitError(null);
    try {
      const res = await fetch("/api/portal/memberships/me/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId, billing: billingPeriod }),
      });
      if (res.status === 401) {
        setSubmitError("Sign in to subscribe.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const url = (data?.redirectUrl ?? data?.url) as string | undefined;
      if (res.ok && url) {
        window.location.href = url;
        return;
      }
      if (res.ok && !url) {
        // Free-tier path returns no redirect; show success message + reload.
        window.location.reload();
        return;
      }
      setSubmitError(data?.error ?? "Subscription failed — please try again.");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error.");
    } finally { setSubmitting(null); }
  }

  const isHorizontal = layout === "horizontal";
  const containerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isHorizontal ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr",
    gap: 16,
    padding: "32px 24px",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="membership-signup" aria-label="Membership plans" style={containerStyle}>
      {showAnnual && plans.length > 0 && (
        <div role="group" aria-label="Billing period" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setBillingPeriod("monthly")}
            disabled={editorMode}
            aria-pressed={billingPeriod === "monthly"}
            style={{
              minHeight: 36,
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: billingPeriod === "monthly" ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.05)",
              color: billingPeriod === "monthly" ? "#fff" : "rgba(255,255,255,0.7)",
              fontSize: 12,
              cursor: editorMode ? "default" : "pointer",
            }}
          >Monthly</button>
          <button
            type="button"
            onClick={() => setBillingPeriod("annual")}
            disabled={editorMode}
            aria-pressed={billingPeriod === "annual"}
            style={{
              minHeight: 36,
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: billingPeriod === "annual" ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.05)",
              color: billingPeriod === "annual" ? "#fff" : "rgba(255,255,255,0.7)",
              fontSize: 12,
              cursor: editorMode ? "default" : "pointer",
            }}
          >Annual</button>
        </div>
      )}
      {submitError && (
        <div role="alert" style={{ gridColumn: "1 / -1", padding: 12, fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
          {submitError}
        </div>
      )}
      {(loading && !editorMode) ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            gridColumn: "1 / -1",
            display: "grid",
            gridTemplateColumns: isHorizontal ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr",
            gap: 16,
          }}
        >
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Loading plans</span>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 200, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, animation: "aqua-pulse 1.6s ease-in-out infinite" }} aria-hidden />
          ))}
        </div>
      ) : plans.length === 0 ? (
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
          {editorMode
            ? "Membership signup — plans render here when published"
            : pluginMissing
              ? "Memberships are not enabled on this site."
              : "No plans available right now."}
        </div>
      ) : plans.map(plan => {
        const price = billingPeriod === "annual" ? plan.priceAnnual : plan.priceMonthly;
        const currency = plan.currency ?? "USD";
        return (
          <article
            key={plan.id}
            style={{
              padding: 24,
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>{plan.name}</h3>
            {plan.description && <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.7 }}>{plan.description}</p>}
            {price !== undefined && (
              <p style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 700 }}>
                {new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(price / 100)}
                <span style={{ fontSize: 13, opacity: 0.6, fontWeight: 400 }}>/{billingPeriod === "annual" ? "yr" : "mo"}</span>
              </p>
            )}
            {plan.features && plan.features.length > 0 && (
              <ul style={{ margin: "0 0 16px", padding: 0, listStyle: "none", fontSize: 13 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ padding: "4px 0", opacity: 0.85 }}>✓ {f}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => subscribe(plan.id)}
              disabled={editorMode || submitting === plan.id}
              aria-label={`Subscribe to ${plan.name}`}
              style={{
                width: "100%",
                minHeight: 44,
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: "var(--brand-accent, #ff6b35)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: editorMode ? "default" : "pointer",
                opacity: submitting === plan.id ? 0.6 : 1,
              }}
            >
              {submitting === plan.id ? "…" : "Subscribe"}
            </button>
          </article>
        );
      })}
    </section>
  );
}
