"use client";

// Toggle — `▸ Header` disclosure that opens to nested blocks (chapter §15b).
// Differs from Accordion (single item, BlockTree children rather than
// {title,content} string items). Native <details> handles keyboard
// (Enter / Space) + screen-reader announcement automatically.

import type { ReactNode } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function ToggleBlock({ block, renderChildren }: BlockRenderProps) {
  const label = (block.props.label as string | undefined) ?? "Toggle";
  const defaultOpen = Boolean(block.props.defaultOpen);
  const children = block.children;

  const inner: ReactNode = renderChildren
    ? renderChildren(children)
    : (children?.length
        ? <div style={{ opacity: 0.5, fontSize: 12 }}>[{children.length} child block{children.length === 1 ? "" : "s"}]</div>
        : null);

  return (
    <section data-block-type="toggle" style={{ padding: "8px 24px", color: "var(--inc-text, currentColor)", ...blockStylesToCss(block.styles) }}>
      <details open={defaultOpen} style={{ maxWidth: 720, margin: "0 auto" }}>
        <summary style={{
          fontSize: 15, fontWeight: 500, cursor: "pointer", listStyle: "none",
          padding: "8px 0", display: "flex", alignItems: "center", gap: 8,
          color: "var(--inc-heading, currentColor)",
        }}>
          <span aria-hidden="true" style={{ display: "inline-block", transition: "transform 0.15s", fontSize: 12, opacity: 0.6, color: "var(--inc-muted, currentColor)" }}>▸</span>
          <span>{label}</span>
        </summary>
        <div style={{ paddingLeft: 20, marginTop: 8 }}>{inner}</div>
      </details>
    </section>
  );
}
