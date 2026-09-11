import { createHash } from "node:crypto";

import { brokeredFetch } from "@/lib/server/net/outboundBroker";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { mayUseEnvironmentCredentials } from "@/lib/server/auth/founderAgency";
import {
  assertLiveProviderAccess,
  SandboxProviderBlockedError,
} from "@/lib/server/sandbox/providerPolicy";

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { normalizeGooglePlaceId } from "../lib/domain";

const GOOGLE_PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_FIELD_MASK = [
  "places.id",
  "places.attributions",
  "places.displayName",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.primaryType",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
].join(",");
const MAX_REQUEST_BYTES = 4 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_RESULTS = 10;
const SEARCHES_PER_MINUTE = 30;
const DEFAULT_SEARCHES_PER_TENANT_DAY = 500;
const MAX_CONFIGURED_SEARCHES_PER_TENANT_DAY = 10_000;
const DAILY_QUOTA_KEY = "google-places:daily-quota";
const BUSINESS_STATUSES = new Set([
  "OPERATIONAL",
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
  "FUTURE_OPENING",
]);

export interface GooglePlacesSearchPlace {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  primaryType?: string;
  phone?: string;
  website?: string;
  businessStatus?: string;
  attributions?: Array<{ provider: string; providerUri?: string }>;
}

interface GooglePlacesSearchInput {
  query: string;
  regionCode?: string;
  locationBias?: {
    latitude: number;
    longitude: number;
    radiusMeters?: number;
  };
}

export interface GooglePlacesSearchDependencies {
  brokeredFetch?: typeof brokeredFetch;
  rateLimit?: typeof rateLimit;
  assertLiveProviderAccess?: typeof assertLiveProviderAccess;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  mayUseEnvironmentCredentials?: typeof mayUseEnvironmentCredentials;
}

interface DailySearchQuota {
  day: string;
  count: number;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function errorResponse(error: string, status: number, headers?: Record<string, string>): Response {
  return json({ ok: false, error }, status, headers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

async function readCappedJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const mediaType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return { ok: false, error: "content_type_must_be_json" };

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, error: "request_too_large" };
  }
  if (!req.body) return { ok: false, error: "invalid_json" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "request_too_large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "invalid_json" };
  } finally {
    reader.releaseLock();
  }
}

const INPUT_KEYS = new Set(["query", "regionCode", "locationBias"]);
const LOCATION_KEYS = new Set(["latitude", "longitude", "radiusMeters"]);

function sanitizeQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/\p{Cc}|[\u202A-\u202E\u2066-\u2069]/u.test(value)) return null;
  const cleaned = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return cleaned.length >= 3 && cleaned.length <= 200 ? cleaned : null;
}

function parseSearchInput(value: unknown): GooglePlacesSearchInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, INPUT_KEYS)) return null;
  const query = sanitizeQuery(value.query);
  if (!query) return null;

  let regionCode: string | undefined;
  if (value.regionCode !== undefined) {
    if (typeof value.regionCode !== "string" || !/^[A-Za-z]{2}$/.test(value.regionCode.trim())) return null;
    regionCode = value.regionCode.trim().toUpperCase();
  }

  let locationBias: GooglePlacesSearchInput["locationBias"];
  if (value.locationBias !== undefined) {
    if (!isRecord(value.locationBias) || !hasOnlyKeys(value.locationBias, LOCATION_KEYS)) return null;
    const { latitude, longitude, radiusMeters } = value.locationBias;
    if (
      typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || (radiusMeters !== undefined && (
        typeof radiusMeters !== "number"
        || !Number.isFinite(radiusMeters)
        || radiusMeters < 100
        || radiusMeters > 50_000
      ))
    ) return null;
    locationBias = { latitude, longitude, radiusMeters };
  }

  return { query, regionCode, locationBias };
}

