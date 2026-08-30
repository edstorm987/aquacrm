"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PenLine, Shapes, Undo2, X } from "lucide-react";

import { moveTabTo, useChromeLayout } from "./pinnedTabsStore";
import { SavedTabIconPicker } from "./SavedTabIconPicker";

/**
 * The controls a saved tab keeps after it is merged into a nav panel.
 *
 * Ed, 2026-08-30: *"the saved tabs loose all their controls once reordered with
 * the defaults we need the controls all back in the merged reordered bit"* and
 * *"it cannot revert sidebar saved tabs back to saved tabs once i have merged
 * them in with the others."*
 *
 * Both are the same bug seen from two ends. `applyPersonalChrome` turns a
 * panel-placed tab into an ordinary `NavItem`, so from the row's point of view
 * it stopped being a saved tab the moment it was dragged in — no rename, no
 * icon, no unpin, and no way back to the Saved section. Arranging something
 * silently took away the ability to un-arrange it, which is the one thing a
 * personal arrangement must never do.
 *
 * The row itself is still server-rendered; this is a sibling of the link, not a
 * child of it — a button inside an anchor is invalid and unreachable by
 * keyboard.
 */
export function SavedRowControls({ tabId, label }: { tabId: string; label: string }) {
  const router = useRouter();
  const { savedTabs, itemOrder, rename, setIcon, remove, save } = useChromeLayout();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const iconRef = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(label);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const tab = savedTabs.find(candidate => candidate.id === tabId);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) { setOpen(false); setRenaming(false); }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); setRenaming(false); }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!tab) return null;

  /**
   * Back to the Saved section.
   *
   * Two writes that must happen together: the placement goes back to
   * `sidebar`, and the nav id leaves this panel's order. Dropping only the
   * placement would leave a dangling id in `itemOrder` that positions a row no
   * longer in the panel; dropping only the order would leave the tab rendering
   * in the panel with its placement lying about where it lives.
   */
  function returnToSaved() {
    const navId = `saved:${tabId}`;
    const nextOrder: Record<string, string[]> = {};
    for (const [panelId, ids] of Object.entries(itemOrder)) {
      const kept = ids.filter(id => id !== navId);
      if (kept.length) nextOrder[panelId] = kept;
    }
    save({
      itemOrder: nextOrder,
      savedTabs: moveTabTo(savedTabs, tabId, { kind: "sidebar" }, savedTabs.length),
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Options for ${label}`}
        className="mm-saved-row-controls grid size-6 place-items-center rounded-md text-black/40 hover:bg-black/[0.06] hover:text-black/70"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-7 z-50 w-56 rounded-md border border-black/10 bg-white p-1 shadow-lg"
        >
          {renaming ? (
            <form
              className="p-1"
              onSubmit={event => {
                event.preventDefault();
                const next = draft.trim();
                if (next) rename(tabId, next);
                setRenaming(false);
                setOpen(false);
                router.refresh();
              }}
            >
              <label className="sr-only" htmlFor={`rename-${tabId}`}>Rename this shortcut</label>
              <input
                id={`rename-${tabId}`}
                autoFocus
                value={draft}
                onChange={event => setDraft(event.target.value)}
                className="w-full rounded-md border border-black/15 px-2 py-1.5 text-sm"
              />
            </form>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setDraft(tab!.label); setRenaming(true); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-black/[0.05]"
              >
                <PenLine size={14} aria-hidden /> Rename this shortcut
              </button>

              <button
                ref={iconRef}
                type="button"
                role="menuitem"
                onClick={() => setPicking(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-black/[0.05]"
              >
                <Shapes size={14} aria-hidden /> Change the icon
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={returnToSaved}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-black/[0.05]"
              >
                <Undo2 size={14} aria-hidden /> Move back to Saved tabs
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => { remove(tab!.href); setOpen(false); router.refresh(); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                <X size={14} aria-hidden /> Unpin this page
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* Portalled, so it escapes the sidebar's own stacking and scroll. */}
      {picking ? (
        <SavedTabIconPicker
          current={tab.icon}
          anchor={iconRef.current}
          onPick={next => { setIcon(tabId, next); setPicking(false); setOpen(false); router.refresh(); }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
