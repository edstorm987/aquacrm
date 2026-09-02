"use client";

// Newsletter signup — email capture through the website editor's own narrow
// public visitor facade (`visitor/newsletter`). The facade stores one
// consent-bearing subscriber per address for the site owner to read. Nothing
// here sends an email or talks to a campaign provider, so the copy must not
// claim either.

import { useId, useRef, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { parseVisitorNewsletterReceipt } from "../../lib/visitorNewsletterReceipt";
import {
  VISITOR_NEWSLETTER_CONSENT_PURPOSE,
  normaliseVisitorNewsletterConsentStatement,
  visitorNewsletterConsentDigest,
} from "../../lib/visitorNewsletterConsent";

export default function NewsletterSignupBlock({ block, context, editorMode }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Stay in the loop";
  const subheading = (block.props.subheading as string | undefined) ?? "One email a month. New launches, no spam.";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Subscribe";
  const successMessage = (block.props.successMessage as string | undefined) ?? "You're in. Welcome!";
  const consentLabel = normaliseVisitorNewsletterConsentStatement(block.props.consentLabel);
  const consentVersion = Number.isSafeInteger(block.props.consentVersion)
    ? Number(block.props.consentVersion)
    : 1;
  // Only a genuinely published mount may write. The editor canvas and the
  // draft preview carry the same ids for fidelity, and must stay inert.
  const connected = Boolean(
    context?.agencyId
    && context.clientId
    && context.siteId
    && context.pageId
    && context.publishedWebsite === true
    && !editorMode,
  );

  const [email, setEmail] = useState("");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One operation id per attempt. It survives a refusal so retrying the same
  // details replays the same operation instead of minting a second one, and
  // it is released only once a success receipt has actually been parsed.
  const operationId = useRef<string | null>(null);
  const errorId = useId();
  const consentId = useId();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!connected || !context?.clientId || !context.siteId || !context.pageId) {
      setError("Sign-up is available on the published page.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    // Honeypot — bots fill it, humans don't see it. Nothing is sent.
    if (fd.get("website")) { setDone(true); return; }
    if (!consented) {
      setError("Please tick the box to agree before subscribing.");
      return;
    }
    setBusy(true); setError(null);
    operationId.current ??= globalThis.crypto?.randomUUID?.()
      ?? `newsletter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const params = new URLSearchParams({
      agencyId: context.agencyId,
      clientId: context.clientId,
    });
    try {
      const consentStatementDigest = await visitorNewsletterConsentDigest(consentLabel);
      const res = await fetch(`/api/portal/website-editor/visitor/newsletter?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          operationId: operationId.current,
          siteId: context.siteId,
          pageId: context.pageId,
          blockId: block.id,
          email,
          consent: {
            agreed: consented,
            purpose: VISITOR_NEWSLETTER_CONSENT_PURPOSE,
            version: consentVersion,
            statementDigest: consentStatementDigest,
          },
          honeypot: String(fd.get("website") ?? ""),
        }),
      });
      const reply = await res.json().catch(() => null) as unknown;
      const receipt = res.ok ? parseVisitorNewsletterReceipt(reply) : null;
      if (receipt) {
        // The only place the form is cleared: a refusal keeps the address and
        // the operation id in place so the visitor can simply try again.
        setDone(true);
        operationId.current = null;
        setEmail("");
        setConsented(false);
      } else if (res.status === 429) {
        setError("Too many sign-ups from here just now. Please try again later.");
      } else {
        setError("Couldn't subscribe right now. Your address is still here — please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    fontSize: 14,
  };

  return (
    <section data-block-type="newsletter-signup" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>
        {subheading && <p style={{ opacity: 0.65, fontSize: 14, marginBottom: 24 }}>{subheading}</p>}
        {done ? (
          <p role="status" style={{ fontSize: 15, color: "var(--brand-accent, #ff6b35)" }}><span aria-hidden>✓ </span>{successMessage}</p>
        ) : (
          <form
            onSubmit={submit}
            aria-busy={busy}
            style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420, margin: "0 auto" }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {/* The placeholder is a hint, not a name. */}
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-label="Your email address"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder="you@example.com"
                style={inputStyle}
              />
              <button
                type="submit"
                disabled={busy || !connected}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "var(--brand-accent, #ff6b35)",
                  color: "#fff",
                  fontSize: 14, fontWeight: 600,
                  border: "none",
                  cursor: busy ? "wait" : connected ? "pointer" : "not-allowed",
                  opacity: busy || !connected ? 0.6 : 1,
                }}
              >
                {busy ? "Subscribing…" : connected ? submitLabel : "Available when published"}
              </button>
            </div>
            {/* The consent sentence is the exact wording the server binds the
                sign-up to; it has to be visible, not implied by the button. */}
            <label htmlFor={consentId} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.45, textAlign: "left" }}>
              <input
                id={consentId}
                type="checkbox"
                name="newsletterConsent"
                value="yes"
                required
                checked={consented}
                onChange={e => setConsented(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>{consentLabel}</span>
            </label>
            {/* Honeypot */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: "absolute", left: -9999, opacity: 0, height: 0, width: 0 }} />
            {error && <p role="alert" id={errorId} style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
