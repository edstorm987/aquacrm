"use client";

/**
 * The one information icon.
 *
 * Ed asked for "information icons everywhere where needed" — the operator sees
 * a label like "Unmapped labels", "Blind" or "Portals ready" and has no way to
 * find out what it counts. Several surfaces had already grown their own answer
 * to that, and all of them were the same shape:
 *
 *     <span title="…"><Info size={13} aria-hidden /></span>
 *
 * which explains nothing to anybody who is not holding a mouse. A `title` on a
 * non-focusable span never opens from the keyboard, never opens on a touch
 * screen, is not announced by most screen readers, and cannot be read for long
 * enough to finish a sentence. So the explanation was, in practice, only there
 * for one third of the people meant to read it.
 *
 * This is the shared replacement: a real button that toggles a real panel, so
 * the same words reach mouse, keyboard, touch and screen-reader users. Adopt it
 * rather than hand-rolling another `title` — a second copy of this is exactly
 * the duplication the workspace hazards note warns about.
 *
 * Deliberately a click/focus disclosure and not a hover tooltip: hover cannot
 * be reached by touch or keyboard, so a hover-only explanation is the same
 * defect wearing a nicer coat.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

export interface InfoTipProps {
  /**
   * What is being explained, in the operator's own words — usually the exact
   * label the icon sits beside. It names the button for screen readers, so
   * "Unmapped labels" announces as "What Unmapped labels means, button".
   */
  label: string;
  /** The plain-English explanation. Full sentences, no jargon, no statistics. */
  children: ReactNode;
  /** `dark` for the near-black Command and Dev surfaces. */
  tone?: "light" | "dark";
  /** Icon size in pixels. Defaults to 13, matching the small stat labels. */
  size?: number;
  className?: string;
}

const PANEL_TONE = {
  light: "border-black/12 bg-white text-black/70 shadow-lg shadow-black/10",
  dark: "border-[#62e8ff]/25 bg-[#03131c] text-white/75 shadow-lg shadow-black/50",
} as const;

const BUTTON_TONE = {
  light: "text-black/30 hover:text-black/60 focus-visible:outline-black/45",
  dark: "text-white/35 hover:text-[#8ef1ff] focus-visible:outline-[#62e8ff]",
} as const;

export function InfoTip({ label, children, tone = "light", size = 13, className }: InfoTipProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLSpanElement | null>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);

  // Escape closes and hands focus back to the icon; a press or a focus move
  // outside just closes. Without both, an opened panel covers whatever is
  // underneath it with no way back other than reloading the page.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close(true); }
    };
    const onOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && wrapper.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("focusin", onOutside, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("focusin", onOutside, true);
    };
  }, [open, close]);

  // Keep the opened panel inside the viewport. These icons sit in grid cells
  // that can start near the right-hand edge — a 16rem panel anchored to one of
  // those would push the page sideways, and horizontal overflow is a browser
  // acceptance failure, not a cosmetic one. Measured and nudged imperatively so
  // it costs no extra render.
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    if (!open) { node.style.transform = ""; return; }
    node.style.transform = "";
    const margin = 8;
    const box = node.getBoundingClientRect();
    let shift = 0;
    if (box.right > window.innerWidth - margin) shift = window.innerWidth - margin - box.right;
    if (box.left + shift < margin) shift = margin - box.left;
    if (shift) node.style.transform = `translateX(${Math.round(shift)}px)`;
  }, [open]);

  return (
    <span ref={wrapper} className={`relative inline-flex align-middle ${className ?? ""}`} data-aqua-info-tip="true">
      <button
        ref={trigger}
        type="button"
        aria-label={`What ${label} means`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
        className={`grid size-6 shrink-0 place-items-center rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${BUTTON_TONE[tone]}`}
      >
        <Info size={size} aria-hidden="true" />
      </button>
      <span
        ref={panel}
        id={panelId}
        role="note"
        hidden={!open}
        data-testid="aqua-info-tip-panel"
        className={`absolute left-0 top-full z-40 mt-1 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-md border p-3 text-left text-xs font-normal normal-case leading-5 tracking-normal ${PANEL_TONE[tone]}`}
      >
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block">{children}</span>
      </span>
    </span>
  );
}
