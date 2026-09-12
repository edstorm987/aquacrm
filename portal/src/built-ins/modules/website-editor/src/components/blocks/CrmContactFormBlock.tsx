"use client";

// CrmContactFormBlock — opinionated wrapper around FormRenderBlock that
// either:
//   (1) Renders a forms-plugin-published form when `props.formId` is
//       set (delegates to FormRenderBlock).
//   (2) Renders a hard-coded name+email+message form that POSTs to the
//       public enquiry ingest. Default flow.
//
// ─── Q-ASSUMED endpoint, resolved 2026-08-20 ─────────────────────────────
//
// Option (2) used to POST to `/api/portal/client-crm/public/contact`, an
// endpoint the block's own comment described as hypothetical ("Q-ASSUMED: T2
// R10 follow-up adds the public ingest"). It was never built. Worse than
// missing: the block treated the resulting 404 as SUCCESS — it showed the
// visitor "Thanks, we'll be in touch shortly" and dropped the message on the
// floor, with only a `console.warn` nobody reads. Every enquiry through this
// block since it shipped was lost silently.
//
// It now posts to `/api/public/contact`, which exists, is public, is
// rate-limited and honeypotted, and deposits the enquiry as a LEAD in
// leads-pipeline via `leads.upsert` — the same machinery
// `/api/public/brand-enquiry` and the signup block's form branch use. No new
// endpoint was built for this, and a failure is now shown to the visitor
// instead of being dressed up as a success.
//
// KNOWN LIMIT, worth an operator's attention: `/api/public/contact` files the
// lead against the founder agency (`FOUNDER_AGENCY_SLUG`), not against a
// per-client CRM install. That is today's behaviour of the app's public
// contact ingest, and it is honest capture rather than silent loss. When
// per-client public ingest lands, point `ENDPOINT` at it.

import { useRef, useState } from "react";
import {
  BotChallenge,
  type BotChallengeHandle,
  usePublicBotChallengeConfig,
} from "@/components/security/BotChallenge";
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
  // directly to the app's public enquiry ingest.
  return <BuiltInContactForm block={block} editorMode={editorMode} renderChildren={renderChildren} />;
}

/** The real, existing public ingest. See the note at the top of this file. */
const ENDPOINT = "/api/public/contact";

// #2 — form-content capture must be transparent. This form (and the Aqua Tag
// that may also read a page's forms) stores what a visitor submits, and until
// now nothing on the form said so. This is the DRAFT wording Ed approved on
// 2026-09-05, and it is SUBJECT TO DPO SIGN-OFF: it is a configurable prop
// (`consentNotice`) so the final legal text drops in without a code change, and
// `privacyPolicyUrl` turns "Privacy Policy" into a link when the site sets one.
// The basis is legitimate interest (they submitted an enquiry), disclosed here —
// deliberately NOT a hard consent gate, per Ed's "transparency over gating".
export const DEFAULT_CONSENT_NOTICE =
  "By submitting, you agree we can store and use your details to respond to your "
  + "enquiry. We won't share them or use them for anything else. See our Privacy Policy.";

/** Render the notice, linking the words "Privacy Policy" when a URL is set. */
function consentNoticeContent(notice: string, policyUrl?: string): React.ReactNode {
  const marker = "Privacy Policy";
  const at = policyUrl ? notice.indexOf(marker) : -1;
  if (at < 0) return notice;
  return (
    <>
      {notice.slice(0, at)}
      <a href={policyUrl} style={{ color: "inherit", textDecoration: "underline" }}>{marker}</a>
      {notice.slice(at + marker.length)}
    </>
  );
}

function BuiltInContactForm({ block, editorMode }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Get in touch";
  const subheading = (block.props.subheading as string | undefined) ?? "We'll reply within 1 business day.";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Send message";
  // #2 — the transparency notice. Defaults to Ed's approved DPO-draft; a site can
  // override the wording, and set `privacyPolicyUrl` to link its own policy.
  const consentNotice = (block.props.consentNotice as string | undefined) ?? DEFAULT_CONSENT_NOTICE;
  const privacyPolicyUrl = (block.props.privacyPolicyUrl as string | undefined)?.trim() || undefined;
  const challenge = usePublicBotChallengeConfig();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<BotChallengeHandle>(null);
  // NOTE: the block's `tag` prop is not forwarded. `/api/public/contact` sets
  // its own tags (`website-enquiry`, `contact:<method>`) and takes no custom
  // ones; inventing a field it ignores would be the same fiction this change
  // removed. Wire it through when the ingest accepts tags.

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
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          // The ingest requires a stated contact preference; this form only
          // ever collects an email address, so that is the honest answer.
          contactMethod: "email",
          note: message,
          // Honeypot field the ingest checks. Always empty from a real person.
          website: "",
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      // Success is ONLY a confirmed write. A 404, a 500 or an `ok:false` used
      // to be shown to the visitor as "Thanks!" while the message was lost.
      if (!res.ok || data.ok !== true) {
        setError(data.error ?? "Couldn't send — please try again, or email us directly.");
        return;
      }
      setSubmitted(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Network error.");
    } finally {
      captchaRef.current?.reset();
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

      {!editorMode ? (
        <BotChallenge
          ref={captchaRef}
          siteKey={challenge.siteKey}
          action="public-contact"
          onToken={setCaptchaToken}
          required={challenge.required || challenge.error}
        />
      ) : null}

      {error && <p role="alert" style={{ fontSize: 12, color: "#fca5a5", marginTop: 12 }}>{error}</p>}

      <button
        type="submit"
        disabled={
          editorMode
          || submitting
          || challenge.loading
          || ((challenge.required || challenge.error) && !challenge.siteKey)
          || (Boolean(challenge.siteKey) && !captchaToken)
        }
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

      {consentNotice && (
        <p style={{ fontSize: 11, opacity: 0.6, margin: "12px 0 0", lineHeight: 1.5 }}>
          {consentNoticeContent(consentNotice, privacyPolicyUrl)}
        </p>
      )}
    </form>
  );
}
