// What the plugin-health panel is allowed to conclude from a health report.
//
// The route (`/api/portal/plugins/health`, built 2026-08-28) runs ten modules'
// `healthcheck` hooks and returns what they say. It has been correct and
// untouched since the day it landed — and nothing displayed it, so none of the
// reading rules below existed anywhere. They live here, not in the panel,
// because a component that owns its own state cannot be driven by a test, which
// is the same reason `devConsoleLoad` was lifted out of `DevConsolePanel`.
//
// ── The three distinctions this file exists to protect ────────────────────
//
// **1. Unknown is not broken.** A module that ships no `healthcheck` comes back
// `supported: false`. The route is careful never to fold that into `ok: false`,
// and its own smoke test asserts the unsupported branch contains no `ok: false`.
// A UI that paints those three modules red would re-introduce, in CSS, exactly
// the defect the route was written to avoid. Radar already states this rule for
// missing evidence: absence of evidence is a blind spot, said out loud.
//
// **2. A green module can have a red component.** `HealthStatus` carries an
// optional `components` map, and `client-crm` is the live proof that the two
// levels disagree: it returns top-level `ok: true` while reporting
// `segments: { ok: false }` when no segment is seeded. Showing only the top
// line would hide a real failure behind a green dot — the "declared, never
// consumed" defect wearing a new costume. So a module whose components disagree
// with its own headline is DEGRADED, and says which component.
//
// **3. Degraded must not silently re-score the route's summary.** The route
// counts `unhealthy` as `status.ok === false` and nothing else, and its test
// asserts the summary agrees with the rows. `degraded` is therefore a display
// tone only: it changes how a row is drawn, never what the totals say. The
// panel prints the route's own numbers rather than re-deriving them, so the two
// cannot drift apart the way the Dev Console's worker count once did.

import type { HealthStatus } from "@/built-ins/runtime/_types";

/** One module's answer, exactly as `/api/portal/plugins/health` returns it. */
export interface PluginHealthRow {
  pluginId: string;
  installId: string;
  /** False when the module ships no healthcheck at all. Not a failure. */
  supported: boolean;
  status?: HealthStatus;
  /** Set when the hook threw or timed out. */
  error?: string;
  durationMs: number;
}

/** The route's own tally. Printed as given — never recomputed here. */
export interface PluginHealthSummary {
  checked: number;
  unsupported: number;
  unhealthy: number;
}

export interface PluginHealthReport {
  scope: { agencyId: string; clientId?: string };
  health: PluginHealthRow[];
  summary: PluginHealthSummary;
}

/**
 * How a row is DRAWN. Four tones, because three would force one of the two
 * honest distinctions above to collapse into a lie.
 */
export type PluginHealthTone = "healthy" | "degraded" | "unhealthy" | "unknown";

/** A component that disagrees with its module's headline. */
export interface FailingComponent {
  name: string;
  message?: string;
}

/**
 * Components reporting `ok: false`, whatever the module's top-level verdict.
 *
 * Read even when the module says `ok: false` already: an unhealthy module with
 * a named failing component is more actionable than one without, and the panel
 * shows them in both cases.
 */
export function failingComponents(row: PluginHealthRow): FailingComponent[] {
  const components = row.status?.components;
  if (!components) return [];
  return Object.entries(components)
    .filter(([, component]) => component?.ok === false)
    .map(([name, component]) => ({ name, message: component.message }));
}

/**
 * The tone for one row.
 *
 * Order matters: `supported` is checked before anything reads `status`, because
 * an unsupported row legitimately has no status at all and must never fall
 * through to a verdict derived from `undefined`.
 */
export function healthTone(row: PluginHealthRow): PluginHealthTone {
  if (!row.supported) return "unknown";
  if (row.status?.ok === false) return "unhealthy";
  // Top-level ok. If a component disagrees, the module is not simply fine, and
  // the panel must not be the place that decides otherwise.
  if (failingComponents(row).length) return "degraded";
  return "healthy";
}

/**
 * The sentence under a module's name.
 *
 * A module's own `message` is preferred over anything invented here — it is the
 * only text in the system that knows what the module actually checked. The
 * fallbacks exist so a row is never blank, which reads as "still loading".
 */
export function healthHeadline(row: PluginHealthRow): string {
  if (!row.supported) return "No healthcheck — this module reports nothing.";
  if (row.error) return row.error;
  const message = row.status?.message?.trim();
  if (message) return message;
  return row.status?.ok === false ? "Reported unhealthy without a reason." : "Healthy.";
}

/** Tone ordering for display: what is wrong sorts above what is fine. */
const TONE_RANK: Record<PluginHealthTone, number> = {
  unhealthy: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
};

/**
 * Problems first, then alphabetical.
 *
 * The route sorts by `pluginId` so its output is stable and diffable. That is
 * the right default for an API and the wrong one for a panel that has to fit
 * ten rows into a 366px phone popover: the one broken module must not sort
 * below six healthy ones and land under the fold. The tie-break stays
 * alphabetical so the order is still deterministic.
 */
export function sortForDisplay(rows: PluginHealthRow[]): PluginHealthRow[] {
  return [...rows].sort((left, right) => {
    const byTone = TONE_RANK[healthTone(left)] - TONE_RANK[healthTone(right)];
    return byTone !== 0 ? byTone : left.pluginId.localeCompare(right.pluginId);
  });
}

/**
 * The one line the section header shows.
 *
 * Built from the ROUTE's summary, not from the rows, so the header and the
 * totals can never disagree — the Dev Console already shipped that bug once,
 * with a worker count derived from a deliberately capped list.
 *
 * `unsupported` is reported as "not reporting", never as a fault, and is
 * omitted entirely when it is zero rather than printed as a proud "0 unknown".
 */
export function healthSummaryLine(summary: PluginHealthSummary): string {
  if (summary.checked === 0 && summary.unsupported === 0) return "No modules installed here.";
  const parts: string[] = [];
  if (summary.unhealthy > 0) parts.push(`${summary.unhealthy} unhealthy`);
  const wellCount = summary.checked - summary.unhealthy;
  if (wellCount > 0) parts.push(`${wellCount} answering`);
  if (summary.unsupported > 0) parts.push(`${summary.unsupported} not reporting`);
  return parts.join(" · ");
}

/**
 * Does anything here deserve the founder's attention?
 *
 * Deliberately NOT true for `unsupported`. Three modules ship no healthcheck by
 * design; a badge that is permanently lit for a known, unchanging fact is a
 * badge nobody reads.
 */
export function healthNeedsAttention(report: PluginHealthReport): boolean {
  return report.summary.unhealthy > 0 || report.health.some(row => healthTone(row) === "degraded");
}

/**
 * The health route answers failures the same way the console route does — with
 * machine codes. The founder is the only reader this panel has.
 */
export function readableHealthError(code: string | undefined, httpStatus: number): string {
  if (httpStatus === 401 || code === "unauthorized") return "Your session ended. Sign in again.";
  if (httpStatus === 403 || code === "forbidden") return "This account cannot read module health.";
  if (httpStatus === 404 || code === "client not found") return "That client no longer exists.";
  return code || `Module health unavailable (${httpStatus}).`;
}
