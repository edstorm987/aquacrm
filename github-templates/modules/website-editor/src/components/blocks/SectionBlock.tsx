"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function SectionBlock({ block, editorMode, renderChildren }: BlockRenderProps) {
  const fullWidth = block.props.fullWidth === true;
  const baseStyle = blockStylesToCss(block.styles);
  const style = {
    width: "100%",
    paddingTop: baseStyle.padding ? undefined : 64,
    paddingBottom: baseStyle.padding ? undefined : 64,
    ...baseStyle,
  };
  const empty = !block.children || block.children.length === 0;
  const innerWrap = fullWidth ? null : { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24 };
  return (
    <section data-block-type="section" style={style}>
      <div style={innerWrap ?? undefined}>
        {renderChildren?.(block.children)}
        {empty && editorMode && (
          <div style={{ padding: 32, textAlign: "center", border: "1px dashed rgba(255,107,53,0.4)", color: "rgba(255,107,53,0.7)", fontSize: 12, borderRadius: 8 }}>
            Section · drop blocks here
          </div>
        )}
      </div>
    </section>
  );
}
