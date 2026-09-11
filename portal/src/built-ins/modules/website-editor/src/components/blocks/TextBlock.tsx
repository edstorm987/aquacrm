"use client";

import { useEffect, useRef } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { mayRenderStoredMarkup } from "../../lib/customCodeSafeMode";

export default function TextBlock({ block, editorMode }: BlockRenderProps) {
  const text = (block.props.text as string | undefined) ?? "";
  const style = { lineHeight: 1.6, fontSize: "1rem", margin: 0, outline: "none", ...blockStylesToCss(block.styles) };
  const ref = useRef<HTMLDivElement>(null);
  const rawMarkupAllowed = mayRenderStoredMarkup();

  useEffect(() => {
    if (!editorMode || !rawMarkupAllowed) return;
    if (ref.current && ref.current.innerHTML !== text) ref.current.innerHTML = text;
  }, [editorMode, rawMarkupAllowed, text]);

  // Outside editor mode: this renders raw operator HTML so authors can use
  // <strong>/<em>/<a>. Assume-breach containment (Phase 0-C): raw HTML can
  // also carry <img onerror>/<svg onload> active content, and there is no
  // parser sanitiser yet — so in production SAFE MODE the value is rendered as
  // TEXT (React escapes it), which keeps the content visible without executing
  // it. Rich formatting returns once the sanitiser/origin-isolation land.
  if (!editorMode) {
    if (text.includes("<") && rawMarkupAllowed) {
      return <div data-block-type="text" style={style} dangerouslySetInnerHTML={{ __html: text }} />;
    }
    return <p data-block-type="text" style={style}>{text}</p>;
  }

  // The contentEditable hydration path was a separate stored-markup sink: its
  // effect assigned innerHTML before the visitor-render branch above. In safe
  // mode render and commit plain text only. Development keeps the historical
  // rich-HTML editing path until a parser-backed allowlist is available.
  if (!rawMarkupAllowed) {
    return (
      <div
        data-block-type="text"
        style={style}
        contentEditable
        suppressContentEditableWarning
        onClick={e => e.stopPropagation()}
        onBlur={e => {
          const next = e.currentTarget.textContent ?? "";
          if (next === text) return;
          window.dispatchEvent(new CustomEvent("lk-block-text-commit", {
            detail: { id: block.id, key: "text", value: next },
          }));
        }}
      >
        {text}
      </div>
    );
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
