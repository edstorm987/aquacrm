"use client";

// AffiliateSignupBlock — self-serve enrolment form. Posts to
// `/api/portal/affiliates/me/enroll`. T2's @aqua/plugin-affiliates
// declares this block id and delegates rendering here.
//
// Editor mode renders a structural placeholder so layout work doesn't
// require live data.
//
// ── The success message says what the endpoint actually does ─────────────
//
// It used to end on "We'll email you your unique referral link within a few
// minutes." Nothing sends that email: `meEnrollHandler`
// (`src/built-ins/modules/affiliates/src/api/handlers.ts`) calls
// `affiliates.enroll()`, which writes ONE row with `status: "pending"` and no
// referral code at all — there is no mailer, queue or outbox anywhere in the
// affiliates module. The applicant would wait for a message that was never
// going to arrive, then assume the site was broken.
//
// The honest version reports the enrolment's real status, which the handler
// already returns in its 201 body, and points at the account page where the
// referral code is actually created (`me/codes`). Promising the email again
// is only allowed once something enqueues it.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// One entry per member of `AffiliateStatus`
// (`src/built-ins/modules/affiliates/src/lib/domain.ts`). `enroll()` does NOT
// always return a fresh `pending` row: when the same user re-submits matching
// details it returns the EXISTING affiliate, whatever state it is in — so
// "waiting for the site owner to approve it" is only true for `pending`.
// Saying it for a suspended or removed account invents a queue position that
// does not exist, which is the same defect as the email that was never sent.
const ENROLLED_COPY: Record<string, { heading: string; detail: string }> = {
  active: {
    heading: "You're in!",
    detail: "Your affiliate account is active — create your referral link in your account.",
  },
  pending: {
    heading: "Application received",
    detail: "Your application is recorded and waiting for the site owner to approve it. Nothing is sent by email; your referral link appears in your account once it's approved.",
  },
  suspended: {
    heading: "Enrolment on hold",
    detail: "Your affiliate account is suspended, so no referral link is issued. Nothing is sent by email — contact the site owner to have it reviewed.",
  },
  removed: {
    heading: "Enrolment closed",
    detail: "Your affiliate account has been removed, so no referral link is issued. Nothing is sent by email — contact the site owner if that is wrong.",
  },
};

// The server accepted the enrolment but named no status. Report exactly that
// rather than guessing the most flattering one.
const UNREPORTED_STATUS_COPY = {
  heading: "Enrolment recorded",
  detail: "The site accepted your enrolment but didn't report its status. Nothing is sent by email; check your account for the current state.",
};

export default function AffiliateSignupBlock({ block, editorMode }: BlockRenderProps) {
  const ctaText = (block.props.ctaText as string | undefined) ?? "Earn 10% on every referral";
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // The status the server gave the new enrolment — "pending" until a site
  // admin approves it. Rendered rather than assumed.
  const [enrolledStatus, setEnrolledStatus] = useState<string | null>(null);
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
        const data = await res.json().catch(() => ({}));
        setEnrolledStatus((data?.affiliate?.status as string | undefined) ?? null);
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
    const copy = (enrolledStatus ? ENROLLED_COPY[enrolledStatus] : undefined) ?? UNREPORTED_STATUS_COPY;
    // Green reads as "done". Only an active account is done; the rest are
    // recorded-but-not-earning, so they get a neutral frame.
    const isGood = enrolledStatus === "active";
    return (
      <section
        data-block-type="affiliate-signup"
        style={{
          padding: "32px 24px",
          textAlign: "center",
          background: isGood ? "rgba(40,200,120,0.06)" : "rgba(255,255,255,0.03)",
          border: isGood ? "1px solid rgba(40,200,120,0.18)" : "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          ...blockStylesToCss(block.styles),
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>{copy.heading}</p>
        <p style={{ fontSize: 14, opacity: 0.75, margin: 0 }}>{copy.detail}</p>
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
        Sign up below — your application goes to the site owner for approval.
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
