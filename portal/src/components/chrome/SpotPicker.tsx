"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, X } from "lucide-react";

import { spotFor, spotText, type SavedSpot } from "./savedSpot";

// "Save this spot" — pointing at the place a shortcut should land.
//
// The overlay puts the page into a picking mode: hovering outlines what would be
// captured, clicking captures it, Escape cancels. It exists because Ed asked to
// save *"a specific place that I choose"*, and choosing means pointing at it —
// not typing a selector, and not the app guessing from scroll position.
//
// ── The two things it must not do ─────────────────────────────────────────
//
//   • it must not let a click through to the page. Picking a spot on the
//     "Delete client" card must not delete the client, so the capture listener
//     runs in the CAPTURE phase and stops the event dead.
//   • it must not be enterable by accident. It is opened from a menu item that
//     says what it does, it dims the page, it says how to leave, and Escape
//     always works.

/** The smallest thing worth pointing at — below this it is noise, not a place. */
const MIN_SIZE = 24;

function pickableFrom(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  // Walk up out of text-level elements to something that reads as a "place":
  // a heading, a card, a section. Pointing at a bold word inside a paragraph
  // almost always means the paragraph.
  let node: Element | null = target;
  while (node && node !== document.body) {
    const rect = node.getBoundingClientRect();
    if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) return node;
    node = node.parentElement;
  }
  return null;
}

export function SpotPicker({ onPick, onCancel }: { onPick: (spot: SavedSpot) => void; onCancel: () => void }) {
  const [hovered, setHovered] = useState<{ rect: DOMRect; label: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const element = pickableFrom(event.target);
      if (!element) { setHovered(null); return; }
      setHovered({ rect: element.getBoundingClientRect(), label: spotText(element).slice(0, 60) || element.tagName.toLowerCase() });
    };

    // CAPTURE phase, and stopped dead. The page underneath must never receive
    // this click — see the note above.
    const onClick = (event: MouseEvent) => {
      const element = pickableFrom(event.target);
      event.preventDefault();
      event.stopPropagation();
      if (!element) { onCancel(); return; }
      const spot = spotFor(element);
      if (spot) onPick(spot); else onCancel();
    };

    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.body.style.cursor = "crosshair";
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.cursor = "";
    };
  }, [onCancel, onPick]);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-live="polite">
      <div className="absolute inset-0 bg-black/25" />
      {hovered ? (
        <div
          className="absolute rounded-md border-2 border-brand bg-brand/10 transition-[top,left,width,height] duration-75"
          style={{ top: hovered.rect.top, left: hovered.rect.left, width: hovered.rect.width, height: hovered.rect.height }}
        >
          {hovered.label ? (
            <span className="absolute -top-6 left-0 max-w-[20rem] truncate rounded bg-brand px-2 py-0.5 text-[11px] font-medium text-white shadow">
              {hovered.label}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="pointer-events-auto absolute inset-x-0 top-4 mx-auto flex w-fit items-center gap-3 rounded-full bg-black/85 px-4 py-2 text-xs font-medium text-white shadow-xl">
        <Crosshair size={14} aria-hidden />
        <span>Click the place this shortcut should land on.</span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] hover:bg-white/25"
        >
          <X size={11} aria-hidden /> Escape to cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
