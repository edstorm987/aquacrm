"use client";

import { useCallback, useRef } from "react";

// Long press — hold something to get at what it can do.
//
// Ed, 2026-08-27: *"allow me to rename saved tabs if i do a long hold on it…
// and if i hold the star icon or the icon i can switch it to the workspace
// icons."*
//
// ── The three things a long press has to get right ───────────────────────
//
// 1. **It must not also click.** A saved tab is a LINK. Holding it and then
//    letting go must not navigate, or every rename would take you somewhere and
//    lose the input you were about to type into. The press marks itself as
//    fired and the click handler swallows the next click.
// 2. **It must not fight a drag.** These same chips are draggable into the
//    sidebar. Moving the pointer past a few pixels cancels the press, so a drag
//    that starts slowly is a drag and not a rename.
// 3. **It must work with a keyboard and a mouse, not only a finger.** Touch
//    gets the hold; a mouse gets the hold too; and the caller is expected to
//    keep the same action reachable from a menu, because a long press is not
//    discoverable and cannot be the only route to anything.

const HOLD_MS = 450;
const MOVE_TOLERANCE_PX = 8;

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onClickCapture: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

export function useLongPress(onLongPress: () => void, enabled = true): LongPressHandlers {
  const timer = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    origin.current = null;
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (!enabled) return;
    // Secondary buttons are the browser's business, not ours.
    if (event.button !== 0 && event.pointerType === "mouse") return;
    fired.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      cancel();
      onLongPress();
    }, HOLD_MS);
  }, [cancel, enabled, onLongPress]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!timer.current || !origin.current) return;
    const moved = Math.abs(event.clientX - origin.current.x) + Math.abs(event.clientY - origin.current.y);
    // Past a few pixels this is a drag, and these chips are draggable.
    if (moved > MOVE_TOLERANCE_PX) cancel();
  }, [cancel]);

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!fired.current) return;
    // The press already did something; the click that follows it must not
    // ALSO navigate. Captured and stopped rather than prevented on the link,
    // because the link is a child and would see it first.
    event.preventDefault();
    event.stopPropagation();
    fired.current = false;
  }, []);

  const onContextMenu = useCallback((event: React.MouseEvent) => {
    // A long press on touch raises the context menu on some platforms, which
    // would cover the very thing the press just opened.
    if (fired.current) event.preventDefault();
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerLeave: cancel, onClickCapture, onContextMenu };
}
