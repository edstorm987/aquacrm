import { Clock3 } from "lucide-react";

import { alertAge } from "@/lib/inbox/resolutionExplain";

/**
 * How long a job has been avoided, said out loud.
 *
 * Off-system work is the case that needs this. Nothing in Aqua carries it out,
 * so the only thing that moves it along is the operator choosing to — and a
 * parked item returns looking identical to a new one. Work put off five times
 * over three weeks reads exactly like work seen once this morning, which is
 * how it ends up never being done.
 *
 * Deliberately a statement rather than a warning. It reports what happened;
 * repeatedly deferring something can be the right call, and a row that scolds
 * the operator for it teaches them to dismiss rather than defer, which loses
 * the record entirely.
 */
export function DeferralNote({
  deferrals,
  firstDeferredAt,
  now = Date.now(),
}: {
  deferrals?: number;
  firstDeferredAt?: number;
  now?: number;
}) {
  if (!deferrals) return null;
  // Under a minute the span says nothing worth reading — "over the last 0
  // minutes" is noise on the one line that is meant to carry weight.
  const elapsed = firstDeferredAt ? now - firstDeferredAt : 0;
  const since = firstDeferredAt && elapsed >= 60_000
    ? ` over the last ${alertAge(firstDeferredAt, now)}`
    : "";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        // Three is where "later" has stopped meaning later.
        deferrals >= 3 ? "bg-amber-100 text-amber-900" : "bg-black/[0.06] text-black/50"
      }`}
      title={`You have put this off ${deferrals} time${deferrals === 1 ? "" : "s"}${since}`}
    >
      <Clock3 size={10} aria-hidden />
      Put off {deferrals}×{since}
    </span>
  );
}
