"use client";

// Marquee — auto-scrolling horizontal text strip. CSS-only animation.
// Often used for "free shipping → returns → secure checkout" rotators.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { blockCssScopeId } from "@/engines/editor/elements/blockIdentity";

export default function MarqueeBlock({ block }: BlockRenderProps) {
  const items = (block.props.items as string[] | undefined) ?? [
    "✦  Free UK shipping over £40",
    "✦  Hand-packed in Accra",
    "✦  Hormone-safe, lab-certified",
    "✦  30-day returns",
  ];
  const rawSpeed = block.props.speed;
  const speed = typeof rawSpeed === "number" && Number.isFinite(rawSpeed)
    ? Math.min(600, Math.max(1, rawSpeed))
    : 30;
  const id = blockCssScopeId("marquee", block.id);

  // Render the items twice so the animation seamlessly loops.
  const css = id ? `
    @keyframes ${id}-anim {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    [data-marquee="${id}"] .marquee-track {
      animation: ${id}-anim ${speed}s linear infinite;
    }
  ` : "";

  return (
    <div
      data-block-type="marquee"
      data-marquee={id ?? undefined}
      style={{
        overflow: "hidden",
        padding: "12px 0",
        background: "rgba(255,255,255,0.04)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        ...blockStylesToCss(block.styles),
      }}
    >
      {css && <style>{css}</style>}
      <div className="marquee-track" style={{ display: "flex", gap: 48, whiteSpace: "nowrap", width: "max-content" }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} style={{ fontSize: 13, opacity: 0.85 }}>{item}</span>
        ))}
      </div>
    </div>
  );
}
