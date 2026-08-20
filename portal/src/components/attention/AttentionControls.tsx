"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock3, Search, X } from "lucide-react";

import type { ResolutionKind } from "@/lib/inbox/resolutionExplain";

/**
 * Resolve / Evidence / Remind later / Dismiss — the controls an attention item
 * carries, wherever it appears.
 *
 * Extracted from Master Inbox so Actions uses the same component rather than a
 * lookalike. Two implementations of the same four buttons drift: one gains a
 * reminder preset, the other keeps a stale tooltip, and the operator learns
 * that "the same" control behaves differently depending on the screen it is
 * on.
 */
export function AttentionControls({
  title,
  kind = "in-app",
  resolveHref,
  evidenceHref,
  busy = false,
  onToggleEvidence,
  evidenceOpen,
  onResolve,
  onPark,
  onDismiss,
  onMarkDone,
}: {
  title: string;
  /**
   * What kind of job this is, which decides which controls make sense:
   *
   * - `in-app`      Resolve is the primary action; it opens the control that
   *                 fixes it, with the announcement bar and highlight.
   * - `judgement`   there is nothing to press, so Evidence is primary — the
   *                 decision is made by reading the numbers, then dismissing
   *                 or accepting it as work.
   * - `off-system`  the work happens elsewhere, so the useful action is
   *                 recording that you did it.
   *
   * Showing a Resolve button on a judgement call is the failure this prevents:
   * it promises a fix that does not exist.
   */
  kind?: ResolutionKind;
  /** Where Resolve goes. Ignored when `onResolve` is supplied. */
  resolveHref?: string;
  /**
   * Where the supporting records are. Behaves exactly like Resolve — it lands
   * on the record itself, not a list to search through.
   */
  evidenceHref?: string;
  busy?: boolean;
  /**
   * Expands the records in place. Preferred over `evidenceHref`: navigating
   * away costs the operator their place in the queue and makes them
   * reconstruct why the alert fired.
   */
  onToggleEvidence?: () => void;
  evidenceOpen?: boolean;
  onResolve?: () => void;
  onPark?: (until: number) => void;
  onDismiss?: () => void;
  /** Records that off-system work was carried out. */
  onMarkDone?: () => void;
}) {
  const resolveClasses =
    "inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-40";
  // Only offer Resolve where something can actually be resolved on a screen.
  const canResolve = kind === "in-app";

  return (
    <span className="flex flex-wrap items-center gap-2 lg:justify-end">
      {canResolve && onResolve ? (
        <button type="button" disabled={busy} onClick={onResolve} className={resolveClasses}>
          <span>Resolve</span><ArrowRight size={13} aria-hidden />
        </button>
      ) : canResolve && resolveHref ? (
        <Link href={resolveHref} className={resolveClasses}>
          <span>Resolve</span><ArrowRight size={13} aria-hidden />
        </Link>
      ) : null}

      {onToggleEvidence ? (
        <button
          type="button"
          onClick={onToggleEvidence}
          aria-expanded={evidenceOpen}
          title="Show the exact records behind this"
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${
            evidenceOpen
              ? "border border-black/25 bg-black/[0.045] text-black/80"
              : kind === "judgement"
                // Nothing else here resolves it, so reading the numbers is the
                // job — make that the obvious thing to press.
                ? "bg-black text-white hover:bg-black/85"
                : "border border-black/15 text-black/65 hover:bg-black/[0.035]"
          }`}
        >
          <Search size={13} aria-hidden />Evidence
        </button>
      ) : evidenceHref ? (
        <Link
          href={evidenceHref}
          title="Open the exact records behind this"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/15 px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.035]"
        >
          <Search size={13} aria-hidden />Evidence
        </Link>
      ) : null}

      {/* Off-system work is finished elsewhere; the only thing Aqua can do is
          record that it happened. */}
      {kind === "off-system" && onMarkDone ? (
        <button
          type="button"
          disabled={busy}
          onClick={onMarkDone}
          title="Record that this was dealt with outside Aqua"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-40"
        >
          <Check size={13} aria-hidden />Mark done
        </button>
      ) : null}

      {onPark ? <RemindLaterMenu disabled={busy} title={title} onPark={onPark} /> : null}

      {onDismiss ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          title="Hide until the underlying issue changes"
          aria-label={`Dismiss ${title} until it changes`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium text-black/50 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
        >
          <X size={13} aria-hidden />Dismiss
        </button>
      ) : null}
    </span>
  );
}

export function RemindLaterMenu({
  disabled,
  title,
  onPark,
}: {
  disabled: boolean;
  title: string;
  onPark: (until: number) => void;
}) {
  const now = Date.now();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return (
    <details className="group/remind relative">
      <summary
        aria-label={`Remind me later about ${title}`}
        className={`inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-medium text-black/55 hover:bg-black/[0.035] [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none opacity-40" : ""}`}
      >
        <Clock3 size={13} aria-hidden />Remind later
        <ChevronDown size={12} aria-hidden className="transition group-open/remind:rotate-180" />
      </summary>
      <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-md border border-black/10 bg-white py-1 shadow-xl">
        <ReminderChoice label="In 1 hour" onClick={() => onPark(now + 60 * 60 * 1000)} />
        <ReminderChoice label="Tomorrow at 09:00" onClick={() => onPark(tomorrow.getTime())} />
        <ReminderChoice label="In 3 days" onClick={() => onPark(now + 3 * 24 * 60 * 60 * 1000)} />
        <ReminderChoice label="In 7 days" onClick={() => onPark(now + 7 * 24 * 60 * 60 * 1000)} />
      </div>
    </details>
  );
}

function ReminderChoice({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block min-h-9 w-full px-3 text-left text-xs text-black/60 hover:bg-black/[0.04] hover:text-black"
    >
      {label}
    </button>
  );
}
