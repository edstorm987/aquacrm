"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function RowBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const gap = (block.props.gap as string | undefined) ?? "16px";
  const style = {
    display: "flex" as const,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap,
    ...blockStylesToCss(block.styles),
  };
  const empty = !block.children || block.children.length === 0;
  return (
    <div data-block-type="row" style={style}>
      {renderChildren?.(block.children)}
      {empty && editorMode && (
        <div style={{ padding: 16, flex: 1, textAlign: "center", border: "1px dashed rgba(255,107,53,0.3)", color: "rgba(255,107,53,0.6)", fontSize: 11, borderRadius: 6 }}>
          Row · drop columns here
        </div>
      )}
    </div>
  );
}
