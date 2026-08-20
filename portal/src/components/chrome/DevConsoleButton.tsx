"use client";

import dynamic from "next/dynamic";
import { Hammer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DevConsoleBadge } from "@/lib/server/devConsoleStatus";
import type { FindingSeverity } from "@/lib/server/devTeamFindings";

// The topbar Dev Console — the ambient half of the Dev Team workspace.
//
// Same shape as its two neighbours (`RadarQuickLookButton` /
// `NotificationCentreButton`): a 36px chrome button with an attention badge and
// a popover anchored under it that closes on Escape or an outside click. Two
// things are deliberately different:
//
//   1. The panel is LAZY (`next/dynamic`, loaded on first open — the
//      `GlobalAdvisorDrawer` precedent). The icon renders on every page a
//      founder loads, so a console nobody opened has to cost nothing.
//   2. The DRAFT lives HERE, not in the panel. The panel unmounts on close like
//      the other popovers, and a half-written finding surviving a stray click
//      is the entire point of capturing in place — losing the thought is the
//      exact failure this feature exists to prevent.

const DevConsolePanel = dynamic(
  () => import("@/components/chrome/DevConsolePanel").then(m => m.DevConsolePanel),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[12rem] place-items-center text-xs text-black/40">Loading Dev Console…</div>
    ),
  },
);

export interface FindingDraft {
  title: string;
  note: string;
  /** `null` = follow the page you're on. A string means you typed your own. */
  where: string | null;
  severity: FindingSeverity;
  /** Screenshots as data URLs — exactly what the findings API accepts. */
  shots: string[];
}

export const EMPTY_DRAFT: FindingDraft = { title: "", note: "", where: null, severity: "bug", shots: [] };

export function DevConsoleButton({ initialBadge }: { initialBadge: DevConsoleBadge }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(initialBadge.attention);
  const [draft, setDraft] = useState<FindingDraft>(EMPTY_DRAFT);

  // The server count is the source of truth on every navigation; the panel
  // refreshes it from the live scan whenever the console is opened.
  useEffect(() => {
    setAttention(initialBadge.attention);
  }, [initialBadge.attention]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unsaved = Boolean(draft.title.trim() || draft.note.trim() || draft.shots.length);
  const label = attention
    ? `Dev Console, ${attention} items need attention${unsaved ? ", and an unsaved finding" : ""}`
    : unsaved ? "Dev Console, an unsaved finding is waiting" : "Dev Console, nothing needs attention";

  return (
    <div ref={rootRef} className="mm-has-attention-badge relative overflow-visible">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Dev Console"
        onClick={() => setOpen(value => !value)}
        className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm transition hover:border-black/20 hover:bg-black/[0.025]"
      >
        <Hammer size={16} aria-hidden="true" />
        {attention > 0 ? (
          <span className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white" aria-hidden="true">
            {attention > 99 ? "99+" : attention}
          </span>
        ) : unsaved ? (
          // An unsaved capture is its own kind of "come back to me".
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden="true" />
        ) : (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label="Dev Console"
          className="mm-popover mm-dev-console-popover fixed right-3 top-14 z-50 flex max-h-[min(42rem,calc(100dvh-4.5rem))] w-[min(29rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:absolute sm:right-0 sm:top-11"
        >
          <DevConsolePanel
            draft={draft}
            onDraftChange={setDraft}
            onAttentionChange={setAttention}
            onClose={() => setOpen(false)}
          />
        </section>
      ) : null}
    </div>
  );
}
