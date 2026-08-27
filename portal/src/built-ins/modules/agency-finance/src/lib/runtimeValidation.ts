import { SUPPORTED_CURRENCIES } from "./currencies";
import type { Currency, ExpenseAttachment } from "./domain";

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(item => item.code) as readonly Currency[];

function fieldError(field: string, expectation: string): Error {
  return new Error(`agency-finance: ${field} ${expectation}`);
}

export function assertKnownFields(value: unknown, allowed: readonly string[], field = "body"): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fieldError(field, "must be an object");
  }
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter(key => !allowedSet.has(key));
  if (unknown.length) throw fieldError(field, `contains unsupported field(s): ${unknown.join(", ")}`);
}

export function assertAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw fieldError(field, `must be one of: ${allowed.join(", ")}`);
  }
}

export function assertOptionalAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): asserts value is T | undefined {
  if (value !== undefined) assertAllowedValue(value, allowed, field);
}

export function assertCurrency(value: unknown, field = "currency"): asserts value is Currency {
  assertAllowedValue(value, CURRENCY_CODES, field);
}

export function assertOptionalCurrency(value: unknown, field = "currency"): asserts value is Currency | undefined {
  if (value !== undefined) assertCurrency(value, field);
}

export function assertSafeInteger(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): asserts value is number {
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw fieldError(field, `must be a whole number between ${min} and ${max}`);
  }
}

export function assertOptionalSafeInteger(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): asserts value is number | undefined {
  if (value !== undefined) assertSafeInteger(value, field, options);
}

export function assertFiniteRange(
  value: unknown,
  field: string,
  options: { min: number; max?: number; minExclusive?: boolean },
): asserts value is number {
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  const validMin = options.minExclusive ? (value as number) > options.min : (value as number) >= options.min;
  if (typeof value !== "number" || !Number.isFinite(value) || !validMin || value > max) {
    const lower = options.minExclusive ? `greater than ${options.min}` : `at least ${options.min}`;
    throw fieldError(field, `must be finite, ${lower}, and no more than ${max}`);
  }
}

export function assertOptionalFiniteRange(
  value: unknown,
  field: string,
  options: { min: number; max?: number; minExclusive?: boolean },
): asserts value is number | undefined {
  if (value !== undefined) assertFiniteRange(value, field, options);
}

export function assertTimestamp(value: unknown, field: string): asserts value is number {
  assertSafeInteger(value, field, { min: 0 });
}

export function assertOptionalTimestamp(value: unknown, field: string): asserts value is number | undefined {
  if (value !== undefined) assertTimestamp(value, field);
}

export function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== "boolean") throw fieldError(field, "must be true or false");
}

export function assertOptionalBoolean(value: unknown, field: string): asserts value is boolean | undefined {
  if (value !== undefined) assertBoolean(value, field);
}

export function assertNonEmptyText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw fieldError(field, "is required");
}

export function assertOptionalText(value: unknown, field: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") throw fieldError(field, "must be text");
}

export function assertOptionalNullableText(value: unknown, field: string): asserts value is string | null | undefined {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw fieldError(field, "must be text or null");
  }
}

export function assertOptionalStringArray(value: unknown, field: string): asserts value is string[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw fieldError(field, "must be a list of text ids");
  }
}

export function assertDateOrder(
  start: number | undefined,
  end: number | undefined,
  startField: string,
  endField: string,
): void {
  assertOptionalTimestamp(start, startField);
  assertOptionalTimestamp(end, endField);
  if (start !== undefined && end !== undefined && end < start) {
    throw fieldError(endField, `must be on or after ${startField}`);
  }
}

export function assertInvoiceLineItems(value: unknown): asserts value is Array<{ description: string; quantity: number; unitCents: number }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw fieldError("lineItems", "must contain at least one item");
  }
  if (value.length > 200) throw fieldError("lineItems", "must contain no more than 200 items");
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw fieldError(`lineItems[${index}]`, "must be an object");
    }
    const item = raw as Record<string, unknown>;
    assertKnownFields(item, ["description", "quantity", "unitCents"], `lineItems[${index}]`);
    assertNonEmptyText(item.description, `lineItems[${index}].description`);
    assertFiniteRange(item.quantity, `lineItems[${index}].quantity`, { min: 0, minExclusive: true });
    assertSafeInteger(item.unitCents, `lineItems[${index}].unitCents`, { min: 0 });
    const total = item.quantity * item.unitCents;
    if (!Number.isSafeInteger(total)) {
      throw fieldError(`lineItems[${index}].totalCents`, "must resolve to whole safe cents");
    }
  });
}

export function assertExpenseAttachments(value: unknown): asserts value is ExpenseAttachment[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw fieldError("attachments", "must be a list");
  if (value.length > 8) throw fieldError("attachments", "must contain no more than 8 files");
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw fieldError(`attachments[${index}]`, "must be an object");
    }
    const attachment = raw as Record<string, unknown>;
    assertKnownFields(attachment, ["id", "name", "url", "size", "contentType", "storageProvider", "storageKey", "uploadedAt"], `attachments[${index}]`);
    for (const field of ["id", "name", "url", "contentType", "storageKey"] as const) {
      assertNonEmptyText(attachment[field], `attachments[${index}].${field}`);
    }
    assertSafeInteger(attachment.size, `attachments[${index}].size`, { min: 1, max: 8 * 1024 * 1024 });
    assertAllowedValue(attachment.storageProvider, ["supabase", "vercel-blob", "local"] as const, `attachments[${index}].storageProvider`);
    assertTimestamp(attachment.uploadedAt, `attachments[${index}].uploadedAt`);
  });
}
