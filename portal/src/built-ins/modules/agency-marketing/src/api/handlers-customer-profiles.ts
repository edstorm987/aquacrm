import crypto from "node:crypto";

import type { PluginCtx } from "../lib/aquaPluginTypes";
import {
  MARKETING_CUSTOMER_PROFILES_KEY,
  type CreateMarketingCustomerProfileInput,
  type MarketingAudienceType,
  type MarketingCustomerProfile,
  type MarketingCustomerProfilePriority,
  type MarketingCustomerProfileStatus,
  type MarketingEvidenceConfidence,
  type UpdateMarketingCustomerProfilePatch,
} from "../lib/domain";
import {
  deleteMarketingRecord,
  getMarketingRecord,
  listMarketingRecords,
  nextRecordVersion,
  setMarketingRecord,
  withMarketingRecordLock,
} from "./recordStorage";

const STATUSES = new Set<MarketingCustomerProfileStatus>(["draft", "active", "archived"]);
const AUDIENCE_TYPES = new Set<MarketingAudienceType>(["consumer", "business", "mixed"]);
const PRIORITIES = new Set<MarketingCustomerProfilePriority>(["primary", "secondary", "experimental"]);
const CONFIDENCE_LEVELS = new Set<MarketingEvidenceConfidence>(["assumption", "informed", "validated"]);
const CUSTOMER_PROFILE_ROW_PREFIX = "customer-profiles/by-id/";
const CUSTOMER_PROFILE_TOMBSTONE_PREFIX = "customer-profiles/deleted/";

const customerProfileStorage = (ctx: PluginCtx) => ({
  legacyKey: MARKETING_CUSTOMER_PROFILES_KEY,
  rowPrefix: CUSTOMER_PROFILE_ROW_PREFIX,
  tombstonePrefix: CUSTOMER_PROFILE_TOMBSTONE_PREFIX,
  storage: ctx.storage,
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function safeJson<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

function text(value: unknown, max = 500): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function list(value: unknown, maxItems = 30): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, 120))
    .filter(Boolean)))
    .slice(0, maxItems);
}

function cleanInput(input: CreateMarketingCustomerProfileInput): Omit<MarketingCustomerProfile, "id" | "agencyId" | "createdAt" | "updatedAt"> | null {
  const name = text(input.name, 120);
  if (!name) return null;
  return {
    companyIds: list(input.companyIds),
    name,
    segment: text(input.segment, 160),
    summary: text(input.summary, 1_000),
    audienceType: input.audienceType && AUDIENCE_TYPES.has(input.audienceType) ? input.audienceType : "consumer",
    status: input.status && STATUSES.has(input.status) ? input.status : "draft",
    priority: input.priority && PRIORITIES.has(input.priority) ? input.priority : "primary",
    evidenceConfidence: input.evidenceConfidence && CONFIDENCE_LEVELS.has(input.evidenceConfidence) ? input.evidenceConfidence : "assumption",
    owner: text(input.owner, 120),
    ageRange: text(input.ageRange, 120),
    locations: list(input.locations),
    languages: list(input.languages),
    genderNotes: text(input.genderNotes, 300),
    incomeRange: text(input.incomeRange, 160),
    lifeStage: text(input.lifeStage, 200),
    industries: list(input.industries),
    companySize: text(input.companySize, 160),
    businessStage: text(input.businessStage, 160),
    jobTitles: list(input.jobTitles),
    decisionRoles: list(input.decisionRoles),
    goals: list(input.goals),
    painPoints: list(input.painPoints),
    motivations: list(input.motivations),
    objections: list(input.objections),
    buyingTriggers: list(input.buyingTriggers),
    preferredChannels: list(input.preferredChannels),
    contentPreferences: list(input.contentPreferences),
    offerFit: text(input.offerFit, 1_000),
    typicalBudget: text(input.typicalBudget, 160),
    buyingCycle: text(input.buyingCycle, 200),
    estimatedAudienceSize: typeof input.estimatedAudienceSize === "number" && Number.isFinite(input.estimatedAudienceSize)
      ? Math.max(0, Math.round(input.estimatedAudienceSize))
      : undefined,
    researchNotes: text(input.researchNotes, 3_000),
  };
}

export async function customerProfilesHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  if (request.method === "GET") {
    const rows = await listMarketingRecords<MarketingCustomerProfile>(customerProfileStorage(ctx));
    return json({ ok: true, profiles: [...rows].sort((a, b) => b.updatedAt - a.updatedAt) });
  }

  if (request.method === "POST") {
    const body = await safeJson<CreateMarketingCustomerProfileInput>(request);
    const input = body ? cleanInput(body) : null;
    if (!input) return json({ ok: false, error: "A customer profile name is required." }, 400);
    return withMarketingRecordLock(ctx, "customer-profiles", async () => {
      const now = Date.now();
      const profile: MarketingCustomerProfile = {
        ...input,
        id: `aud_${crypto.randomBytes(8).toString("hex")}`,
        agencyId: ctx.agencyId,
        createdAt: now,
        updatedAt: now,
      };
      await setMarketingRecord(customerProfileStorage(ctx), profile);
      return json({ ok: true, profile }, 201);
    });
  }

  if (request.method === "PATCH") {
    const body = await safeJson<{ id: string; patch: UpdateMarketingCustomerProfilePatch; expectedUpdatedAt?: number }>(request);
    if (!body?.id || !body.patch) return json({ ok: false, error: "Profile id and changes are required." }, 400);
    return withMarketingRecordLock(ctx, "customer-profiles", async () => {
      const existing = await getMarketingRecord<MarketingCustomerProfile>(customerProfileStorage(ctx), body.id);
      if (!existing || existing.agencyId !== ctx.agencyId) return json({ ok: false, error: "Customer profile not found." }, 404);
      if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== existing.updatedAt) {
        return json({
          ok: false,
          error: "This customer profile changed in another tab. Review the latest version before saving again.",
          current: existing,
        }, 409);
      }
      const input = cleanInput({ ...existing, ...body.patch });
      if (!input) return json({ ok: false, error: "A customer profile name is required." }, 400);
      const updated: MarketingCustomerProfile = { ...existing, ...input, updatedAt: nextRecordVersion(existing.updatedAt) };
      await setMarketingRecord(customerProfileStorage(ctx), updated);
      return json({ ok: true, profile: updated });
    });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return json({ ok: false, error: "Profile id is required." }, 400);
    const expectedUpdatedAtRaw = new URL(request.url).searchParams.get("updatedAt");
    const expectedUpdatedAt = expectedUpdatedAtRaw ? Number(expectedUpdatedAtRaw) : undefined;
    return withMarketingRecordLock(ctx, "customer-profiles", async () => {
      const existing = await getMarketingRecord<MarketingCustomerProfile>(customerProfileStorage(ctx), id);
      if (!existing || existing.agencyId !== ctx.agencyId) {
        return json({ ok: false, error: "Customer profile not found." }, 404);
      }
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== existing.updatedAt) {
        return json({
          ok: false,
          error: "This customer profile changed in another tab. Review the latest version before deleting it.",
          current: existing,
        }, 409);
      }
      await deleteMarketingRecord(customerProfileStorage(ctx), id);
      return json({ ok: true });
    });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
}
