// Rendering telemetry counts honestly.
//
// `summarizeAgencyWebsite` (and the per-property summaries built the same way)
// return raw counts: a site whose Aqua Tag has never reported yields
// `pageviews24h: 0`, indistinguishable from a live site that had a quiet day.
// Several panels then printed `String(summary.pageviews24h)` — so a brand new
// agency read "Views today: 0" sitting directly beside "Tag: Waiting". The
// screen knew the tag had never spoken and still stated a measurement.
//
// This is the same rule Radar is already held to, and the same rule
// `commercialIntelligence.ts` encodes in its `number | null` pageviews:
// **unmeasured is "—", never 0.**
//
// Widening `ClientTelemetrySummary` itself to `number | null` would ripple
// through Radar, Performance, Development and the client workspace at once, so
// the measuredness is applied at the display edge instead — one helper, one
// meaning, reusable by the next panel that needs it.

/** The dash every honest surface in this codebase uses for "no reading". */
export const UNMEASURED = "—";

/**
 * A count that only counts if something actually reported it.
 *
 * `lastSeenAt` is the telemetry watermark (`telemetryLastSeenAt` /
 * `summary.lastSeenAt`). Falsy — never seen — means the number below it was
 * never measured, whatever it says.
 */
export function measuredCount(value: number, lastSeenAt: number | null | undefined): number | null {
  return lastSeenAt ? value : null;
}

/** `measuredCount`, formatted: a real reading, or the dash. */
export function measuredCountLabel(value: number, lastSeenAt: number | null | undefined): string {
  const measured = measuredCount(value, lastSeenAt);
  return measured === null ? UNMEASURED : measured.toLocaleString();
}
