"use client";

// useFocusTrap — the one keyboard contract every `aria-modal` dialog in the
// portal shares. While the dialog is open the hook:
//   1. puts focus inside it (an explicit `initialFocus` target, otherwise the
//      first focusable child — never stealing focus a child `autoFocus`
//      already placed),
//   2. keeps Tab / Shift+Tab cycling inside the dialog subtree,
//   3. closes on Escape when the caller passes `onEscape`,
//   4. returns focus to whatever was focused before the dialog opened.
// Hands off to native browser focus when `active === false`.
//
// Usage:
//   const dialogRef = useRef<HTMLDivElement>(null);
//   useFocusTrap(dialogRef, isOpen, { onEscape: close });
//
// Escape is opt-in per dialog rather than automatic: a dialog holding unsaved
// work may want a confirm step instead of a silent dismissal, so the caller
// decides. Every dialog that is safe to dismiss should pass it.

import { useEffect, useRef, type RefObject } from "react";

export interface FocusTrapOptions {
  // Called when Escape is pressed while the dialog is open. Omit for dialogs
  // that must not be dismissed by keyboard alone.
  onEscape?: () => void;
  // Element to focus when the dialog opens. Defaults to the first focusable
  // child of the container.
  initialFocus?: RefObject<HTMLElement | null>;
}

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

/**
 * Where Tab must land to stay inside the dialog — the whole trap, with no DOM
 * in it so it can be read and tested on its own.
 *
 * `activeIndex` is the focused element's position among the dialog's focusable
 * children, or -1 when focus is outside the dialog altogether. The answer is
 * the index to force focus onto, or `null` when the browser's own next stop is
 * already inside and should be left alone.
 */
export function wrapFocusIndex(count: number, activeIndex: number, shiftKey: boolean): number | null {
  if (count <= 0) return null;
  // Focus has escaped the dialog (or never entered it): pull it back to the
  // end the user was tabbing towards. Both directions, not just backwards.
  if (activeIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey) return activeIndex === 0 ? count - 1 : null;
  return activeIndex === count - 1 ? 0 : null;
}

/**
 * Open traps, oldest first. A dialog opened on top of another dialog (a
 * ConfirmDialog over an editor, say) must be the ONLY one that answers Escape
 * and Tab, or one keypress closes the whole stack.
 */
const openTraps: object[] = [];

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: FocusTrapOptions = {},
): void {
  // Keep the latest callbacks in a ref so an inline `{ onEscape: () => ... }`
  // object does not re-run the effect on every render — re-running would
  // restore focus mid-dialog and fight the user for the caret.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const token = {};
    openTraps.push(token);
    const isTopmost = () => openTraps[openTraps.length - 1] === token;

    // Initial focus: an explicit target wins; otherwise the first focusable
    // child, unless a child `autoFocus` already put focus inside the dialog.
    const explicit = optionsRef.current.initialFocus?.current ?? null;
    if (explicit && typeof explicit.focus === "function") {
      explicit.focus();
    } else if (!container.contains(document.activeElement)) {
      focusableIn(container)[0]?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (!container) return;
      // A dialog stacked on this one owns the keyboard until it closes.
      if (!isTopmost()) return;
      const focusables = focusableIn(container);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const activeEl = document.activeElement as HTMLElement | null;
      const target = wrapFocusIndex(
        focusables.length,
        activeEl ? focusables.indexOf(activeEl) : -1,
        e.shiftKey,
      );
      if (target === null) return;
      e.preventDefault();
      focusables[target].focus();
    }

    // Escape is listened for on the window so it still closes the dialog when
    // focus has been dragged outside the container by a portal or an iframe.
    function onWindowKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Only the top dialog closes, so one Escape does not collapse the stack.
      if (!isTopmost()) return;
      const onEscape = optionsRef.current.onEscape;
      if (!onEscape) return;
      if (e.defaultPrevented) return;
      onEscape();
    }

    container.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onWindowKeyDown);
      const index = openTraps.indexOf(token);
      if (index >= 0) openTraps.splice(index, 1);
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
