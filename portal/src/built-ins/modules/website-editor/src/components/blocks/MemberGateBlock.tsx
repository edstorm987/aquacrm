"use client";

// Member gate — wraps a section with a "members only" lock. Shows
// the children if the visitor has the required tier; otherwise
// shows a CTA to sign up / upgrade.
//
// Currently consults a localStorage flag set when the visitor signs
// in; once the Memberships plugin's server validation lands this
// will swap to a session check.

import { useEffect, useState } from "react";
import type { Block } from "../../types/block";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function MemberGateBlock({ block, renderChildren }: BlockRenderProps) {
  const requiredTier = (block.props.tier as string | undefined) ?? "free";
  const lockMessage = (block.props.lockMessage as string | undefined) ?? "Members only — sign in or join to read.";
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "Sign in or join";
  const ctaHref = (block.props.ctaHref as string | undefined) ?? "/account?mode=signup";

  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    try {
      const tier = localStorage.getItem("lk_member_tier");
      if (tier && (tier === requiredTier || tier === "paid" /* paid implies free */)) {
        setHasAccess(true);
      }
    } catch { /* sealed-off browser; default to locked */ }
  }, [requiredTier]);

  if (hasAccess) {
    return <>{renderChildren?.(block.children as Block[] | undefined)}</>;
  }

  return (
    <section
      data-block-type="member-gate"
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
          href={ctaHref}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 10,
            background: "var(--brand-accent, #ff6b35)",
            color: "#fff",
            fontSize: 14, fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {ctaLabel}
        </a>
        {requiredTier !== "free" && (
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 12 }}>
            Requires <strong>{requiredTier}</strong> membership.
          </p>
        )}
      </div>
    </section>
  );
}
