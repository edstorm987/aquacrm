"use client";

// Tip — small inline help bubble used across the lifted admin pages.
// Renders a label-styled hover/click affordance with details. Mirrors
// 02's contract; accepts both styles:
//   <Tip>Help text here</Tip>                 — children form
//   <Tip title="Why">Body</Tip>               — labelled body
//   <Tip id="x.y" text="..." align="top" />   — props form

import { useState } from "react";
import type { ReactNode } from "react";

export interface TipProps {
  id?: string;
  title?: string;
  text?: string;
  align?: "top" | "bottom" | "left" | "right";
  children?: ReactNode;
}

export default function Tip({ title, text, children }: TipProps) {
  const [open, setOpen] = useState(false);
  const body: ReactNode = children ?? text ?? null;
  return (
    <span className="inline-flex relative align-middle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ml-1 text-[10px] w-4 h-4 rounded-full bg-white/10 text-brand-cream/65 hover:bg-white/20 hover:text-brand-cream"
        title={title ?? text}
        aria-label={title ?? "Help"}
      >
        ?
      </button>
      {open && body && (
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-64 p-2.5 rounded-lg bg-brand-black-card border border-white/10 text-[11px] text-brand-cream/85 leading-snug shadow-lg">
          {title && <span className="block font-semibold text-brand-cream mb-1">{title}</span>}
          {body}
        </span>
      )}
    </span>
  );
}
