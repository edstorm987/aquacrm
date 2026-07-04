"use client";

// Contact form block — name, email, message + optional phone. Submits
// to the Forms plugin's submission endpoint (when installed) which
// can forward via webhook + email notification.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function ContactFormBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Get in touch";
  const subheading = (block.props.subheading as string | undefined) ?? "We'll get back to you within 1 business day.";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Send message";
  const showPhone = (block.props.showPhone as boolean | undefined) ?? true;
  const formName = (block.props.formName as string | undefined) ?? "contact";

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    // Honeypot — bots fill it, humans don't see it.
    if (fd.get("website")) { setSent(true); setBusy(false); return; }
    const payload = Object.fromEntries(fd.entries());
    try {
      const res = await fetch("/api/portal/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formName, fields: payload }),
      });
      if (res.ok) {
        setSent(true);
        e.currentTarget.reset();
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
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <p style={{ fontSize: 36 }}>✓</p>
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
          <input type="text" name="name" placeholder="Your name" required style={inputStyle} />
          <input type="email" name="email" placeholder="you@example.com" required style={inputStyle} />
          {showPhone && <input type="tel" name="phone" placeholder="Phone (optional)" style={inputStyle} />}
          <textarea name="message" rows={5} placeholder="Your message" required style={inputStyle} />
          {/* Honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off"
            style={{ position: "absolute", left: -9999, opacity: 0, height: 0, width: 0 }} />
          {error && <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>}
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: "var(--brand-accent, #ff6b35)",
              color: "#fff",
              fontSize: 14, fontWeight: 600,
              border: "none",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Sending…" : submitLabel}
          </button>
        </form>
      </div>
    </section>
  );
}
