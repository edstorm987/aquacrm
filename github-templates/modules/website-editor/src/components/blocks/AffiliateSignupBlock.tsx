"use client";

// AffiliateSignupBlock — self-serve enrolment form. Posts to
// `/api/portal/affiliates/me/enroll`. T2's @aqua/plugin-affiliates
// declares this block id and delegates rendering here.
//
// Editor mode renders a structural placeholder so layout work doesn't
// require live data.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function AffiliateSignupBlock({ block, editorMode }: BlockRenderProps) {
  const ctaText = (block.props.ctaText as string | undefined) ?? "Earn 10% on every referral";
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editorMode) return;
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/affiliates/me/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          payoutEmail: form.get("email"),
          displayName: form.get("name"),
        }),
      });
      if (res.status === 401) {
        setError("Sign in to enrol as an affiliate.");
      } else if (res.ok) {
        setSubmitted(true);
      } else if (res.status === 404) {
        setError("Affiliate program is not enabled on this site.");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't enrol — try again later.");
      }
    } finally { setSubmitting(false); }
  }

  if (submitted) {
    return (
      <section
        data-block-type="affiliate-signup"
        style={{
          padding: "32px 24px",
          textAlign: "center",
          background: "rgba(40,200,120,0.06)",
          border: "1px solid rgba(40,200,120,0.18)",
          borderRadius: 16,
          ...blockStylesToCss(block.styles),
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>You're in!</p>
        <p style={{ fontSize: 14, opacity: 0.75, margin: 0 }}>
          We'll email you your unique referral link within a few minutes.
        </p>
      </section>
    );
  }

  return (
    <section
      data-block-type="affiliate-signup"
      style={{
        padding: "32px 24px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        ...blockStylesToCss(block.styles),
      }}
    >
      <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>
        {ctaText}
      </p>
      <p style={{ fontSize: 13, opacity: 0.65, margin: "0 0 20px", textAlign: "center" }}>
        Sign up below — we'll send your referral link to your inbox.
      </p>
      <form onSubmit={handleSubmit} aria-label="Affiliate enrolment" style={{ maxWidth: 380, margin: "0 auto", display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Your name</span>
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            disabled={editorMode || submitting}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              fontSize: 14,
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Email address</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            disabled={editorMode || submitting}
            aria-invalid={error ? true : undefined}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              fontSize: 14,
            }}
          />
        </label>
        <button
          type="submit"
          disabled={editorMode || submitting}
          style={{
            minHeight: 44,
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: "var(--brand-accent, #ff6b35)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: editorMode ? "default" : "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Enrolling…" : "Become an affiliate"}
        </button>
        {error && <p role="alert" style={{ fontSize: 12, color: "#ef4444", textAlign: "center", margin: 0 }}>{error}</p>}
      </form>
    </section>
  );
}
