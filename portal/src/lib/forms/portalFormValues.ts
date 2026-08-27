import type { PortalFormFieldDefinition, PortalFormFieldValue } from "@/server/types";

export class PortalFormValidationError extends Error {
  constructor(message: string, readonly fieldId?: string) {
    super(message);
    this.name = "PortalFormValidationError";
  }
}

type FieldValues = Record<string, PortalFormFieldValue>;

export function validatePortalFormValues(input: {
  fields: PortalFormFieldDefinition[];
  values?: unknown;
  existing?: Record<string, unknown>;
  allowedUnknownKeys?: Iterable<string>;
}): FieldValues {
  const submitted = record(input.values);
  const existing = record(input.existing);
  const allowedUnknown = new Set(input.allowedUnknownKeys ?? []);
  const byId = new Map(input.fields.map(field => [field.id, field]));
  const result: FieldValues = {};

  // Existing values belonging to deleted/archived fields are intentionally retained. The
  // editor promises that removing a definition hides it without erasing historical data.
  for (const [key, value] of Object.entries(existing)) {
    if (isPortalValue(value)) result[key] = value;
  }

  for (const [key, raw] of Object.entries(submitted)) {
    const field = byId.get(key);
    if (!field) {
      if (key in existing && samePortalValue(raw, existing[key])) continue;
      if (allowedUnknown.has(key) && isPortalValue(raw)) {
        result[key] = raw;
        continue;
      }
      throw new PortalFormValidationError(`Custom field “${key}” is not defined.`, key);
    }
    if (!field.active) {
      if (key in existing && samePortalValue(raw, existing[key])) continue;
      throw new PortalFormValidationError(`“${field.label}” is no longer active.`, field.id);
    }
    const value = normaliseValue(field, raw);
    if (value === undefined) delete result[field.id];
    else result[field.id] = value;
  }

  for (const field of input.fields) {
    if (!field.active || !field.required) continue;
    if (isMissing(result[field.id], field.type)) {
      throw new PortalFormValidationError(`“${field.label}” is required.`, field.id);
    }
  }
  return result;
}

export function activePortalFormFields(fields: PortalFormFieldDefinition[]): PortalFormFieldDefinition[] {
  return fields.filter(field => field.active);
}

function normaliseValue(field: PortalFormFieldDefinition, raw: unknown): PortalFormFieldValue | undefined {
  if (field.type === "checkbox") {
    if (typeof raw !== "boolean") throw invalid(field, "must be yes or no");
    return raw;
  }
  if (field.type === "multi-select") {
    if (!Array.isArray(raw) || raw.some(value => typeof value !== "string")) {
      throw invalid(field, "must contain a list of options");
    }
    const values = [...new Set(raw.map(value => value.trim()).filter(Boolean))];
    const invalidOption = values.find(value => !field.options.includes(value));
    if (invalidOption) throw invalid(field, `contains an unavailable option: ${invalidOption}`);
    return values.length ? values : undefined;
  }
  if (typeof raw !== "string" && typeof raw !== "number") throw invalid(field, "has the wrong value type");
  const value = String(raw).trim();
  if (!value) return undefined;
  if (field.type === "number") {
    if (!Number.isFinite(Number(value))) throw invalid(field, "must be a number");
    return value.slice(0, 120);
  }
  if (field.type === "date") {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw invalid(field, "must be a valid date");
    }
    return value;
  }
  if (field.type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw invalid(field, "must be a valid email address");
    return value.slice(0, 320);
  }
  if (field.type === "url") {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
      return url.toString().slice(0, 2_000);
    } catch {
      throw invalid(field, "must be a valid http or https URL");
    }
  }
  if (field.type === "select") {
    if (!field.options.includes(value)) throw invalid(field, "must use one of the available options");
    return value;
  }
  return value.slice(0, field.type === "textarea" ? 4_000 : 1_000);
}

function invalid(field: PortalFormFieldDefinition, detail: string): PortalFormValidationError {
  return new PortalFormValidationError(`“${field.label}” ${detail}.`, field.id);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isPortalValue(value: unknown): value is PortalFormFieldValue {
  return typeof value === "string" || typeof value === "boolean"
    || Array.isArray(value) && value.every(item => typeof item === "string");
}

function samePortalValue(left: unknown, right: unknown): boolean {
  return isPortalValue(left) && isPortalValue(right) && JSON.stringify(left) === JSON.stringify(right);
}

function isMissing(value: PortalFormFieldValue | undefined, type: PortalFormFieldDefinition["type"]): boolean {
  return value === undefined
    || type === "checkbox" && value !== true
    || typeof value === "string" && !value.trim()
    || Array.isArray(value) && value.length === 0;
}
