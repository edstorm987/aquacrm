"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function CtaBlock({ block }: BlockRenderProps) {
  const headline = (block.props.headline as string | undefined) ?? "";
  const subhead  = (block.props.subhead as string | undefined) ?? "";
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "";
  const ctaHref  = (block.props.ctaHref as string | undefined) ?? "#";

  const style: React.CSSProperties = {
    width: "100%",
    padding: "64px 32px",
    background: "linear-gradient(135deg, var(--brand-accent, #ff6b35) 0%, #ff9a5a 100%)",
    color: "#fff",
    borderRadius: 16,
    textAlign: "center",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="cta" style={style}>
      {headline && <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 700, margin: "0 0 8px", lineHeight: 1.15 }}>{headline}</h2>}
      {subhead && <p style={{ fontSize: 16, opacity: 0.9, marginBottom: 24, maxWidth: 600, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{subhead}</p>}
      {ctaLabel && (
        <a href={ctaHref} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 12, background: "#0a0a0a", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          {ctaLabel}
          <span aria-hidden="true">→</span>
        </a>
      )}
    </section>
  );
}
