"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { mayRenderStoredMarkup } from "../../lib/customCodeSafeMode";

// Custom HTML escape-hatch. Assume-breach containment (Phase 0-C): this stamps
// arbitrary operator markup into the render with dangerouslySetInnerHTML. On
// the authenticated same-origin preview that is stored same-origin code
// execution, so in production SAFE MODE the raw markup is not rendered until a
// parser sanitiser + origin isolation land (see customCodeSafeMode.ts). The
// editor's own sandboxed iframe still shows the author their markup.

export default function HtmlBlock({ block }: BlockRenderProps) {
  const html = (block.props.html as string | undefined) ?? "";
  const style = blockStylesToCss(block.styles);
  if (!mayRenderStoredMarkup()) {
    return (
      <div data-block-type="html" data-html-safe-mode style={style}>
        <span style={{ display: "block", padding: "0.75rem 1rem", border: "1px dashed rgba(0,0,0,0.2)", fontSize: "0.75rem", color: "rgba(0,0,0,0.5)" }}>
          Custom HTML is held for security review in this environment.
        </span>
      </div>
    );
  }
  return <div data-block-type="html" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
