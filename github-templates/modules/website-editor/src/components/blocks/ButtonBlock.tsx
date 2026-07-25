"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

type HoverAnim = "none" | "lift" | "glow" | "shrink" | "shine" | "wiggle";

export default function ButtonBlock({ block, editorMode }: BlockRenderProps) {
  const label = (block.props.label as string | undefined) ?? "Button";
  const href = (block.props.href as string | undefined) ?? "#";
  const variant = (block.props.variant as "primary" | "secondary" | "ghost" | undefined) ?? "primary";
  const hoverAnim = ((block.props.hoverAnim as HoverAnim | undefined) ?? "lift");

  const variantStyle =
    variant === "primary"   ? { background: "var(--brand-accent, #ff6b35)", color: "#fff", border: "none" }
    : variant === "secondary" ? { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }
    : { background: "transparent", color: "rgba(255,255,255,0.85)", border: "none", padding: "8px 12px" };

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 20px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    transition: "transform 200ms ease-out, box-shadow 200ms ease-out, opacity 200ms ease-out, background 200ms ease-out",
    position: "relative",
    overflow: hoverAnim === "shine" ? "hidden" : undefined,
    ...variantStyle,
    ...blockStylesToCss(block.styles),
  };

  // Inject scoped hover styles via a per-instance style tag so each
  // button can have its own animation without leaking via :hover rules.
  const hoverCss = hoverStylesFor(block.id, hoverAnim);

  return (
    <>
      {hoverCss && <style dangerouslySetInnerHTML={{ __html: hoverCss }} />}
      <a
        data-block-type="button"
        data-block-id={block.id}
        href={href}
        style={style}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noopener noreferrer"
        // Stops the canvas from intercepting the click in editor mode.
        onClick={editorMode ? e => e.preventDefault() : undefined}
      >
        {label}
        {hoverAnim === "shine" && !editorMode && <span aria-hidden="true" data-shine />}
      </a>
    </>
  );
}

function hoverStylesFor(id: string, anim: HoverAnim): string | null {
  if (anim === "none") return null;
  const sel = `[data-block-id="${id}"]`;
  switch (anim) {
    case "lift":
      return `${sel}:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.35); }`;
    case "glow":
      return `${sel}:hover { box-shadow: 0 0 0 4px rgba(255,107,53,0.25), 0 0 24px rgba(255,107,53,0.45); }`;
    case "shrink":
      return `${sel}:hover { transform: scale(0.97); }`;
    case "wiggle":
      return `@keyframes lk-wiggle-${id} { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-2deg); } 75% { transform: rotate(2deg); } } ${sel}:hover { animation: lk-wiggle-${id} 400ms ease-in-out; }`;
    case "shine":
      return `${sel} [data-shine] { position: absolute; inset: 0; background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%); transform: translateX(-100%); transition: transform 600ms ease-out; pointer-events: none; } ${sel}:hover [data-shine] { transform: translateX(100%); }`;
    default:
      return null;
  }
}
