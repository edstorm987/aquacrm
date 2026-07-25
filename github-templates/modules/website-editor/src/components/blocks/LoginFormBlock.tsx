"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Drop-in login form for the visual editor. Posts to whatever URL the
// admin sets — defaults to /api/auth/login (the portal's own server
// session route). Visual style respects the active theme via CSS vars,
// with sensible fallbacks.

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
