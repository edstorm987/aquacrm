"use client";

import type { BlockRenderProps } from "../blockRegistry";

export default function DividerBlock({ block }: BlockRenderProps) {
  const color = (block.props.color as string | undefined) ?? "rgba(255,255,255,0.1)";
  return <hr data-block-type="divider" style={{ border: 0, borderTop: `1px solid ${color}`, margin: "16px 0", width: "100%" }} />;
}
