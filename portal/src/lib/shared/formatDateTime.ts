export const BUSINESS_TIME_ZONE = "Europe/London";

const UK_DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: BUSINESS_TIME_ZONE,
});

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CALENDAR_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

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
  return date ? new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: options.timeZone ?? BUSINESS_TIME_ZONE,
  }).format(date) : fallback;
}

export function isoDateTimeValue(value: unknown): string | undefined {
  return dateFromValue(value)?.toISOString();
}

function normaliseCalendarDate(value: string): string | null {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function calendarFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = CALENDAR_FORMATTERS.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  CALENDAR_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/**
 * A business calendar date is not a UTC timestamp and not the browser's local
 * date. Aqua currently operates its business records in Europe/London; callers
 * can pass another explicit IANA zone when a workspace gains that policy.
 */
export function businessCalendarDate(
  value: unknown = Date.now(),
  timeZone = BUSINESS_TIME_ZONE,
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY.test(trimmed)) return normaliseCalendarDate(trimmed) ?? "";
  }
  const date = dateFromValue(value);
  if (!date) return "";
  const parts = calendarFormatter(timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function businessCalendarMonth(
  value: unknown = Date.now(),
  timeZone = BUSINESS_TIME_ZONE,
): string {
  return businessCalendarDate(value, timeZone).slice(0, 7);
}

/** Add whole calendar days without treating 23/25-hour DST days as 24 hours. */
export function addBusinessCalendarDays(
  days: number,
  value: unknown = Date.now(),
  timeZone = BUSINESS_TIME_ZONE,
): string {
  if (!Number.isSafeInteger(days)) return "";
  const base = businessCalendarDate(value, timeZone);
  const match = DATE_ONLY.exec(base);
  if (!match) return "";
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return date.toISOString().slice(0, 10);
}

export function dateInputValue(value: unknown, timeZone = BUSINESS_TIME_ZONE): string {
  return businessCalendarDate(value, timeZone);
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
