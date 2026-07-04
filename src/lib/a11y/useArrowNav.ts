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

      const next =
        e.key === "ArrowDown" || (horizontal && e.key === "ArrowRight")
          ? idx + 1
          : e.key === "ArrowUp" || (horizontal && e.key === "ArrowLeft")
            ? idx - 1
            : null;

      if (next === null) return;
      e.preventDefault();
      let target = next;
      if (target < 0) target = wrap ? els.length - 1 : 0;
      if (target >= els.length) target = wrap ? 0 : els.length - 1;
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
