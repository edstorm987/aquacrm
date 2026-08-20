"use client";

// Signup block — a LEAD capture on a published website, not an account form.
//
// Ed's decision (2026-08-20): "it creates a website lead not a client, key
// distinction... then we manually talk with the customer, book them a meeting,
// and then we have the create-customer button to turn them."
//
// So this block collects the details a first conversation needs — who, how to
// reach them, what they want — and `/api/auth/signup`'s form branch deposits
// them in the leads pipeline. It does NOT collect a password, because there is
// no account at the end of it. Before this, a visitor filling this form in on
// a CLIENT's website had a whole new AGENCY created for them, and then landed
// on a raw `{"ok":false,…}` JSON blob because the route only parsed JSON.
//
// This is still a NATIVE form post (no JS required): the browser navigates to
// `action` with an `application/x-www-form-urlencoded` body and the route
// answers with a 303 back to this same page, carrying the outcome in two
// short-lived cookies. Nothing about the submission goes in the URL, so no
// name or email lands in history, logs or referers.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

const STATUS_COOKIE = "aqua_signup_status";
const MESSAGE_COOKIE = "aqua_signup_message";

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split("; ").find(pair => pair.startsWith(`${name}=`));
  if (!match) return "";
  const raw = match.slice(name.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export default function SignupFormBlock({ block, editorMode }: BlockRenderProps) {
  const title       = (block.props.title as string | undefined)       ?? "Get started";
  const subtitle    = (block.props.subtitle as string | undefined)    ?? "Tell us how to reach you and we'll be in touch.";
  const action      = (block.props.action as string | undefined)      ?? "/api/auth/signup";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Send my details";
  const showName    = block.props.showName !== false;
  const showPhone   = block.props.showPhone !== false;
  const showMessage = block.props.showMessage !== false;
  const requireTerms = block.props.requireTerms === true;
  const termsHref   = (block.props.termsHref as string | undefined)   ?? "/terms";
  const loginHref   = (block.props.loginHref as string | undefined)   ?? "/login";
  const showLoginLink = block.props.showLoginLink !== false;
  // Optional agency slug, for a site whose host is not registered in the app.
  // The route treats it as a preference it looks up, never as a grant.
  const brand       = (block.props.brand as string | undefined)       ?? "";

  // Read-once, mirroring `LoginFormBlock`: only overwrite state when a value is
  // actually present, so React 19 Strict Mode's second effect pass (which finds
  // the cookies already cleared) cannot blank the banner it just showed.
  const [status, setStatus] = useState<"" | "ok" | "error">("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (editorMode) return;
    const nextStatus = readCookie(STATUS_COOKIE);
    if (nextStatus !== "ok" && nextStatus !== "error") return;
    setStatus(nextStatus);
    setMessage(readCookie(MESSAGE_COOKIE));
    clearCookie(STATUS_COOKIE);
    clearCookie(MESSAGE_COOKIE);
  }, [editorMode]);

  const style: React.CSSProperties = {
    width: "100%",
    maxWidth: 380,
    margin: "0 auto",
    padding: 24,
    borderRadius: "var(--theme-radius, 12px)",
    background: "var(--theme-surface-alt, rgba(255,255,255,0.02))",
    border: "1px solid var(--theme-border, rgba(255,255,255,0.08))",
    color: "var(--theme-ink, inherit)",
    ...blockStylesToCss(block.styles),
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid var(--theme-border, rgba(255,255,255,0.1))",
    borderRadius: 8,
    fontSize: 14,
    color: "inherit",
    fontFamily: "inherit",
  };

  if (status === "ok") {
    return (
      <section
        data-block-type="signup-form"
        data-signup-status="ok"
        style={{ ...style, textAlign: "center" }}
      >
        <p style={{ fontSize: 30, margin: "0 0 8px" }}>✓</p>
        <h2 style={{ fontFamily: "var(--theme-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
          Thanks!
        </h2>
        <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
          {message || "We have your details and will be in touch shortly."}
        </p>
      </section>
    );
  }

  return (
    <section data-block-type="signup-form" style={style}>
      <h2 style={{ fontFamily: "var(--theme-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, opacity: 0.65, margin: "0 0 16px" }}>{subtitle}</p>}
      {status === "error" && message && (
        <p
          role="alert"
          data-signup-error
          style={{
            margin: "0 0 12px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(220,38,38,0.35)",
            background: "rgba(220,38,38,0.08)",
            color: "var(--theme-danger, #dc2626)",
            fontSize: 12,
          }}
        >
          {message}
        </p>
      )}
      <form action={action} method="POST" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {brand && <input type="hidden" name="brand" value={brand} />}
        {/* Honeypot — off-screen, never tabbable, never autofilled. Bots fill
            it; the route answers them with the same friendly success and
            writes nothing. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
        />
        {showName && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Name</span>
            <input name="name" type="text" required autoComplete="name" disabled={editorMode} style={inputStyle} />
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Email</span>
          <input name="email" type="email" required autoComplete="email" disabled={editorMode} style={inputStyle} />
        </label>
        {showPhone && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Phone (optional)</span>
            <input name="phone" type="tel" autoComplete="tel" disabled={editorMode} style={inputStyle} />
          </label>
        )}
        {showMessage && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>What can we help with? (optional)</span>
            <textarea name="message" rows={4} disabled={editorMode} style={{ ...inputStyle, minHeight: 88, resize: "vertical" }} />
          </label>
        )}
        {requireTerms && (
          <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, fontSize: 11, opacity: 0.85 }}>
            <input name="terms" type="checkbox" required disabled={editorMode} style={{ marginTop: 3 }} />
            <span>I agree to the <a href={termsHref} style={{ color: "var(--theme-primary, #ff6b35)" }}>terms of service</a>.</span>
          </label>
        )}
        <button type="submit" disabled={editorMode} style={{ marginTop: 4, padding: "12px 20px", borderRadius: "var(--theme-radius, 12px)", border: "none", background: "var(--theme-primary, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: editorMode ? "default" : "pointer" }}>
          {submitLabel}
        </button>
      </form>
      {showLoginLink && (
        <p style={{ marginTop: 16, fontSize: 12, opacity: 0.65, textAlign: "center" }}>
          Already a customer? <a href={loginHref} style={{ color: "var(--theme-primary, #ff6b35)", textDecoration: "none" }}>Sign in</a>
        </p>
      )}
    </section>
  );
}
