"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

// The topbar's secondary controls, collapsed on a phone.
//
// Ed, 2026-08-27: *"mobile topbar too many icons maybe we make the icons in
// mobile like a carousel or something so we swipe to get access to more or
// something or maybe a topbar extension button."*
//
// ── Why a "more" button and not a carousel ───────────────────────────────
//
// A swipeable strip was the other option and it loses on two counts. A
// horizontally scrolling toolbar gives no indication that anything is off the
// edge — the controls that scroll away are simply gone as far as most people
// are concerned — and it cannot be reached from a keyboard in any sensible
// order. An overflow button is the boring, understood pattern: everything is
// one predictable tap away, in a list, in the same order every time.
//
// ── Why the badge count is aggregated ────────────────────────────────────
//
// The failure mode of any overflow is hiding something that needed attention.
// Nineteen unread dev findings behind a "…" is worse than a crowded topbar,
// because a crowded topbar at least tells the truth. So the collapsed group is
// watched for `.mm-attention-badge` — the shared class the notification and dev
// console buttons already use — and their numbers are summed onto the toggle.
// Nothing with a badge can hide silently.
//
// ── Why ONE copy of the children ─────────────────────────────────────────
//
// The obvious implementation renders the controls twice (inline for desktop,
// again inside the panel for mobile) and hides one with CSS. That duplicates
// every id, every popover, and every piece of state those controls own — two
// notification bells, two open panels. Instead the children are rendered once
// and the CONTAINER changes: `display: contents` above the breakpoint, so they
// lay out exactly as they do today, and a positioned panel below it.
//
// ── Why the panel closes itself ──────────────────────────────────────────
//
// Ed, 2026-08-29, with a phone screenshot: the Dev Console open on
// `/portal/agency/operations` with the privacy eye, Radar and the notification
// bell floating across its header. Two surfaces were on screen at once, and
// the panel's icons won the paint order because several of them carry a
// higher z-index than the surface (the privacy eye is `z-[70]`, workspace
// search is `z-50`).
//
// The panel is what has to give way: a menu closes when you choose from it.
// It cannot close by leaving the layout, though — every one of those surfaces
// is a DOM descendant of this container — so `data-open="no"` hides it with
// `visibility` and the surface re-declares itself visible. See the
// `.mm-topbar-overflow-items` block in globals.css.
//
// Closing is driven from two places because the controls come in two shapes.
// A control that OPENS something is caught by the observer below, which is the
// case that matters and the only one that can be detected after the fact. A
// control that just DOES something — the colour-mode toggle, the privacy eye —
// never mounts a surface, so the click handler covers it; that is also plain
// menu behaviour, and it is scoped to clicks that did not come from inside an
// already-open surface so tapping about inside one cannot reopen the panel.

/** Marks a surface a topbar control has opened. Kept in one place because the
 *  CSS above and the observer below have to agree on it. */
export const CHROME_SURFACE_ATTRIBUTE = "data-chrome-surface";

export function TopbarOverflow({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<HTMLDivElement | null>(null);

  // Sum whatever the hidden controls are trying to say, and step aside the
  // moment one of them opens a surface. Both are re-checked on any DOM change
  // beneath the panel: badges arrive from live data long after first paint,
  // and a surface mounts on a tap.
  useEffect(() => {
    const items = itemsRef.current;
    if (!items) return;
    const sync = () => {
      let total = 0;
      let marks = 0;
      for (const badge of items.querySelectorAll(".mm-attention-badge")) {
        marks += 1;
        const parsed = Number.parseInt((badge.textContent ?? "").trim(), 10);
        if (Number.isFinite(parsed)) total += parsed;
      }
      // A badge with no number (a plain dot) still counts as something worth
      // surfacing, so fall back to the number of marks rather than showing 0.
      setAttention(total || marks);

      if (items.querySelector(`[${CHROME_SURFACE_ATTRIBUTE}]`)) setOpen(false);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(items, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // The controls that open nothing. Capture phase so the panel is already on
  // its way out by the time the control's own handler runs, and ignored for
  // clicks that came from inside a surface the panel is deliberately outliving.
  const onItemsClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(`[${CHROME_SURFACE_ATTRIBUTE}]`)) return;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={wrapRef} className="mm-topbar-overflow" data-open={open ? "yes" : "no"}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={
          attention > 0
            ? `More controls, ${attention} needing attention`
            : "More controls"
        }
        className="mm-topbar-overflow-toggle relative inline-flex size-9 items-center justify-center rounded-md border border-black/10 bg-white/60 text-black/60 transition hover:bg-white hover:text-black"
      >
        {open ? <X size={16} /> : <MoreHorizontal size={16} />}
        {!open && attention > 0 ? (
          <span
            className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white"
            aria-hidden="true"
          >
            {attention > 99 ? "99+" : attention}
          </span>
        ) : null}
      </button>

      <div ref={itemsRef} className="mm-topbar-overflow-items" onClickCapture={onItemsClickCapture}>
        {children}
      </div>
    </div>
  );
}