function providerText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function safeHttpUrl(value: unknown, googleMapsOnly = false): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return undefined;
    if (googleMapsOnly) {
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (parsed.protocol !== "https:" || (host !== "maps.google.com" && host !== "www.google.com")) return undefined;
    } else if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function sanitizePlace(value: unknown): GooglePlacesSearchPlace | null {
  if (!isRecord(value)) return null;
  const placeId = normalizeGooglePlaceId(value.id);
  const displayName = isRecord(value.displayName) ? providerText(value.displayName.text, 200) : undefined;
  if (!placeId || !displayName) return null;

  const formattedAddress = providerText(value.formattedAddress, 500);
  const googleMapsUri = safeHttpUrl(value.googleMapsUri, true);
  const primaryTypeCandidate = providerText(value.primaryType, 100);
  const primaryType = primaryTypeCandidate && /^[a-z0-9_]+$/.test(primaryTypeCandidate)
    ? primaryTypeCandidate
    : undefined;
  const phone = providerText(value.internationalPhoneNumber, 80);
  const website = safeHttpUrl(value.websiteUri);
  const businessStatusCandidate = providerText(value.businessStatus, 40);
  const businessStatus = businessStatusCandidate && BUSINESS_STATUSES.has(businessStatusCandidate)
    ? businessStatusCandidate
    : undefined;
  const attributions = Array.isArray(value.attributions)
    ? value.attributions.flatMap(candidate => {
      if (!isRecord(candidate)) return [];
      const provider = providerText(candidate.provider, 120);
      if (!provider) return [];
      const providerUri = safeHttpUrl(candidate.providerUri);
      return [{ provider, ...(providerUri ? { providerUri } : {}) }];
    })
    : [];

  return {
    placeId,
    displayName,
    ...(formattedAddress ? { formattedAddress } : {}),
    ...(googleMapsUri ? { googleMapsUri } : {}),
    ...(primaryType ? { primaryType } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(businessStatus ? { businessStatus } : {}),
    ...(attributions.length ? { attributions } : {}),
  };
}

function sanitizeProviderPayload(value: unknown): GooglePlacesSearchPlace[] | null {
  if (!isRecord(value)) return null;
  if (value.places === undefined) return [];
  if (!Array.isArray(value.places)) return null;
  return value.places.slice(0, MAX_RESULTS).flatMap(candidate => {
    const place = sanitizePlace(candidate);
    return place ? [place] : [];
  });
}

function rateLimitKey(ctx: PluginCtx, req: Request): string {
  const identity = `${ctx.agencyId}\u0000${ctx.actor}\u0000${clientIpFromHeaders(req.headers)}`;
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 32);
  return `google-places-search:${digest}`;
}

