"use client";

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Drop-in login form for the visual editor. Posts to whatever URL the
// admin sets — defaults to /api/auth/login (the portal's own server
// session route). Visual style respects the active theme via CSS vars,
// with sensible fallbacks.
//
// This is a NATIVE form post (no JS required): the browser navigates to
// `action` with an `application/x-www-form-urlencoded` body and
// `/api/auth/login` answers with a 303 back to a page. A failed attempt
// comes back to this same page carrying a short-lived `aqua_login_error`
// cookie — nothing about the attempt is ever put in the URL, so neither
// the email nor the failure reason lands in history, logs or referers.

const LOGIN_ERROR_COOKIE = "aqua_login_error";

function readLoginErrorCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${LOGIN_ERROR_COOKIE}=`));
  if (!match) return "";
  const raw = match.slice(LOGIN_ERROR_COOKIE.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function LoginFormBlock({ block, editorMode }: BlockRenderProps) {
  const title    = (block.props.title as string | undefined)    ?? "Sign in";
  const subtitle = (block.props.subtitle as string | undefined) ?? "";
  const action   = (block.props.action as string | undefined)   ?? "/api/auth/login";
  const submitLabel  = (block.props.submitLabel as string | undefined)  ?? "Sign in";
  const showRemember = block.props.showRemember !== false;
  const showForgot   = block.props.showForgot !== false;
  const forgotHref   = (block.props.forgotHref as string | undefined)   ?? "/account/forgot-password";
  const signupHref   = (block.props.signupHref as string | undefined)   ?? "/signup";
  const showSignupLink = block.props.showSignupLink !== false;

  // Read-once: only overwrite state when a message is actually present, so
  // React 19 Strict Mode's second effect pass (which finds the cookie already
  // cleared) cannot blank the banner it just showed.
  const [loginError, setLoginError] = useState("");
  useEffect(() => {
    if (editorMode) return;
    const message = readLoginErrorCookie();
    if (!message) return;
    setLoginError(message);
    document.cookie = `${LOGIN_ERROR_COOKIE}=; path=/; max-age=0`;
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

  return (
    <section data-block-type="login-form" style={style}>
      <h2 style={{ fontFamily: "var(--theme-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 16 }}>{subtitle}</p>}
      {loginError && (
        <p
          role="alert"
          data-login-error
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
          {loginError}
        </p>
      )}
      <form action={action} method="POST" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Email</span>
          <input name="email" type="email" required disabled={editorMode} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Password</span>
          <input name="password" type="password" required disabled={editorMode} style={inputStyle} />
        </label>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
          {showRemember ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input name="remember" type="checkbox" disabled={editorMode} /> Remember me
            </label>
          ) : <span />}
          {showForgot && <a href={forgotHref} style={{ color: "var(--theme-primary, #ff6b35)", textDecoration: "none" }}>Forgot password?</a>}
        </div>
        <button type="submit" disabled={editorMode} style={{ marginTop: 4, padding: "12px 20px", borderRadius: "var(--theme-radius, 12px)", border: "none", background: "var(--theme-primary, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: editorMode ? "default" : "pointer" }}>
          {submitLabel}
        </button>
      </form>
      {showSignupLink && (
        <p style={{ marginTop: 16, fontSize: 12, opacity: 0.65, textAlign: "center" }}>
          New here? <a href={signupHref} style={{ color: "var(--theme-primary, #ff6b35)", textDecoration: "none" }}>Create an account</a>
        </p>
      )}
    </section>
  );
}
