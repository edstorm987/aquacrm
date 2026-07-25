"use client";

// useFocusTrap — keeps Tab focus inside a modal subtree while it's
// active and returns focus to the previously-focused element on close.
// Hands off to native browser focus when `active === false`.
//
// Usage:
//   const ref = useRef<HTMLDivElement>(null);
//   useFocusTrap(ref, isOpen);
//
// The hook listens for Tab / Shift+Tab and bounces focus back to the
// first/last focusable element when the user tries to escape the
// container. It does NOT handle Escape — wire that in your component
// (one line of `onKeyDown`).

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    el => !el.hasAttribute("aria-hidden") && el.offsetParent !== null,
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (!container) return;
      const focusables = focusableIn(container);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus();
        } catch {
          /* element detached — fine */
        }
      }
    };
  }, [active, ref]);
}
