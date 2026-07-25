"use client";

// Banner block — sitewide promo strip ("Free shipping over £40 →").
// Sticky-top by default; can include a CTA link and a close button.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function BannerBlock({ block }: BlockRenderProps) {
  const text = (block.props.text as string | undefined) ?? "Free UK shipping over £40";
  const ctaLabel = block.props.ctaLabel as string | undefined;
  const ctaHref = (block.props.ctaHref as string | undefined) ?? "#";
  const dismissible = (block.props.dismissible as boolean | undefined) ?? true;
  const sticky = (block.props.sticky as boolean | undefined) ?? false;
  const tone = (block.props.tone as "info" | "promo" | "alert" | undefined) ?? "promo";
  const id = block.id;

  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!dismissible) return;
    try {
      if (sessionStorage.getItem(`lk_banner_${id}_dismissed`)) setHidden(true);
    } catch {}
  }, [dismissible, id]);

  if (hidden) return null;

  const palette: Record<string, { bg: string; fg: string }> = {
    info:  { bg: "rgba(56,189,248,0.15)", fg: "#bae6fd" },
    promo: { bg: "var(--brand-accent, #ff6b35)", fg: "#fff" },
    alert: { bg: "rgba(239,68,68,0.18)",  fg: "#fecaca" },
  };
  const colours = palette[tone] ?? palette.info!;

  return (
    <div
      data-block-type="banner"
      style={{
        background: colours.bg,
        color: colours.fg,
        padding: "10px 16px",
        fontSize: 13,
        textAlign: "center",
        position: sticky ? "sticky" : "relative",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        ...blockStylesToCss(block.styles),
      }}
    >
      <span>{text}</span>
      {ctaLabel && (
        <a href={ctaHref} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
          {ctaLabel}
        </a>
      )}
      {dismissible && (
        <button
          type="button"
          onClick={() => {
            try { sessionStorage.setItem(`lk_banner_${id}_dismissed`, "1"); } catch {}
            setHidden(true);
          }}
          aria-label="Dismiss"
          style={{
            position: "absolute", right: 12,
            background: "transparent", border: "none",
            color: "inherit", fontSize: 16, cursor: "pointer", opacity: 0.85,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
