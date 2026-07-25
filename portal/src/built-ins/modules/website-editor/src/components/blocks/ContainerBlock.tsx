"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function ContainerBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const style = { ...blockStylesToCss(block.styles) };
  const empty = !block.children || block.children.length === 0;
  return (
    <div data-block-type="container" style={style}>
      {renderChildren?.(block.children)}
      {empty && editorMode && (
        <div style={{ padding: 24, textAlign: "center", border: "1px dashed rgba(255,107,53,0.4)", color: "rgba(255,107,53,0.7)", fontSize: 11, borderRadius: 8 }}>
          Container · drop blocks here
        </div>
      )}
    </div>
  );
}
