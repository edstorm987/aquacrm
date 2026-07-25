"use client";

// R017 — Share buttons. Twitter / LinkedIn / Facebook + copy-link
// affordance. Defaults to current page URL when `url` prop empty.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";

interface Network { id: "twitter" | "linkedin" | "facebook" | "copy"; label: string }
const DEFAULT_NETWORKS: Network[] = [
  { id: "twitter", label: "Tweet" },
  { id: "linkedin", label: "Share" },
  { id: "facebook", label: "Share" },
  { id: "copy", label: "Copy link" },
];

function shareUrlFor(id: Network["id"], targetUrl: string, text: string): string | null {
  const u = encodeURIComponent(targetUrl);
  const t = encodeURIComponent(text);
  switch (id) {
    case "twitter":  return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "linkedin": return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "copy":     return null;
  }
}

const NETWORK_GLYPH: Record<Network["id"], string> = {
  twitter: "𝕏", linkedin: "in", facebook: "f", copy: "🔗",
};

export default function ShareButtonsBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const propUrl = block.props.url as string | undefined;
  const text = (block.props.text as string | undefined) ?? "";
  const networksProp = block.props.networks as Network["id"][] | undefined;
  const targetUrl = propUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  const networks = (networksProp && networksProp.length > 0
    ? DEFAULT_NETWORKS.filter(n => networksProp.includes(n.id))
    : DEFAULT_NETWORKS);

  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; user can copy from the URL bar.
    }
  }

  return (
    <section data-block-type="share-buttons" style={{ padding: "16px 24px", color: "var(--brand-text, currentColor)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {heading && <span style={{ fontSize: 13, color: "var(--brand-text-muted, rgba(255,255,255,0.6))", fontWeight: 500 }}>{heading}</span>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {networks.map(n => {
            const url = shareUrlFor(n.id, targetUrl, text);
            const buttonStyle: React.CSSProperties = {
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", fontSize: 12,
              background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
              color: "var(--brand-text, currentColor)",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
              borderRadius: "var(--brand-radius-sm, 6px)",
              textDecoration: "none", cursor: "pointer", fontFamily: "inherit",
            };
            const glyph = <span aria-hidden="true" style={{ fontWeight: 700 }}>{NETWORK_GLYPH[n.id]}</span>;
            if (n.id === "copy") {
              return (
                <button key={n.id} type="button" onClick={copy} style={buttonStyle} aria-label="Copy page link">
                  {glyph}
                  <span>{copied ? "Copied ✓" : n.label}</span>
                </button>
              );
            }
            return (
              <a key={n.id} href={url ?? "#"} target="_blank" rel="noreferrer" style={buttonStyle} aria-label={`Share on ${n.id}`}>
                {glyph}
                <span>{n.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
