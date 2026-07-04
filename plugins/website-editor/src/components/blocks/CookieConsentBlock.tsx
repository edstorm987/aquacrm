"use client";

// R007 — Cookie consent block. Renders only when no consent decision
// is on file. Accept/decline writes a single localStorage key
// (`aqua_cookie_consent_v1`); other plugins can read this key or
// listen for the `aqua-cookie-consent` CustomEvent we dispatch on
// either decision.
//
// Single-binary v1 — granular categories (analytics / marketing /
// strict) are R+1.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";

export const COOKIE_CONSENT_KEY = "aqua_cookie_consent_v1";
export type CookieConsentValue = "accepted" | "declined";

export default function CookieConsentBlock({ block }: BlockRenderProps) {
  const message = (block.props.message as string | undefined)
    ?? "We use cookies to improve your experience. Read our policy or choose below.";
  const acceptLabel = (block.props.acceptLabel as string | undefined) ?? "Accept";
  const declineLabel = (block.props.declineLabel as string | undefined) ?? "Decline";
  const policyUrl = block.props.policyUrl as string | undefined;
  const position = (block.props.position as "bottom-bar" | "corner" | "modal" | undefined) ?? "bottom-bar";

  const [decided, setDecided] = useState<boolean>(true);

  useEffect(() => {
    try {
      const cur = localStorage.getItem(COOKIE_CONSENT_KEY);
      setDecided(cur === "accepted" || cur === "declined");
    } catch {
      // Private mode / disabled storage — fall back to "decided" so we
      // don't render forever without a way to dismiss.
      setDecided(true);
    }
  }, []);

  if (decided) return null;

  function record(value: CookieConsentValue): void {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, value); } catch {}
    try {
      window.dispatchEvent(new CustomEvent("aqua-cookie-consent", { detail: { value } }));
    } catch {}
    setDecided(true);
  }

  const containerStyle: React.CSSProperties =
    position === "modal" ? {
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
    }
    : position === "corner" ? {
      position: "fixed", right: 16, bottom: 16, maxWidth: 360, zIndex: 60,
    }
    : {
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
    };

  const cardStyle: React.CSSProperties = {
    background: "rgba(15,23,42,0.94)",
    color: "#f5f3ec",
    padding: "14px 18px",
    borderRadius: position === "bottom-bar" ? 0 : 10,
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: position === "modal" ? "column" : "row",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: position === "modal" ? 480 : "min(1100px, calc(100% - 32px))",
    margin: position === "bottom-bar" ? 0 : "0 auto",
  };

  const buttonRowStyle: React.CSSProperties = {
    display: "flex", gap: 8, marginLeft: position === "modal" ? 0 : "auto",
    flexShrink: 0,
  };

  return (
    <div data-block-type="cookie-consent" data-position={position} style={containerStyle} role="dialog" aria-label="Cookie consent">
      <div style={cardStyle}>
        <span style={{ flex: 1 }}>
          {message}{" "}
          {policyUrl && (
            <a href={policyUrl} style={{ color: "#7dd3fc", textDecoration: "underline" }} target="_blank" rel="noreferrer">
              Cookie policy
            </a>
          )}
        </span>
        <div style={buttonRowStyle}>
          <button
            onClick={() => record("declined")}
            style={{
              padding: "6px 12px", fontSize: 12,
              background: "transparent", color: "#cbd5e1",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 6, cursor: "pointer",
            }}
          >
            {declineLabel}
          </button>
          <button
            onClick={() => record("accepted")}
            style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600,
              background: "var(--brand-accent, #38bdf8)", color: "#0b1220",
              border: "none", borderRadius: 6, cursor: "pointer",
            }}
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
