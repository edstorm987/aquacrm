import type {
  UpdateCampaignPatch,
  UpdateLeadPatch,
  UpdateTemplatePatch,
} from "./domain";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickOwnFields(value: unknown, fields: readonly string[]): JsonObject {
  if (!isJsonObject(value)) return {};
  const picked: JsonObject = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(value, field)) picked[field] = value[field];
  }
  return picked;
}

const LEAD_UPDATE_FIELDS = [
  "email",
  "name",
  "phone",
  "campaignId",
  "status",
  "assignedStaffId",
  "notes",
] as const satisfies readonly (keyof UpdateLeadPatch)[];

const CAMPAIGN_UPDATE_FIELDS = [
  "name",
  "channel",
  "status",
  "startAt",
  "endAt",
  "budgetCents",
  "currency",
  "goalKpi",
  "goalTarget",
  "resultActual",
  "ownerStaffId",
  "notes",
] as const satisfies readonly (keyof UpdateCampaignPatch)[];

const TEMPLATE_UPDATE_FIELDS = [
  "name",
  "subject",
  "bodyHtml",
  "bodyText",
  "category",
  "status",
] as const satisfies readonly (keyof UpdateTemplatePatch)[];

/**
 * Runtime allowlists for JSON/plugin inputs. These are intentionally called at
 * both the HTTP handler and service boundary: TypeScript shapes do not remove
 * hostile runtime keys, and services can also be called directly by plugins.
 */
export function allowlistedLeadUpdate(value: unknown): UpdateLeadPatch {
  return pickOwnFields(value, LEAD_UPDATE_FIELDS) as UpdateLeadPatch;
}

export function allowlistedCampaignUpdate(value: unknown): UpdateCampaignPatch {
  return pickOwnFields(value, CAMPAIGN_UPDATE_FIELDS) as UpdateCampaignPatch;
}

export function allowlistedTemplateUpdate(value: unknown): UpdateTemplatePatch {
  return pickOwnFields(value, TEMPLATE_UPDATE_FIELDS) as UpdateTemplatePatch;
}
