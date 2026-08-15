function validDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const normalized = typeof value === "string" && /^\\d+$/.test(value.trim()) ? Number(value) : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatUkDate(value: unknown, options: Intl.DateTimeFormatOptions, fallback = "Date needs review"): string {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("en-GB", options).format(date) : fallback;
}

export function isoDateTimeValue(value: unknown): string | undefined {
  return validDate(value)?.toISOString();
}

export function dateInputValue(value: unknown): string {
  return isoDateTimeValue(value)?.slice(0, 10) ?? "";
}

