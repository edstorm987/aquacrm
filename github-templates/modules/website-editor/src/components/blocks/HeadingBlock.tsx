"use client";

import { createElement, useEffect, useRef } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

// Heading + inline edit. In editorMode the element is contentEditable;
// blur commits the new value back into the props via the canvas's
// onPatch hook, dispatched as an `lk-block-text-commit` CustomEvent
// (the canvas listens). Outside editor mode the element is plain.

export default function HeadingBlock({ block, editorMode }: BlockRenderProps) {
  const text = (block.props.text as string | undefined) ?? "";
  const levelRaw = Number(block.props.level ?? 2);
  const level = Math.max(1, Math.min(6, levelRaw)) as 1 | 2 | 3 | 4 | 5 | 6;
  const tag = `h${level}` as const;
  const baseStyle = {
    fontFamily: "var(--font-playfair, Georgia, serif)",
    fontWeight: 700,
    lineHeight: 1.1,
    margin: 0,
    fontSize: level === 1 ? "clamp(2rem, 5vw, 3.5rem)"
      : level === 2 ? "clamp(1.6rem, 4vw, 2.5rem)"
      : level === 3 ? "1.5rem"
      : level === 4 ? "1.25rem"
      : level === 5 ? "1.1rem"
      : "1rem",
    outline: "none",
  };
  const style = { ...baseStyle, ...blockStylesToCss(block.styles) };

  const ref = useRef<HTMLElement>(null);
  // Keep the DOM in sync when props change from outside (undo, paste, etc.)
  useEffect(() => {
    if (ref.current && ref.current.textContent !== text) ref.current.textContent = text;
  }, [text]);

  const editorProps = editorMode ? {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const next = e.currentTarget.textContent ?? "";
      if (next === text) return;
      window.dispatchEvent(new CustomEvent("lk-block-text-commit", {
        detail: { id: block.id, key: "text", value: next },
      }));
    },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); },
  } : {};

  return createElement(tag, {
    ref,
    "data-block-type": "heading",
    style,
    ...editorProps,
  }, text);
}
