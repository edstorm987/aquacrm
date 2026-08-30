// One list, one guard, both halves of the timezone picker.
//
// `Intl.supportedValuesOf("timeZone")` is the IANA set this runtime actually
// knows — 418 zones on Node 22. It deliberately omits "UTC" and every `Etc/*`
// alias, and "UTC" is what the old five-option <select> stored for anyone who
// picked it. Swapping in the raw Intl list alone would leave those workspaces
// holding a value no option matches, so UTC is unioned back in — and whatever
// is already stored is unioned in on top of that.
//
// No "server-only" here on purpose: the picker is a client component and the
// write paths are a route handler and a server-only adapter. One definition
// serves all three. The list is computed at runtime rather than written out as
// a literal, so none of those 418 strings ship in the client bundle.

/** Zones the picker offers that `Intl.supportedValuesOf` does not list. */
export const EXTRA_TIMEZONES = ["UTC"] as const;

let cached: string[] | null = null;

/** Every zone this runtime knows, plus UTC, sorted. Computed once per process. */
export function knownTimezones(): string[] {
  if (cached) return cached;
  const zones = new Set<string>(EXTRA_TIMEZONES);
  try {
    for (const zone of Intl.supportedValuesOf("timeZone")) zones.add(zone);
  } catch {
    // A runtime without supportedValuesOf still gets a short, usable list
    // rather than a crashed settings page.
  }
  cached = [...zones].sort((a, b) => a.localeCompare(b));
  return cached;
}

/**
 * The list to render, with `current` guaranteed present and first.
 *
 * This is what makes a custom zone stick: whatever is already STORED joins the
 * list even when Intl does not know it, so the picker never renders a saved
 * workspace as blank and never silently rewrites it on the next save.
 */
export function timezoneOptions(current?: string | null): string[] {
  const zones = knownTimezones();
  const trimmed = current?.trim();
  if (!trimmed || zones.includes(trimmed)) return zones;
  return [trimmed, ...zones];
}

/**
 * Is this a zone the runtime can actually format with?
 *
 * Moved verbatim from `lib/server/editing/appConfigAdapter.ts` (2026-08-30),
 * where it sat unexported behind a founder-only route — the only validator for
 * a value every workspace stores. `Intl.DateTimeFormat` accepts offsets like
 * "+05:30" as well as IANA names, which is the literal reading of Ed's "allow
 * for custom timezones".
 */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The canonical spelling of a valid zone, so "europe/london" stores as
 * "Europe/London" rather than as a case-variant the list will not match.
 */
export function normaliseTimezone(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return value;
  }
}
