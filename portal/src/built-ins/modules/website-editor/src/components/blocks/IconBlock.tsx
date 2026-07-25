"use client";

// Icon block — two modes:
//   • glyph mode (default) — text glyph chip; original v1 behaviour.
//   • image mode (Notion) — small image chip (~64×64) overlapping a cover
//     banner via negative `offsetY`. Used by the Aqua Incubator template
//     (chapter §15a). When `image` is set, image mode wins.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function IconBlock({ block }: BlockRenderProps) {
  const image = block.props.image as string | undefined;
  const offsetY = (block.props.offsetY as number | undefined) ?? -32;
  const label = block.props.label as string | undefined;

  if (image && image.length > 0) {
    const wrapStyle: React.CSSProperties = {
      display: "inline-flex", alignItems: "center", gap: 12,
      marginTop: offsetY, marginLeft: 24, position: "relative",
      ...blockStylesToCss(block.styles),
    };
    return (
      <div data-block-type="icon" data-mode="image" style={wrapStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={label ?? ""} width={64} height={64}
          style={{
            width: 64, height: 64, borderRadius: 12, objectFit: "cover",
            border: "2px solid var(--inc-icon-ring, rgba(0,0,0,0.6))",
            boxShadow: "0 4px 14px var(--inc-icon-shadow, rgba(0,0,0,0.4))",
          }} />
        {label && <span style={{ fontSize: 13, opacity: 0.7, color: "var(--inc-text, currentColor)" }}>{label}</span>}
      </div>
    );
  }

  const glyph = (block.props.glyph as string | undefined) ?? "✦";
  const size = (block.props.size as string | undefined) ?? "32px";
  // brand-kit-todo (R011 §C): glyph default falls back to var(--brand-accent)
  // when the operator hasn't set a colour, so brand-kit changes propagate.
  const color = (block.props.color as string | undefined) ?? "var(--brand-accent, #ff6b35)";
  const style = { fontSize: size, color, lineHeight: 1, display: "inline-block", ...blockStylesToCss(block.styles) };
  return <span data-block-type="icon" data-mode="glyph" style={style} aria-hidden="true">{glyph}</span>;
}
