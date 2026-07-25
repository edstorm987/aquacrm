"use client";

import { useEffect, useRef } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function TextBlock({ block, editorMode }: BlockRenderProps) {
  const text = (block.props.text as string | undefined) ?? "";
  const style = { lineHeight: 1.6, fontSize: "1rem", margin: 0, outline: "none", ...blockStylesToCss(block.styles) };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== text) ref.current.innerHTML = text;
  }, [text]);

  // Outside editor mode: render the raw HTML (admins can write <strong>,
  // <em>, <a>). The /admin/assets pipeline never embeds untrusted HTML —
  // the content is authored by the same admin who edits these blocks, so
  // raw output is acceptable here.
  if (!editorMode) {
    if (text.includes("<")) {
      return <div data-block-type="text" style={style} dangerouslySetInnerHTML={{ __html: text }} />;
    }
    return <p data-block-type="text" style={style}>{text}</p>;
  }

  return (
    <div
      ref={ref}
      data-block-type="text"
      style={style}
      contentEditable
      suppressContentEditableWarning
      onClick={e => e.stopPropagation()}
      onBlur={e => {
        const next = e.currentTarget.innerHTML;
        if (next === text) return;
        window.dispatchEvent(new CustomEvent("lk-block-text-commit", {
          detail: { id: block.id, key: "text", value: next },
        }));
      }}
    />
  );
}
