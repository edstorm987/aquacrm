"use client";

import { Lock, TriangleAlert } from "lucide-react";

import { leaseNotice, type LeaseStatus } from "@/engines/editor/editing/leases";

/**
 * "Somebody is already in here" — said before the work is wasted.
 *
 * Modelled on the resolution announcement bar rather than a modal. A modal
 * demands a decision from somebody who has not decided to do anything yet; a
 * bar tells them what is happening and lets them read the page, which is often
 * all they came to do.
 *
 * It never disables the form. The bar is advisory — it prevents most
 * collisions by telling people, and the conflict check catches the rest.
 * Locking the fields would strand anybody whose colleague closed a laptop
 * without releasing, and the takeover is deliberately slower than that.
 */
export function EditingNotice({
  status,
  onTakeOver,
  canTakeOver = false,
}: {
  status: LeaseStatus;
  /** Offered only once the lease looks abandoned rather than merely quiet. */
  onTakeOver?: () => void;
  canTakeOver?: boolean;
}) {
  const notice = leaseNotice(status);
  if (!notice) return null;

  return (
    <div
      role="status"
      data-testid="editing-notice"
      className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
    >
      <Lock size={14} aria-hidden className="shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1 leading-5">{notice}</p>
      {canTakeOver && onTakeOver ? (
        <button
          type="button"
          onClick={onTakeOver}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 font-semibold text-amber-900 hover:bg-amber-100"
        >
          <TriangleAlert size={12} aria-hidden />Take over anyway
        </button>
      ) : null}
    </div>
  );
}
