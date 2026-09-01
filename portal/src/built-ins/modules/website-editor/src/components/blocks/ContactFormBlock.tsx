"use client";

// Contact form block — name, email, message + optional phone. Submits through
// the website editor's narrow public visitor facade; the generic form/webhook
// operator route remains session-gated.

import { useRef, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { parseVisitorContactReceipt } from "../../lib/visitorContactReceipt";
import {
  normaliseVisitorContactConsentStatement,
  visitorContactConsentDigest,
} from "../../lib/visitorContactConsent";

export default function ContactFormBlock({ block, context, editorMode }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Get in touch";
  const subheading = (block.props.subheading as string | undefined) ?? "We'll get back to you within 1 business day.";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Send message";
  const showPhone = (block.props.showPhone as boolean | undefined) ?? true;
  const consentLabel = normaliseVisitorContactConsentStatement(block.props.consentLabel);
  const consentVersion = Number.isSafeInteger(block.props.consentVersion)
    ? Number(block.props.consentVersion)
    : 1;
  const connected = Boolean(
    context?.agencyId
    && context.clientId
    && context.siteId
    && context.pageId
    && context.publishedWebsite === true
    && !editorMode,
  );

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!connected || !context?.clientId || !context.siteId || !context.pageId) {
      setError("This form is available on the published page.");
      return;
    }
    setBusy(true); setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    // Honeypot — bots fill it, humans don't see it.
    if (fd.get("website")) { setSent(true); setBusy(false); return; }
    operationId.current ??= globalThis.crypto?.randomUUID?.()
      ?? `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const params = new URLSearchParams({
      agencyId: context.agencyId,
      clientId: context.clientId,
    });
    try {
      const consentStatementDigest = await visitorContactConsentDigest(consentLabel);
      const res = await fetch(`/api/portal/website-editor/visitor/contact?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          operationId: operationId.current,
          siteId: context.siteId,
          pageId: context.pageId,
          blockId: block.id,
          contact: {
            name: fd.get("name"),
            email: fd.get("email"),
            phone: fd.get("phone"),
            message: fd.get("message"),
          },
          consent: {
            agreed: fd.get("contactConsent") === "yes",
            purpose: "contact-request",
            version: consentVersion,
            statementDigest: consentStatementDigest,
          },
          website: fd.get("website"),
        }),
      });
      const reply = await res.json().catch(() => null) as unknown;
      const receipt = res.ok ? parseVisitorContactReceipt(reply) : null;
      if (receipt) {
        setSent(true);
        operationId.current = null;
        form.reset();
      } else {
        setError("Couldn't send. Please email us directly.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section data-block-type="contact-form" style={{ padding: "64px 24px", textAlign: "center", ...blockStylesToCss(block.styles) }}>
        <div role="status" style={{ maxWidth: 480, margin: "0 auto" }}>
          <p aria-hidden style={{ fontSize: 36 }}>✓</p>
          <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Thanks!</h2>
          <p style={{ opacity: 0.7 }}>We&apos;ve got your message — we&apos;ll get back to you shortly.</p>
        </div>
      </section>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    fontSize: 14,
  };

  return (
    <section data-block-type="contact-form" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, marginBottom: 6, textAlign: "center" }}>{heading}</h2>
        {subheading && <p style={{ opacity: 0.65, fontSize: 14, textAlign: "center", marginBottom: 24 }}>{subheading}</p>}
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Placeholders are hints, not names — every field carries its own
              accessible name so a screen reader announces it once focused. */}
          <input type="text" name="name" aria-label="Your name" placeholder="Your name" required style={inputStyle} />
          <input type="email" name="email" aria-label="Your email address" placeholder="you@example.com" required style={inputStyle} />
          {showPhone && <input type="tel" name="phone" aria-label="Phone (optional)" placeholder="Phone (optional)" style={inputStyle} />}
          <textarea name="message" rows={5} aria-label="Your message" placeholder="Your message" required style={inputStyle} />
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.45 }}>
            <input type="checkbox" name="contactConsent" value="yes" required style={{ marginTop: 2 }} />
            <span>{consentLabel}</span>
          </label>
          {/* Honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off"
            style={{ position: "absolute", left: -9999, opacity: 0, height: 0, width: 0 }} />
          {error && <p role="alert" style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>}
          <button
            type="submit"
            disabled={busy || !connected}
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: "var(--brand-accent, #ff6b35)",
              color: "#fff",
              fontSize: 14, fontWeight: 600,
              border: "none",
              cursor: busy ? "wait" : connected ? "pointer" : "not-allowed",
              opacity: busy || !connected ? 0.6 : 1,
            }}
          >
            {busy ? "Sending…" : connected ? submitLabel : "Available when published"}
          </button>
        </form>
      </div>
    </section>
  );
}
