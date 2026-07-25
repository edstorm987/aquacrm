"use client";

// Newsletter signup — email capture for the Email plugin's
// newsletter audience. Submits to /api/portal/newsletter/subscribe.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function NewsletterSignupBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Stay in the loop";
  const subheading = (block.props.subheading as string | undefined) ?? "One email a month. New launches, no spam.";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Subscribe";
  const successMessage = (block.props.successMessage as string | undefined) ?? "You're in. Welcome!";

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/portal/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setDone(true);
      else setError("Couldn't subscribe. Try again later.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <section data-block-type="newsletter-signup" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>
        {subheading && <p style={{ opacity: 0.65, fontSize: 14, marginBottom: 24 }}>{subheading}</p>}
        {done ? (
          <p style={{ fontSize: 15, color: "var(--brand-accent, #ff6b35)" }}>✓ {successMessage}</p>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", gap: 8, maxWidth: 420, margin: "0 auto" }}>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                background: "var(--brand-accent, #ff6b35)",
                color: "#fff",
                fontSize: 14, fontWeight: 600,
                border: "none",
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "…" : submitLabel}
            </button>
          </form>
        )}
        {error && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 8 }}>{error}</p>}
      </div>
    </section>
  );
}
