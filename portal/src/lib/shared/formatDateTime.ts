const UK_DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

export function dateFromValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const normalized = typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value)
    : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function timestampFromValue(value: unknown): number | undefined {
  return dateFromValue(value)?.getTime();
}

export function formatUkDateTime(value: unknown, fallback = "Date needs review"): string {
  const date = dateFromValue(value);
  return date ? UK_DATE_TIME.format(date) : fallback;
}

export function formatUkDate(
  value: unknown,
  options: Intl.DateTimeFormatOptions,
  fallback = "Date needs review",
): string {
  const date = dateFromValue(value);
  return date ? new Intl.DateTimeFormat("en-GB", options).format(date) : fallback;
}

export function isoDateTimeValue(value: unknown): string | undefined {
  return dateFromValue(value)?.toISOString();
}

export function dateInputValue(value: unknown): string {
  return isoDateTimeValue(value)?.slice(0, 10) ?? "";
}

export function localDateTimeInputValue(value: unknown): string {
  const date = dateFromValue(value);
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Compact relative age: "just now" / "3m ago" / "5h ago" / "2d ago" /
 * "4mo ago" / "1y ago". Isomorphic (server + client) — pass `nowMs` so it's
 * deterministic and usable from client components.
 */
export function relativeAge(mtimeMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - mtimeMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(diff / 3_600_000);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(diff / 86_400_000);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
