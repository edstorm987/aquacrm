"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function ColumnBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const gap = (block.props.gap as string | undefined) ?? "12px";
  const style = {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap,
    flex: 1,
    minWidth: 0,
    ...blockStylesToCss(block.styles),
  };
  const empty = !block.children || block.children.length === 0;
  return (
    <div data-block-type="column" style={style}>
      {renderChildren?.(block.children)}
      {empty && editorMode && (
        <div style={{ padding: 12, textAlign: "center", border: "1px dashed rgba(255,107,53,0.3)", color: "rgba(255,107,53,0.6)", fontSize: 11, borderRadius: 6 }}>
          Column · drop blocks here
        </div>
      )}
    </div>
  );
}
