"use client";

// Your sidebar, your saved tabs — settable from Settings.
//
// Ed, 2026-08-29: *"sidebar settings need to be in settings as well, the saved
// tab stuff in settings as well."*
//
// ── Why this is a list and not a second arranger ──────────────────────────
//
// The sidebar is arranged by DRAGGING it, and that is the right interaction —
// you rearrange a thing by moving it, in the place you use it. Rebuilding that
// as a form here would be a second editor for one record, which is the mistake
// this hub has already made once today.
//
// So this is the part dragging cannot do: see everything you have saved in one
// list, rename or remove one you can no longer find, and put the whole
// arrangement back. The reset especially — a sidebar you have dragged into a
// mess is hard to fix BY dragging.

import { useCallback, useState } from "react";
import { LoaderCircle, RotateCcw, Star, Trash2 } from "lucide-react";

import { useChromeLayout } from "@/components/chrome/pinnedTabsStore";
import { navToneColor } from "@/components/chrome/navTones";

export function WorkspaceLayoutPanel() {
  const { savedTabs, remove, clear, resetOrder, ready } = useChromeLayout();
  const [busy, setBusy] = useState("");

  const withBusy = useCallback((key: string, run: () => void) => {
    setBusy(key);
    try { run(); } finally { setBusy(""); }
  }, []);

  if (!ready) {
    return <p className="inline-flex items-center gap-2 text-xs text-black/40"><LoaderCircle size={13} className="animate-spin" /> Reading your arrangement…</p>;
  }

  return (
    <div className="grid gap-8">
      <div>
        <h3 className="text-sm font-semibold text-black/80">Saved tabs</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">
          Pages you starred. Hold one in the sidebar to rename it or change its icon and colour;
          here you can see them all at once and remove the ones you no longer use.
        </p>
        {savedTabs.length ? (
          <ul className="mt-3 divide-y divide-black/[0.07] rounded-md border border-black/10 bg-white">
            {savedTabs.map(tab => (
              <li key={tab.id} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: navToneColor(tab.tone) ?? "#d4a017" }}
                />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs font-semibold text-black/80">{tab.label}</strong>
                  <code className="block truncate font-mono text-[10px] text-black/40">{tab.href}</code>
                </span>
                <span className="shrink-0 text-[10px] uppercase text-black/35">{tab.placement.kind}</span>
                <button
                  type="button"
                  onClick={() => withBusy(tab.id, () => remove(tab.href))}
                  disabled={busy === tab.id}
                  aria-label={`Remove ${tab.label}`}
                  className="grid size-7 shrink-0 place-items-center rounded text-black/30 hover:bg-black/[0.06] hover:text-black/70"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-black/10 bg-black/[0.02] px-3 py-3 text-xs text-black/45">
            <Star size={14} className="text-black/25" aria-hidden="true" />
            Nothing saved yet. Star a page from the topbar to keep it here.
          </p>
        )}
        {savedTabs.length ? (
          <button
            type="button"
            onClick={() => withBusy("clear", clear)}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]"
          >
            <Trash2 size={13} aria-hidden="true" /> Remove all saved tabs
          </button>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-black/80">Sidebar arrangement</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">
          You rearrange the sidebar by dragging it, which is where that belongs. The one thing
          dragging cannot easily undo is a mess — so the way back is here.
        </p>
        <button
          type="button"
          onClick={() => withBusy("reset", resetOrder)}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]"
        >
          <RotateCcw size={13} aria-hidden="true" /> Put the sidebar back the way it ships
        </button>
      </div>
    </div>
  );
}
