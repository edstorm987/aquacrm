import type {
  UpdateCampaignPatch,
  UpdateLeadPatch,
  UpdateTemplatePatch,
} from "./domain";

type PatchObject = Record<string, unknown>;

export class MarketingMutationValidationError extends Error {
  readonly code = "invalid_marketing_mutation";

  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "MarketingMutationValidationError";
  }
}

function invalid(message: string, field?: string): never {
  throw new MarketingMutationValidationError(message, field);
}

function requirePatchObject(value: unknown, fields: readonly string[]): PatchObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("patch must be a plain object.");
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
  } catch {
    return invalid("patch must be a plain object.");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid("patch must be a plain object.");
  }

  const picked: PatchObject = {};
  for (const field of fields) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, field);
    } catch {
      return invalid("patch must expose ordinary data fields.");
    }
    if (!descriptor) continue;
    if (!("value" in descriptor)) return invalid(`${field} must be a data field.`, field);
    picked[field] = descriptor.value;
  }
  if (Object.keys(picked).length === 0) {
    return invalid("patch must contain at least one editable field.");
  }
  return picked;
}

function assertString(
  patch: PatchObject,
  field: string,
  options: { nonBlank?: boolean; nullable?: boolean } = {},
): void {
  if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
  const value = patch[field];
  if (value === null && options.nullable) return;
  if (typeof value !== "string") return invalid(`${field} must be text${options.nullable ? " or null" : ""}.`, field);
  if (options.nonBlank && !value.trim()) return invalid(`${field} must not be blank.`, field);
}

function assertEnum(patch: PatchObject, field: string, values: readonly string[]): void {
  if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
  const value = patch[field];
  if (typeof value !== "string" || !values.includes(value)) {
    return invalid(`${field} must be one of: ${values.join(", ")}.`, field);
  }
}

function assertNumber(
  patch: PatchObject,
  field: string,
  options: { integer?: boolean; nonNegative?: boolean } = {},
): void {
  if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
  const value = patch[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid(`${field} must be a finite number.`, field);
  }
  if (options.integer && !Number.isInteger(value)) return invalid(`${field} must be an integer.`, field);
  if (options.nonNegative && value < 0) return invalid(`${field} must be non-negative.`, field);
}

const LEAD_UPDATE_FIELDS = [
  "email", "name", "phone", "campaignId", "status", "assignedStaffId", "notes",
] as const satisfies readonly (keyof UpdateLeadPatch)[];

const CAMPAIGN_UPDATE_FIELDS = [
  "name", "channel", "status", "startAt", "endAt", "budgetCents", "currency",
  "goalKpi", "goalTarget", "resultActual", "ownerStaffId", "notes",
] as const satisfies readonly (keyof UpdateCampaignPatch)[];

const TEMPLATE_UPDATE_FIELDS = [
  "name", "subject", "bodyHtml", "bodyText", "category", "status",
] as const satisfies readonly (keyof UpdateTemplatePatch)[];

/**
 * Runtime allowlists for JSON/plugin inputs. Every permitted value is checked
 * here at both the HTTP and direct-service boundaries. Unknown keys are
 * ignored, but an unknown-only/empty patch is rejected so it cannot create a
 * timestamp/version churn no-op.
 */
export function allowlistedLeadUpdate(value: unknown): UpdateLeadPatch {
  const patch = requirePatchObject(value, LEAD_UPDATE_FIELDS);
  assertString(patch, "email", { nonBlank: true });
  assertString(patch, "name");
  assertString(patch, "phone");
  assertString(patch, "campaignId", { nonBlank: true, nullable: true });
  assertEnum(patch, "status", ["new", "contacted", "qualified", "converted", "unqualified", "lost"]);
  assertString(patch, "assignedStaffId", { nonBlank: true, nullable: true });
  assertString(patch, "notes");
  return patch as UpdateLeadPatch;
}

export function allowlistedCampaignUpdate(value: unknown): UpdateCampaignPatch {
  const patch = requirePatchObject(value, CAMPAIGN_UPDATE_FIELDS);
  assertString(patch, "name", { nonBlank: true });
  assertEnum(patch, "channel", ["email", "sms", "social", "paid", "organic", "event"]);
  assertEnum(patch, "status", ["draft", "scheduled", "running", "paused", "completed", "archived"]);
  assertNumber(patch, "startAt", { integer: true, nonNegative: true });
  assertNumber(patch, "endAt", { integer: true, nonNegative: true });
  assertNumber(patch, "budgetCents", { integer: true, nonNegative: true });
  assertEnum(patch, "currency", ["usd", "gbp", "eur"]);
  assertEnum(patch, "goalKpi", ["leads", "signups", "revenue", "engagement"]);
  assertNumber(patch, "goalTarget", { nonNegative: true });
  assertNumber(patch, "resultActual", { nonNegative: true });
  assertString(patch, "ownerStaffId", { nonBlank: true, nullable: true });
  assertString(patch, "notes");
  return patch as UpdateCampaignPatch;
}

export function allowlistedTemplateUpdate(value: unknown): UpdateTemplatePatch {
  const patch = requirePatchObject(value, TEMPLATE_UPDATE_FIELDS);
  assertString(patch, "name", { nonBlank: true });
  assertString(patch, "subject", { nonBlank: true });
  assertString(patch, "bodyHtml", { nonBlank: true });
  assertString(patch, "bodyText");
  assertEnum(patch, "category", ["welcome", "re-engagement", "newsletter", "transactional", "other"]);
  assertEnum(patch, "status", ["active", "archived"]);
  return patch as UpdateTemplatePatch;
}
