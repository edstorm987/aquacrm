"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";

import { NAV_ICONS, SAVED_TAB_ICON_CHOICES } from "./navIcons";
import { WORKSPACES } from "@/lib/chrome/workspaces";

// Choosing what a saved tab looks like.
//
// Ed, 2026-08-27: *"if i hold the star icon or the icon i can switch it to the
// workspace icons — every workspace should have an icon."*
//
// ── Derived by default, chosen when chosen ───────────────────────────────
//
// A saved tab's icon is normally the icon of the nav item its href sits under,
// resolved live so it can never drift. This picker sets an override, and the
// first entry clears it again — because "put it back how it was" has to be
// reachable, or an override is a one-way door.
//
// The choices come from the app's own nav vocabulary (`NAV_ICONS`) plus the
// workspaces, rather than a fresh set of pictures meaning the same things.
//
// ── Why this is a PORTAL ─────────────────────────────────────────────────
//
// It is opened by a long press, and a long press has to swallow the click that
// follows it or the chip's link fires. Rendered inside the chip, the picker was
// a descendant of that swallow — the browser walk found every icon click being
// eaten by the very handler that opened the picker. A portal puts it outside
// the press handler entirely, so its buttons are ordinary buttons again.

export function SavedTabIconPicker({
  current,
  anchor,
  onPick,
  onClose,
}: {
  current?: string;
  /** The element the picker sits under — it is portalled, so it needs telling. */
  anchor: HTMLElement | null;
  onPick: (icon: string | undefined) => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Workspaces first — they are what Ed named — then the rest of the nav
  // vocabulary. Deduped by key so a workspace using a nav icon appears once.
  const seen = new Set<string>();
  const groups = [
    {
      label: "Workspaces",
      items: WORKSPACES.map(workspace => ({ key: workspace.icon, label: workspace.label })),
    },
    { label: "Areas", items: [...SAVED_TAB_ICON_CHOICES] },
  ].map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (seen.has(item.key) || !NAV_ICONS[item.key]) return false;
      seen.add(item.key);
      return true;
    }),
  })).filter(group => group.items.length);

  if (!mounted) return null;
  const rect = anchor?.getBoundingClientRect();
  // Clamped so a chip near the right edge does not open a panel off-screen.
  const left = Math.max(8, Math.min((rect?.left ?? 8), window.innerWidth - 264));
  const top = (rect?.bottom ?? 8) + 6;

  return createPortal(
    <div
      ref={wrapRef}
      role="dialog"
      aria-label="Choose an icon"
      style={{ position: "fixed", left, top }}
      className="z-[190] w-64 rounded-lg border border-black/10 bg-white p-2 shadow-xl shadow-black/10"
    >
      <button
        type="button"
        onClick={() => { onPick(undefined); onClose(); }}
        className="mb-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-black/70 transition hover:bg-black/[0.05]"
      >
        <span className="grid size-5 shrink-0 place-items-center text-black/40" aria-hidden><RotateCcw size={13} /></span>
        {current ? "Back to the automatic icon" : "Automatic (matches where it points)"}
      </button>
      {groups.map(group => (
        <div key={group.label} className="mb-1 last:mb-0">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/35">{group.label}</p>
          <div className="grid grid-cols-5 gap-1">
            {group.items.map(item => {
              const Icon = NAV_ICONS[item.key]!;
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => { onPick(item.key); onClose(); }}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={active}
                  className={[
                    "grid size-10 place-items-center rounded-md border transition",
                    active
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-transparent text-black/55 hover:border-black/10 hover:bg-black/[0.04] hover:text-black/80",
                  ].join(" ")}
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
