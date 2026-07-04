"use client";

// RichEditor — minimal rich-text textarea shim. The 02 source ships a
// contentEditable-based WYSIWYG; this stub renders a plain textarea
// that takes raw HTML so the lifted PageDetailPage compiles. When T1
// (or a separate text-editing plugin) ships a real rich-editor host,
// swap the implementation here — single-file change for callers.

import type { ChangeEvent } from "react";

export interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
}

export default function RichEditor({ value, onChange, placeholder, minHeight, className }: RichEditorProps) {
  function handle(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
  }
  return (
    <textarea
      value={value}
      onChange={handle}
      placeholder={placeholder}
      spellCheck
      style={{ minHeight: minHeight ?? 180 }}
      className={
        className ??
        "w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream font-mono leading-relaxed"
      }
    />
  );
}
