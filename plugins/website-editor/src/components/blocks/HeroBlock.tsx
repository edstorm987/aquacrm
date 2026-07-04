"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function HeroBlock({ block }: BlockRenderProps) {
  const eyebrow = (block.props.eyebrow as string | undefined) ?? "";
  const headline = (block.props.headline as string | undefined) ?? "";
  const subhead = (block.props.subhead as string | undefined) ?? "";
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "";
  const ctaHref = (block.props.ctaHref as string | undefined) ?? "#";
  const bg = (block.props.backgroundImage as string | undefined) ?? "";

  const style: React.CSSProperties = {
    position: "relative",
    width: "100%",
    minHeight: 480,
    padding: "96px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    overflow: "hidden",
    background: bg ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${bg}) center / cover no-repeat` : "linear-gradient(135deg, #1a1a1a 0%, #2a1a0a 100%)",
    color: "#fff",
    ...blockStylesToCss(block.styles),
  };

  return (
    <section data-block-type="hero" style={style}>
      <div style={{ maxWidth: 800 }}>
        {eyebrow && (
          <p style={{ textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 11, opacity: 0.75, marginBottom: 16, color: "var(--brand-accent, #ff6b35)" }}>
            {eyebrow}
          </p>
        )}
        {headline && (
          <h1 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 700, lineHeight: 1.05, margin: "0 0 16px" }}>
            {headline}
          </h1>
        )}
        {subhead && (
          <p style={{ fontSize: "1.125rem", lineHeight: 1.6, opacity: 0.85, marginBottom: 32, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
            {subhead}
          </p>
        )}
        {ctaLabel && (
          <a href={ctaHref} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px", borderRadius: 12, background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            {ctaLabel}
            <span aria-hidden="true">→</span>
          </a>
        )}
      </div>
    </section>
  );
}
