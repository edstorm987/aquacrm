"use client";

// useArrowNav — keyboard navigation for table rows / sidebar items /
// list items. Wires arrow Up/Down (and optionally Left/Right) to move
// focus between siblings matched by `selector` inside the container.
//
// Usage:
//   const ref = useRef<HTMLUListElement>(null);
//   useArrowNav(ref, "[role='option']");
//   <ul ref={ref}>...</ul>
//
// The first matched element gets `tabindex="0"` so it's reachable via
// Tab; subsequent elements get `tabindex="-1"` and are reached by
// arrow keys. Roving-tabindex pattern from APG.

import { useEffect, type RefObject } from "react";

interface Options {
  // CSS selector for items inside `ref` that should participate.
  selector: string;
  // Set to true to also wire Left/Right (default: only Up/Down).
  horizontal?: boolean;
  // Set to true to wrap focus from last → first / first → last.
  wrap?: boolean;
}

export interface RovingOptions {
  horizontal?: boolean;
  wrap?: boolean;
  // Set to false to leave Home/End alone (default: they jump to the ends).
  homeEnd?: boolean;
}

/** Where a key press should move the roving index, or `null` when the key is
 *  not ours to handle. Extracted from the hook so the keyboard contract can be
 *  tested without a DOM — `index` is the currently focused item (`-1` when
 *  focus is not on an item yet, e.g. it is still on a menu trigger). */
export function nextRovingIndex(
  key: string,
  index: number,
  count: number,
  options: RovingOptions = {},
): number | null {
  const { horizontal = false, wrap = false, homeEnd = true } = options;
  if (count <= 0) return null;
  if (homeEnd && key === "Home") return 0;
  if (homeEnd && key === "End") return count - 1;

  const forward = key === "ArrowDown" || (horizontal && key === "ArrowRight");
  const backward = key === "ArrowUp" || (horizontal && key === "ArrowLeft");
  if (!forward && !backward) return null;

  // Focus sitting outside the item set (a trigger, say) enters at an end
  // rather than being ignored — ArrowDown opens onto the first item.
  if (index < 0) return forward ? 0 : count - 1;

  const target = forward ? index + 1 : index - 1;
  if (target < 0) return wrap ? count - 1 : 0;
  if (target >= count) return wrap ? 0 : count - 1;
  return target;
}

export function useArrowNav<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: Options,
): void {
  const { selector, horizontal = false, wrap = false } = options;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    function items(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(selector));
    }

    function applyRovingTabindex() {
      const els = items();
      if (els.length === 0) return;
      els.forEach((el, i) => {
        if (!el.hasAttribute("tabindex")) {
          el.setAttribute("tabindex", i === 0 ? "0" : "-1");
        }
      });
    }

    function onKey(e: KeyboardEvent) {
      const els = items();
      if (els.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? els.indexOf(active) : -1;
      if (idx < 0) return;

      const target = nextRovingIndex(e.key, idx, els.length, { horizontal, wrap });
      if (target === null) return;
      e.preventDefault();
      // Move tabindex with focus.
      els[idx].setAttribute("tabindex", "-1");
      els[target].setAttribute("tabindex", "0");
      els[target].focus();
    }

    applyRovingTabindex();
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [ref, selector, horizontal, wrap]);
}
