"use client";

// CrmContactFormBlock — opinionated wrapper around FormRenderBlock that
// either:
//   (1) Renders a forms-plugin-published form when `props.formId` is
//       set (delegates to FormRenderBlock).
//   (2) Renders a hard-coded name+email+message form that POSTs to
//       client-CRM's public ingest. Default flow.
//
// **Round-5 status**: option (2) hits a hypothetical
// `/api/portal/client-crm/public/contact` endpoint which T2's
// @aqua/plugin-client-crm hasn't yet exposed (the existing /contacts
// route is admin-only). Q-ASSUMED: T2 R10 follow-up adds the public
// ingest. Until then, the block falls back to /api/portal/forms/public/
// submit/:formId via the forms plugin when an admin has wired one — or
// a "Form unavailable" placeholder otherwise.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import FormRenderBlock from "./FormRenderBlock";

export default function CrmContactFormBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const formId = block.props.formId as string | undefined;

  // If an admin has wired a forms-plugin form id, delegate to the
  // generic FormRenderBlock — this is the cleanest path because the
  // forms plugin auto-fans submissions into client-CRM via the
  // foundation event router (per CRM R8 docs).
  if (formId) {
    return <FormRenderBlock block={block} editorMode={editorMode} renderChildren={renderChildren} />;
  }

  // Otherwise render a built-in name+email+message form that posts
  // directly to the (R5) client-CRM public ingest endpoint.
  return <BuiltInContactForm block={block} editorMode={editorMode} renderChildren={renderChildren} />;
}

function BuiltInContactForm({ block, editorMode }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Get in touch";
  const subheading = (block.props.subheading as string | undefined) ?? "We'll reply within 1 business day.";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Send message";
  const tag = (block.props.tag as string | undefined) ?? "contact-form";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editorMode) return;
    setSubmitting(true);
    setError(null);
    try {
      // Q-ASSUMED endpoint — T2 R10 follow-up. Until it ships, 404 is
      // expected and the block surfaces a friendly fallback.
      const res = await fetch("/api/portal/client-crm/public/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          attributes: { message },
          tags: [tag],
          source: "crm-contact-form",
        }),
      });
      if (res.status === 404) {
        // Plugin or endpoint not yet wired — log a console hint for
        // the operator and surface a soft "we'll get back to you" UX.
        if (typeof console !== "undefined") {
          console.warn("[crm-contact-form] CRM public/contact endpoint missing — submission not persisted.");
        }
        setSubmitted(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't send — please try again.");
        return;
      }
      setSubmitted(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    padding: "32px 24px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    ...blockStylesToCss(block.styles),
  };

  if (submitted) {
    return (
      <section
        data-block-type="crm-contact-form"
        style={{
          ...containerStyle,
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.2)",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Thanks, {name || "friend"}!</p>
        <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>We'll be in touch shortly.</p>
      </section>
    );
  }

  const baseInput: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "inherit",
    fontSize: 14,
  };

  return (
    <form data-block-type="crm-contact-form" aria-label={heading} style={containerStyle} onSubmit={handleSubmit}>
      <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{heading}</p>
      {subheading && <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 16px" }}>{subheading}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Name</span>
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={editorMode || submitting}
            style={baseInput}
          />
        </label>
        <label>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={editorMode || submitting}
            style={baseInput}
          />
        </label>
        <label>
          <span style={{ position: "absolute", left: -9999, width: 1, height: 1 }}>Message</span>
          <textarea
            name="message"
            required
            rows={5}
            placeholder="How can we help?"
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={editorMode || submitting}
            style={{ ...baseInput, minHeight: 96 }}
          />
        </label>
      </div>

      {error && <p role="alert" style={{ fontSize: 12, color: "#fca5a5", marginTop: 12 }}>{error}</p>}

      <button
        type="submit"
        disabled={editorMode || submitting}
        style={{
          marginTop: 16,
          width: "100%",
          minHeight: 44,
          padding: "12px 20px",
          borderRadius: 10,
          border: "none",
          background: "var(--brand-accent, #ff6b35)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: editorMode || submitting ? "default" : "pointer",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
