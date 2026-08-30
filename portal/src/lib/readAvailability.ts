/**
 * A read that either answered, or did not.
 *
 * Finding 2026-08-26 (issues #57): twenty-eight mounted paths caught a rejected
 * read and substituted `[]`, `null` or an empty snapshot. The screen then said
 * "No sites routed", "Nothing recorded yet", "No invoices yet", "Operations
 * clear" — every one of which is a *measurement*, and none of them was
 * measured. A failed read and an empty result are different facts and the
 * product must not confuse them.
 *
 * The shape below is deliberately not `T | null`. A rejected list read still
 * has to render *something*, and forcing every consumer through a null check
 * is how the `?? []` crept back in last time. So both branches carry `data`
 * (the fallback on failure) and the honesty lives in one boolean the consumer
 * must consult **before stating anything about the data** — the same
 * `available: false` idiom the marketing spine already uses.
 *
 * The rule this encodes:
 *
 *   available === false  →  you may show the shape, you may NOT state a fact
 *                           about it. No counts, no totals, no "clear",
 *                           no "up to date", no "nothing yet".
 *
 * `reason` is for the operator, never for the log-shaped detail of the failure:
 * "why" is rarely knowable from a caught promise and guessing it is how
 * "you are in a demo session" ended up in front of a real founder during an
 * outage (see smoke-truthful-surfaces).
 */

export interface ReadAvailability {
  /** False means the read was attempted and refused/failed — not that it was empty. */
  available: boolean;
  /** Operator-facing note, present only when `available` is false. */
  reason?: string;
}

export type ReadResult<T> = ReadAvailability & { data: T };

/** What a consumer shows in place of a count, total or state it cannot know. */
export const READ_UNAVAILABLE_LABEL = "Not read";

/** The one sentence every unavailable surface says, so the copy cannot drift. */
export const READ_UNAVAILABLE_NOTE = "This could not be read just now. Reload to try again.";

export function readOk<T>(data: T): ReadResult<T> {
  return { available: true, data };
}

export function readUnavailable<T>(fallback: T, reason = READ_UNAVAILABLE_NOTE): ReadResult<T> {
  return { available: false, data: fallback, reason };
}

/**
 * Run a read and keep the failure rather than erasing it.
 *
 * Replaces `await load().catch(() => fallback)` — same call shape, same
 * fallback, but the caller can still tell the two outcomes apart.
 */
export async function readOrUnavailable<T>(
  load: () => Promise<T>,
  fallback: T,
  reason = READ_UNAVAILABLE_NOTE,
): Promise<ReadResult<T>> {
  try {
    return readOk(await load());
  } catch {
    return readUnavailable(fallback, reason);
  }
}

/** True when every contributing read answered — the gate on any derived claim. */
export function allAvailable(...reads: ReadAvailability[]): boolean {
  return reads.every(read => read.available);
}
