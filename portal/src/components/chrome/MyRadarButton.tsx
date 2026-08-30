"use client";

import dynamic from "next/dynamic";
import { Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { MyRadarReading } from "@/lib/server/intelligence/myRadar";

// The topbar My Radar — your own week, one tap from anywhere.
//
// Same shape as its three neighbours (`DevConsoleButton` /
// `RadarQuickLookButton` / `NotificationCentreButton`): a 36px chrome button
// with an attention badge and a popover anchored under it that closes on Escape
// or an outside click. The icon is a GAUGE, deliberately not lucide's `Radar` —
// that is the Business Radar's icon, and two identical icons on one bar is a
// trap for exactly the person this control is for.
//
// The snapshot lives HERE, not in the panel: the panel unmounts on close like
// the other popovers, and the badge has to keep saying what the last read said
// after a stray outside click.

const MyRadarQuickLookPanel = dynamic(
  () => import("@/components/chrome/MyRadarQuickLookPanel").then(m => m.MyRadarQuickLookPanel),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[12rem] place-items-center text-xs text-black/40">Loading My Radar…</div>
    ),
  },
);

export interface MyRadarTopbarSnapshot {
  generatedAt: number;
  reading: MyRadarReading;
  headline: string;
}

export function MyRadarButton({ activeDepartment, initial }: { activeDepartment?: string; initial: MyRadarTopbarSnapshot }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(initial);

  useEffect(() => {
    // The embedded DepartmentSwitcher calls `router.refresh()` on switch, which
    // re-renders the server half and delivers a fresh `initial`. Adopting it
    // only when it is NEWER makes that a feature (the meters update after a hat
    // change) rather than a race with the panel's own fetch — the
    // `RadarQuickLookButton` guard, for the same reason.
    if (initial.generatedAt >= snapshot.generatedAt) setSnapshot(initial);
  }, [initial, snapshot.generatedAt]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape from inside the popover hands focus back to the trigger;
      // Escape from elsewhere leaves focus where it is (the neighbours' rule).
      if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Only "starved" badges. A department that is merely behind is glanceable
  // inside the panel — a behind-but-moving week is not an alarm, and a badge
  // that cries amber every ordinary Tuesday is a badge people learn to ignore.
  const starved = snapshot.reading.allocation.departments.filter(entry => entry.status === "starved").length;
  const label = starved
    ? `My Radar, ${starved} ${starved === 1 ? "department" : "departments"} starved`
    : "My Radar, no starved departments";

  return (
    <div ref={rootRef} className="mm-has-attention-badge relative overflow-visible">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="My Radar"
        onClick={() => setOpen(value => !value)}
        className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm transition hover:border-black/20 hover:bg-black/[0.025]"
      >
        <Gauge size={16} aria-hidden="true" />
        {starved > 0 ? (
          <span className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white" aria-hidden="true">
            {starved > 99 ? "99+" : starved}
          </span>
        ) : (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <section
          data-chrome-surface
          role="dialog"
          aria-label="My Radar"
          className="mm-popover mm-my-radar-popover fixed right-3 top-14 z-50 flex max-h-[min(42rem,calc(100dvh-4.5rem))] w-[min(29rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:absolute sm:right-0 sm:top-11"
        >
          <MyRadarQuickLookPanel
            activeDepartment={activeDepartment}
            snapshot={snapshot}
            onSnapshot={setSnapshot}
            onClose={() => setOpen(false)}
          />
        </section>
      ) : null}
    </div>
  );
}
