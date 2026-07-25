"use client";

import type { BlockRenderProps } from "../blockRegistry";

export default function SpacerBlock({ block, editorMode }: BlockRenderProps) {
  const height = (block.props.height as string | undefined) ?? "32px";
  return (
    <div
      data-block-type="spacer"
      style={{
        height,
        width: "100%",
        ...(editorMode ? { background: "rgba(255,107,53,0.05)", border: "1px dashed rgba(255,107,53,0.2)" } : null),
      }}
    />
  );
}
