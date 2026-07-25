"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Custom HTML escape-hatch. Keeps the editor flexible for power users who
// want a chunk of bespoke markup. Trust comes from the admin who authored
// it; on save the page-write API can sanitise if the operator opts into a
// strict mode in PortalSettings.

export default function HtmlBlock({ block }: BlockRenderProps) {
  const html = (block.props.html as string | undefined) ?? "";
  const style = blockStylesToCss(block.styles);
  return <div data-block-type="html" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
