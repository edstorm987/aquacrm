"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { moveTabTo, useChromeLayout } from "./pinnedTabsStore";

// Dragging the sidebar into the order somebody wants — and dropping saved tabs
// into it.
//
// Ed, 2026-08-27: *"I want anyone to be able to reorder their sidebar, meaning
// saved tabs can properly integrate if dragged into it."*
//
// ── Why this wraps the server-rendered rows instead of re-rendering them ──
//
// The sidebar is assembled on the server: roles, plugins, grants, icons, badges
// and attention counts all resolve there, and the icon is a ReactNode. Lifting
// the rows into a client component to make them draggable would mean moving all
// of that across the boundary, and every future nav feature would have to keep
// two renderers in step.
//
// So this is a wrapper. The rows stay exactly as the server rendered them, each
// carrying a `data-nav-id`, and reordering is a question about POSITIONS of
// existing DOM nodes — which is what it actually is. The wrapper never invents
// a row, which also means a personal arrangement still cannot conjure nav the
// person may not have.
//
// ── The drop rules ───────────────────────────────────────────────────────
//
//   • a nav row dropped in this panel → reorder within the panel;
//   • a SAVED TAB dropped in this panel → it joins the panel as a nav row at
//     that position, which is the "properly integrate" half;
//   • anything else — a text selection, a file, a link from another app — is
//     ignored, because a nav that reacts to a stray drag is worse than one that
//     does not move.
//
// ── Two things the first version got wrong, both found by using it ────────
//
// **It did not move.** The order is applied on the SERVER, so a drop saved the
// new arrangement and then the row sat exactly where it was until the next
// navigation. Correct, and it feels broken. The fix is a `<style>` block this
// component renders itself, assigning a CSS `order` to each row — declarative,
// so React keeps it across re-renders, and it never touches the DOM tree the
// server component owns. `router.refresh()` follows, so the server and the
// screen agree again rather than the screen holding a local opinion for ever.
//
// **You could not do it with a keyboard.** HTML5 drag and drop is mouse-only,
// and Ed asked for *anyone* to be able to reorder their sidebar — which cannot
// mean "anyone with a mouse". Alt+ArrowUp / Alt+ArrowDown moves the focused row,
// announced through a live region. No new tab stops and no visible handle: a
// drag grip on every nav row would be chrome everybody pays for and few use,
// and `aria-keyshortcuts` is how the rows say the shortcut exists.

const NAV_TYPE = "application/x-aqua-nav-item";
const TAB_TYPE = "application/x-aqua-saved-tab";

/** Where a drop between rows lands: the index the dragged thing should take. */
function insertionIndex(list: HTMLElement, clientY: number, exclude?: string): number {
  const rows = [...list.querySelectorAll<HTMLElement>("[data-nav-id]")]
    .filter(row => row.dataset.navId !== exclude);
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index]!.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return rows.length;
}

