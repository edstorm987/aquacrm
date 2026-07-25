"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function SignupFormBlock({ block, editorMode }: BlockRenderProps) {
  const title       = (block.props.title as string | undefined)       ?? "Create your account";
  const action      = (block.props.action as string | undefined)      ?? "/api/auth/signup";
  const submitLabel = (block.props.submitLabel as string | undefined) ?? "Create account";
  const showName    = block.props.showName !== false;
  const requireTerms = block.props.requireTerms === true;
  const termsHref   = (block.props.termsHref as string | undefined)   ?? "/terms";
  const loginHref   = (block.props.loginHref as string | undefined)   ?? "/login";
  const showLoginLink = block.props.showLoginLink !== false;

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
    <section data-block-type="signup-form" style={style}>
      <h2 style={{ fontFamily: "var(--theme-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>{title}</h2>
      <form action={action} method="POST" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {showName && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Name</span>
            <input name="name" type="text" required disabled={editorMode} style={inputStyle} />
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Email</span>
          <input name="email" type="email" required disabled={editorMode} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Password</span>
          <input name="password" type="password" required minLength={8} disabled={editorMode} style={inputStyle} />
        </label>
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
          Already have an account? <a href={loginHref} style={{ color: "var(--theme-primary, #ff6b35)", textDecoration: "none" }}>Sign in</a>
        </p>
      )}
    </section>
  );
}
