"use client";

// Minimal touch → drag-event shim for the editor canvas. The block
// library tiles + canvas blocks use HTML5 drag-drop which mobile/tablet
// browsers don't fire from touch input. This shim simulates the events
// for any element with `data-touch-drag-payload` (a JSON-encoded
// payload to set on dataTransfer).
//
// Mount once at the editor root via <TouchDndProvider />. The Sidebar
// + Canvas tag draggable tiles with the payload data attribute and the
// shim converts touchstart/touchmove/touchend into dispatched
// dragstart/dragover/drop on the element under the finger.

import { useEffect } from "react";

interface TouchPayload { type: "x-block-type" | "x-block-id"; value: string }

export default function TouchDndProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("ontouchstart" in window)) return;  // skip on non-touch devices

    let active: { el: HTMLElement; payload: TouchPayload; lastOver: Element | null; ghost: HTMLElement | null } | null = null;

    function findPayload(el: EventTarget | null): { el: HTMLElement; payload: TouchPayload } | null {
      let cur = el as HTMLElement | null;
      while (cur && cur !== document.body) {
        const v = cur.getAttribute?.("data-touch-drag-payload");
        if (v) {
          try { return { el: cur, payload: JSON.parse(v) as TouchPayload }; }
          catch { return null; }
        }
        cur = cur.parentElement;
      }
      return null;
    }

    function start(e: TouchEvent) {
      const found = findPayload(e.target);
      if (!found) return;
      const t = e.touches[0];
      if (!t) return;
      const ghost = document.createElement("div");
      ghost.textContent = "+";
      ghost.style.cssText = `position: fixed; top: 0; left: 0; transform: translate(${t.clientX - 16}px, ${t.clientY - 16}px); width: 32px; height: 32px; border-radius: 50%; background: var(--brand-orange, #ff6b35); color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; z-index: 100000; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,0.5);`;
      document.body.appendChild(ghost);
      active = { el: found.el, payload: found.payload, lastOver: null, ghost };
      e.preventDefault();
    }

    function move(e: TouchEvent) {
      if (!active) return;
      const t = e.touches[0];
      if (!t) return;
      if (active.ghost) active.ghost.style.transform = `translate(${t.clientX - 16}px, ${t.clientY - 16}px)`;
      const over = document.elementFromPoint(t.clientX, t.clientY);
      if (over && over !== active.lastOver) {
        const dragOver = new DragEvent("dragover", { bubbles: true, cancelable: true });
        // Stub dataTransfer that the canvas drop handlers read.
        Object.defineProperty(dragOver, "dataTransfer", { value: stubDataTransfer(active.payload) });
        over.dispatchEvent(dragOver);
        active.lastOver = over;
      }
      e.preventDefault();
    }

    function end(e: TouchEvent) {
      if (!active) return;
      const t = e.changedTouches[0];
      if (!t) return cleanup();
      const drop = document.elementFromPoint(t.clientX, t.clientY);
      if (drop) {
        const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "dataTransfer", { value: stubDataTransfer(active.payload) });
        drop.dispatchEvent(ev);
      }
      cleanup();
    }

    function cleanup() {
      if (active?.ghost) active.ghost.remove();
      active = null;
    }

    function stubDataTransfer(payload: TouchPayload): DataTransfer {
      const map = new Map<string, string>();
      map.set(`application/${payload.type}`, payload.value);
      return {
        getData: (k: string) => map.get(k) ?? "",
        setData: (k: string, v: string) => { map.set(k, v); },
        types: Array.from(map.keys()),
        effectAllowed: payload.type === "x-block-type" ? "copy" : "move",
        dropEffect: payload.type === "x-block-type" ? "copy" : "move",
      } as unknown as DataTransfer;
    }

    document.addEventListener("touchstart", start, { passive: false });
    document.addEventListener("touchmove",  move,  { passive: false });
    document.addEventListener("touchend",   end);
    document.addEventListener("touchcancel", cleanup);

    return () => {
      document.removeEventListener("touchstart", start as EventListener);
      document.removeEventListener("touchmove",  move as EventListener);
      document.removeEventListener("touchend",   end as EventListener);
      document.removeEventListener("touchcancel", cleanup as EventListener);
      cleanup();
    };
  }, []);

  return null;
}
