"use client";

// Marquee — auto-scrolling horizontal text strip. CSS-only animation.
// Often used for "free shipping → returns → secure checkout" rotators.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function MarqueeBlock({ block }: BlockRenderProps) {
  const items = (block.props.items as string[] | undefined) ?? [
    "✦  Free UK shipping over £40",
    "✦  Hand-packed in Accra",
    "✦  Hormone-safe, lab-certified",
    "✦  30-day returns",
  ];
  const speed = (block.props.speed as number | undefined) ?? 30;
  const id = `marquee-${block.id}`;

  // Render the items twice so the animation seamlessly loops.
  const css = `
    @keyframes ${id}-anim {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    [data-marquee="${id}"] .marquee-track {
      animation: ${id}-anim ${speed}s linear infinite;
    }
  `;

  return (
    <div
      data-block-type="marquee"
      data-marquee={id}
      style={{
        overflow: "hidden",
        padding: "12px 0",
        background: "rgba(255,255,255,0.04)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        ...blockStylesToCss(block.styles),
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="marquee-track" style={{ display: "flex", gap: 48, whiteSpace: "nowrap", width: "max-content" }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} style={{ fontSize: 13, opacity: 0.85 }}>{item}</span>
        ))}
      </div>
    </div>
  );
}
