"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function GridBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const columns = Math.max(1, Math.min(12, Number(block.props.columns ?? 3) || 3));
  const gap = (block.props.gap as string | undefined) ?? "24px";
  const style = {
    display: "grid" as const,
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap,
    ...blockStylesToCss(block.styles),
  };
  const empty = !block.children || block.children.length === 0;
  return (
    <div data-block-type="grid" style={style}>
      {renderChildren?.(block.children)}
      {empty && editorMode && (
        <div style={{ gridColumn: `1 / span ${columns}`, padding: 16, textAlign: "center", border: "1px dashed rgba(255,107,53,0.3)", color: "rgba(255,107,53,0.6)", fontSize: 11, borderRadius: 6 }}>
          Grid · {columns} columns · drop blocks here
        </div>
      )}
    </div>
  );
}