function dailyQuotaLimit(env: NodeJS.ProcessEnv): number {
  const configured = env.GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY?.trim() ?? "";
  if (!/^\d+$/.test(configured)) return DEFAULT_SEARCHES_PER_TENANT_DAY;
  const parsed = Number.parseInt(configured, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_SEARCHES_PER_TENANT_DAY;
  return Math.min(parsed, MAX_CONFIGURED_SEARCHES_PER_TENANT_DAY);
}

async function consumeDailyTenantQuota(
  ctx: PluginCtx,
  env: NodeJS.ProcessEnv,
  now: number,
): Promise<{ allowed: boolean; retryAfterSec: number; limit: number }> {
  const day = new Date(now).toISOString().slice(0, 10);
  const limit = dailyQuotaLimit(env);
  const operation = async () => {
    const stored = await ctx.storage.get<DailySearchQuota>(DAILY_QUOTA_KEY);
    const current = stored?.day === day && Number.isInteger(stored.count) && stored.count >= 0
      ? stored.count
      : 0;
    if (current >= limit) return false;
    await ctx.storage.set(DAILY_QUOTA_KEY, { day, count: current + 1 } satisfies DailySearchQuota);
    return true;
  };
  const allowed = ctx.storage.runExclusive
    ? await ctx.storage.runExclusive(DAILY_QUOTA_KEY, operation)
    : await operation();
  const tomorrowUtc = Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
  return {
    allowed,
    retryAfterSec: Math.max(1, Math.ceil((tomorrowUtc - now) / 1000)),
    limit,
  };
}

export async function googlePlacesSearchHandler(
  req: Request,
  ctx: PluginCtx,
  dependencies: GooglePlacesSearchDependencies = {},
): Promise<Response> {
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  const applyRateLimit = dependencies.rateLimit ?? rateLimit;
  const throttle = applyRateLimit({
    key: rateLimitKey(ctx, req),
    max: SEARCHES_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return errorResponse("rate_limited", 429, { "retry-after": String(throttle.retryAfterSec) });
  }

  const parsedBody = await readCappedJson(req);
  if (!parsedBody.ok) return errorResponse(parsedBody.error, parsedBody.error === "request_too_large" ? 413 : 400);
  const input = parseSearchInput(parsedBody.value);
  if (!input) return errorResponse("invalid_search_request", 400);

  const env = dependencies.env ?? process.env;
  const environmentCredentialsAllowed = (
    dependencies.mayUseEnvironmentCredentials ?? mayUseEnvironmentCredentials
  )(ctx.agencyId);
  const apiKey = environmentCredentialsAllowed ? env.GOOGLE_PLACES_API_KEY?.trim() : undefined;
  if (!apiKey) return errorResponse("google_places_not_configured", 503);

  const providerRequest: Record<string, unknown> = {
    textQuery: input.query,
    pageSize: MAX_RESULTS,
  };
  if (input.regionCode) providerRequest.regionCode = input.regionCode;
  if (input.locationBias) {
    providerRequest.locationBias = {
      circle: {
        center: {
          latitude: input.locationBias.latitude,
          longitude: input.locationBias.longitude,
        },
        radius: input.locationBias.radiusMeters ?? 5_000,
      },
    };
  }

  try {
    (dependencies.assertLiveProviderAccess ?? assertLiveProviderAccess)("Google Places business search");
  } catch (error) {
    if (error instanceof SandboxProviderBlockedError || (error instanceof Error && error.name === "SandboxProviderBlockedError")) {
      return errorResponse("google_places_blocked_in_sandbox", 403);
    }
    return errorResponse("google_places_unavailable", 502);
  }

  let dailyQuota: Awaited<ReturnType<typeof consumeDailyTenantQuota>>;
  try {
    dailyQuota = await consumeDailyTenantQuota(ctx, env, (dependencies.now ?? Date.now)());
  } catch {
    // Paid egress fails closed if its shared durable budget cannot be advanced.
    return errorResponse("google_places_quota_unavailable", 503);
  }
  if (!dailyQuota.allowed) {
    return errorResponse("google_places_daily_quota_exhausted", 429, {
      "retry-after": String(dailyQuota.retryAfterSec),
    });
  }

  let upstream: Awaited<ReturnType<typeof brokeredFetch>>;
  try {
    upstream = await (dependencies.brokeredFetch ?? brokeredFetch)({
      url: GOOGLE_PLACES_ENDPOINT,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify(providerRequest),
      timeoutMs: 8_000,
      maxRequestBytes: 8 * 1024,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      tenantId: ctx.agencyId,
      purpose: "leads-pipeline.google-places.search",
      policy: { allowHostSuffixes: ["places.googleapis.com"] },
      followRedirects: false,
    });
  } catch (error) {
    return errorResponse("google_places_unavailable", 502);
  }

  if (upstream.status === 429) {
    const retryAfter = upstream.headers["retry-after"];
    return errorResponse(
      "google_places_provider_rate_limited",
      503,
      retryAfter && /^\d{1,6}$/.test(retryAfter) ? { "retry-after": retryAfter } : undefined,
    );
  }
  if (upstream.status < 200 || upstream.status >= 300 || upstream.bytes >= MAX_RESPONSE_BYTES) {
    return errorResponse("google_places_unavailable", 502);
  }

  try {
    const places = sanitizeProviderPayload(JSON.parse(upstream.bodyText) as unknown);
    if (!places) return errorResponse("google_places_invalid_response", 502);
    await Promise.resolve(ctx.services.activity.logActivity({
      agencyId: ctx.agencyId,
      actorUserId: ctx.actor,
      category: "leads",
      action: "leads.google-places.searched",
      message: "Searched Google Maps for scouting candidates.",
      // The query can contain names or locations. Persist only cost evidence.
      metadata: { resultCount: places.length, dailyLimit: dailyQuota.limit },
    })).catch(() => undefined);
    return json({ ok: true, places });
  } catch {
    return errorResponse("google_places_invalid_response", 502);
  }
}
