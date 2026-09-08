const BUSINESS_TIME_ZONE = "Europe/London";

function validDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const normalized = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Collapse the two en-GB Intl outputs that differ BY JS ENGINE (V8 "Sept" / ", "
 * vs WebKit "Sep" / " at ") so a server (Node) render and a client (WebKit)
 * render are byte-identical and React does not throw a hydration mismatch.
 * Mirrors src/lib/shared/formatDateTime.ts.
 */
function stableUkDateString(formatted: string): string {
  return formatted.replace(/\bSept\b/g, "Sep").replace(/ at /g, ", ");
}

export function formatUkDate(value: unknown, options: Intl.DateTimeFormatOptions, fallback = "Date needs review"): string {
  const date = validDate(value);
  if (!date) return fallback;
  // Business records are Europe/London, never the runtime zone (Railway runs UTC).
  // Pinning it keeps SSR and client output identical and TZ-independent; a caller
  // may still override with an explicit options.timeZone.
  return stableUkDateString(new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: options.timeZone ?? BUSINESS_TIME_ZONE,
  }).format(date));
}

export function isoDateTimeValue(value: unknown): string | undefined {
  return validDate(value)?.toISOString();
}

export function dateInputValue(value: unknown): string {
  return isoDateTimeValue(value)?.slice(0, 10) ?? "";
}
