"use client";

// useMenuKeys — the keyboard model every `role="menu"` in this app owes its
// users. A menu role tells a screen reader "this is a menu, use the arrow
// keys"; without a handler that promise is a lie, and the reader's menu mode
// swallows the arrows so the menu becomes *less* operable than a plain list.
// (issues #138.)
//
// Usage — hand it the wrapper that holds BOTH the trigger and the popup, so a
// press on the closed trigger can open the menu and land on its first item:
//
//   const wrapRef = useRef<HTMLDivElement>(null);
//   useMenuKeys(wrapRef, { open, onOpen: () => setOpen(true), onClose: () => setOpen(false) });
//
// What it wires (APG menu button):
//   • ArrowDown / ArrowUp on the closed trigger  → open, focus first / last item
//   • ArrowDown / ArrowUp inside the open menu   → previous / next item, wrapping
//   • Home / End                                 → first / last item
//   • Escape                                     → close AND return focus to the trigger
//
// What it deliberately does NOT do: roving `tabindex`. These menus mix
// `menuitem`s with ordinary controls (toggles, links, inputs), so parking
// `tabindex="-1"` on the menu items alone would reorder Tab around them and
// make the menu worse for the keyboard users it already serves. Arrow keys are
// added ON TOP of the existing tab order, never in place of it.

import { useEffect, useRef, type RefObject } from "react";
import { nextRovingIndex } from "./useArrowNav";

/** Every flavour of menu item, plus the disabled/hidden exclusions. */
export const MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]):not([aria-hidden="true"]),' +
  '[role="menuitemcheckbox"]:not([disabled]):not([aria-hidden="true"]),' +
  '[role="menuitemradio"]:not([disabled]):not([aria-hidden="true"])';

interface MenuKeysOptions {
  /** Whether the menu is currently open. */
  open: boolean;
  /** Close the menu. Focus returns to the trigger for you. */
  onClose: () => void;
  /** Open the menu from an ArrowDown/ArrowUp on the trigger. Omit to leave
   *  opening to the click handler only. */
  onOpen?: () => void;
  /** Override when the items are not `menuitem`-roled. */
  itemSelector?: string;
}

export function useMenuKeys<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { open, onClose, onOpen, itemSelector = MENU_ITEM_SELECTOR }: MenuKeysOptions,
): void {
  // Set when WE opened the menu from the keyboard, so focus is only pulled
  // into the menu for a keyboard user — a mouse click keeps its own focus.
  const enterFrom = useRef<"first" | "last" | null>(null);
  // Call sites pass inline closures; keeping the latest in a ref means the
  // listener is attached once per open/close rather than once per render.
  const handlers = useRef({ onClose, onOpen });
  handlers.current = { onClose, onOpen };

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    function items(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    }

    function trigger(): HTMLElement | null {
      if (!container) return null;
      return (
        container.querySelector<HTMLElement>("[aria-haspopup]") ??
        container.querySelector<HTMLElement>("button")
      );
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!open) return;
        event.stopPropagation();
        handlers.current.onClose();
        trigger()?.focus();
        return;
      }

      if (!open) {
        // Closed: ArrowDown/ArrowUp on the trigger opens the menu.
        if (!handlers.current.onOpen) return;
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        if (document.activeElement !== trigger()) return;
        event.preventDefault();
        enterFrom.current = event.key === "ArrowDown" ? "first" : "last";
        handlers.current.onOpen?.();
        return;
      }

      const els = items();
      if (els.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = active ? els.indexOf(active) : -1;
      const target = nextRovingIndex(event.key, index, els.length, { wrap: true });
      if (target === null) return;
      // Home/End are only ours once focus is actually inside the menu —
      // otherwise they still mean "start/end of the page" for the trigger.
      if ((event.key === "Home" || event.key === "End") && index < 0) return;
      event.preventDefault();
      els[target]?.focus();
    }

    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [ref, open, itemSelector]);

  // A menu opened with ArrowDown/ArrowUp starts on an item, per APG.
  useEffect(() => {
    if (!open || !enterFrom.current) return;
    const container = ref.current;
    const from = enterFrom.current;
    enterFrom.current = null;
    if (!container) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    (from === "first" ? els[0] : els[els.length - 1])?.focus();
  }, [ref, open, itemSelector]);
}