export function SidebarReorder({
  panelId,
  children,
}: {
  panelId: string;
  children: ReactNode;
}) {
  const { itemOrder, savedTabs, save } = useChromeLayout();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [marker, setMarker] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // The arrangement as the screen should show it RIGHT NOW, before the server
  // re-renders. Null means "whatever the server sent", which is the state every
  // panel is in until somebody moves something.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /** The panel's rows in the order they are on screen right now. */
  const currentIds = useCallback((): string[] => {
    const list = listRef.current;
    if (!list) return [];
    const inDom = [...list.querySelectorAll<HTMLElement>("[data-nav-id]")].map(row => row.dataset.navId ?? "").filter(Boolean);
    if (!optimistic) return inDom;
    // A pending arrangement wins, but only over rows that still exist — the
    // server may have removed one since, and an order naming a row that is gone
    // would leave a hole in the numbering.
    const live = new Set(inDom);
    return [...optimistic.filter(id => live.has(id)), ...inDom.filter(id => !optimistic.includes(id))];
  }, [optimistic]);

  /** Save an arrangement, show it immediately, and let the server catch up. */
  const commit = useCallback((ids: string[], tabs?: typeof savedTabs) => {
    setOptimistic(ids);
    save(tabs ? { itemOrder: { ...itemOrder, [panelId]: ids }, savedTabs: tabs } : { itemOrder: { ...itemOrder, [panelId]: ids } });
    // Re-render the server tree so the CSS order and the real DOM order stop
    // disagreeing. Without this the panel would carry a local opinion about its
    // own arrangement indefinitely.
    router.refresh();
  }, [itemOrder, panelId, router, save, savedTabs]);

  const onDragStart = useCallback((event: React.DragEvent) => {
    const row = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-nav-id]");
    if (!row?.dataset.navId) return;
    setDragging(true);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(NAV_TYPE, row.dataset.navId);
    // A readable text/plain payload as well, so dropping a nav row into an
    // editor or another app yields its name rather than nothing.
    event.dataTransfer.setData("text/plain", row.textContent?.trim() ?? row.dataset.navId);
  }, []);

  const carriesSomethingWeWant = (event: React.DragEvent): boolean =>
    event.dataTransfer.types.includes(NAV_TYPE) || event.dataTransfer.types.includes(TAB_TYPE);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!carriesSomethingWeWant(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const list = listRef.current;
    if (!list) return;
    setMarker(insertionIndex(list, event.clientY));
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    const list = listRef.current;
    setMarker(null);
    setDragging(false);
    if (!list || !carriesSomethingWeWant(event)) return;
    event.preventDefault();

    const tabId = event.dataTransfer.getData(TAB_TYPE);
    if (tabId) {
      // A saved tab joins this panel. Its nav row id is namespaced, so it can
      // sit in the SAME order list as real nav items without colliding with one.
      const index = insertionIndex(list, event.clientY);
      const ids = currentIds();
      const navId = `saved:${tabId}`;
      const withoutIt = ids.filter(id => id !== navId);
      withoutIt.splice(Math.max(0, Math.min(index, withoutIt.length)), 0, navId);
      commit(withoutIt, moveTabTo(savedTabs, tabId, { kind: "panel", panelId }, index));
      return;
    }

    const navId = event.dataTransfer.getData(NAV_TYPE);
    if (!navId) return;
    const index = insertionIndex(list, event.clientY, navId);
    const ids = currentIds().filter(id => id !== navId);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, navId);
    commit(ids);
  }, [commit, currentIds, panelId, savedTabs]);

  /**
   * Alt+Arrow moves the focused row.
   *
   * Alt, not a bare arrow: arrows inside a nav are how somebody scrolls and how
   * assistive technology walks the list, and stealing them would break reading
   * the sidebar in order to allow rearranging it.
   */
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const row = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-nav-id]");
    const navId = row?.dataset.navId;
    if (!navId) return;
    const ids = currentIds();
    const from = ids.indexOf(navId);
    if (from < 0) return;
    const to = event.key === "ArrowUp" ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return;
    event.preventDefault();
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    commit(next);
    // Said out loud, because the row moving is invisible to a screen reader.
    setAnnouncement(`${row.textContent?.trim() || navId}, position ${to + 1} of ${ids.length}.`);
    // Focus follows the row, not the position — otherwise a second press moves
    // whatever has landed under the cursor instead of the thing being moved.
    window.requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(navId)}"] a, [data-nav-id="${CSS.escape(navId)}"] button`)?.focus();
    });
  }, [commit, currentIds]);

  return (
    <div
      ref={listRef}
      data-reorderable-panel={panelId}
      draggable={false}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => setMarker(null)}
      onDragEnd={() => { setMarker(null); setDragging(false); }}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      className={`mm-sidebar-reorderable relative ${dragging ? "is-dragging" : ""}`}
      style={marker !== null ? { boxShadow: "inset 0 0 0 1px var(--brand, #2f6f8f)", borderRadius: 8 } : undefined}
    >
      {optimistic ? (
        // CSS order, not a DOM move: the rows belong to the server component,
        // and reordering them by hand would fight React's reconciliation the
        // next time it renders. The list is already `flex flex-col`.
        <style>{optimistic.map((id, index) => `[data-reorderable-panel="${panelId}"] li[data-nav-id="${id}"]{order:${index}}`).join("")}</style>
      ) : null}
      {children}
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </div>
  );
}
