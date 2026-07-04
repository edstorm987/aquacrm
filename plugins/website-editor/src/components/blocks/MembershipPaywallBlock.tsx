"use client";

// MembershipPaywallBlock — gates rendered children unless the visitor
// has an active subscription on a plan in `props.requirePlanIds`.
//
// **Round-5 status**: real fetch against `GET /api/portal/memberships/me`.
// Renders one of three states:
//   - editor mode → always shows children + a notice strip
//   - loading → no flicker; renders nothing while the fetch is in flight
//   - active subscription matches → renders children
//   - no/wrong subscription → renders an "Upgrade to access" CTA
// Returns gracefully when the memberships plugin isn't installed
// (404 / 401 → upgrade CTA with a soft "Members only" message).

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface MeSubscription {
  status: "trialing" | "active" | "past_due" | "canceled" | "paused" | "incomplete";
  planId: string;
  currentPeriodEnd?: number;
}

interface MeResponse {
  subscription?: MeSubscription;
}

const ACTIVE_STATES = new Set(["trialing", "active"]);

export default function MembershipPaywallBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const requirePlanIds = (block.props.requirePlanIds as string[] | undefined) ?? [];
  const lockMessage = (block.props.lockMessage as string | undefined) ?? "Members only — upgrade to access this content.";
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "See plans";
  const upgradeUrl = (block.props.upgradeUrl as string | undefined) ?? "/membership";

  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (editorMode) { setLoading(false); return; }
    let cancelled = false;
    void fetch("/api/portal/memberships/me", { cache: "no-store", credentials: "include" })
      .then(async r => {
        if (!r.ok) return null;
        return r.json() as Promise<MeResponse>;
      })
      .then(data => {
        if (cancelled) return;
        const sub = data?.subscription;
        if (sub && ACTIVE_STATES.has(sub.status)) {
          if (requirePlanIds.length === 0 || requirePlanIds.includes(sub.planId)) {
            setHasAccess(true);
          }
        }
      })
      .catch(() => { /* silent — treat as locked */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [editorMode, requirePlanIds]);

  if (editorMode) {
    return (
      <>
        <div
          style={{
            padding: "8px 12px",
            margin: "0 0 8px",
            borderRadius: 6,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.25)",
            color: "rgba(220,252,231,0.9)",
            fontSize: 11,
            display: "inline-block",
          }}
        >
          🔒 Paywall — gated for members. Children render below in editor mode.
        </div>
        {renderChildren?.(block.children)}
      </>
    );
  }

  if (loading) return null;
  if (hasAccess) return <>{renderChildren?.(block.children)}</>;

  return (
    <section
      data-block-type="membership-paywall"
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.15)",
        borderRadius: 16,
        ...blockStylesToCss(block.styles),
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <p style={{ fontSize: 32, marginBottom: 16 }}>🔒</p>
        <p style={{ fontSize: 15, opacity: 0.85, marginBottom: 16 }}>{lockMessage}</p>
        <a
          href={upgradeUrl}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 10,
            background: "var(--brand-accent, #ff6b35)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}
