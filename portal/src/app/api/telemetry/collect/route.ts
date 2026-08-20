import { NextResponse, type NextRequest } from "next/server";
import { recordClientTelemetry } from "@/lib/server/clients/clientTelemetryService";
import { recordAgencyWebsiteTelemetry } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAllowedPublicSiteOrigin, publicAquaPropertyId, publicAquaSite } from "@/lib/public/publicSites";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";

function corsHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function json(payload: Record<string, unknown>, status: number, origin: string | null, retryAfter?: number) {
  return NextResponse.json(payload, {
    status,
    headers: { ...corsHeaders(origin), ...(retryAfter ? { "retry-after": String(retryAfter) } : {}) },
  });
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function eventIsConsented(body: Record<string, unknown>) {
  const category = clean(body.category, 20);
  if (category === "necessary") return body.type === "consent" && body.consentNecessary === true;
  if (category === "preferences") return body.consentPreferences === true;
  if (category === "analytics") return body.consentAnalytics === true;
  if (category === "marketing") return body.consentMarketing === true;
  return false;
}

const TELEMETRY_FIELDS = new Set([
  "siteKey", "propertyId", "anonymousId", "sessionId", "category", "type",
  "consentVersion", "consentNecessary", "consentPreferences", "consentAnalytics",
  "consentMarketing", "occurredAt", "url", "path", "title", "referrer", "message",
  "metric", "value", "release", "environment", "formName", "impressions", "clicks",
  "position", "experimentId", "variant", "conversionValueCents",
]);

function redactPublicMessage(value: unknown) {
  const text = clean(value, 2_000);
  if (!text) return undefined;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?\d[\d ().-]{6,}\d)/g, "[phone removed]")
    .replace(/https?:\/\/[^\s]+/gi, (match) => {
      try {
        const url = new URL(match);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[url removed]";
      }
    });
}

function sanitizePublicTelemetry(body: Record<string, unknown>) {
  const sanitized = Object.fromEntries(
    Object.entries(body).filter(([key]) => TELEMETRY_FIELDS.has(key)),
  ) as Record<string, unknown>;
  delete sanitized.query;
  sanitized.message = redactPublicMessage(sanitized.message);
  return sanitized;
}

export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const requestedOrigin = req.headers.get("origin");
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 32_768) return json({ ok: false, error: "payload too large" }, 413, requestedOrigin);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid payload" }, 400, requestedOrigin);
  }

  const siteKey = clean(body.siteKey, 160);
  if (!siteKey) return json({ ok: false, error: "siteKey required" }, 400, requestedOrigin);
  const publicSite = publicAquaSite(siteKey);
  if (publicSite && !isAllowedPublicSiteOrigin(siteKey, requestedOrigin)) {
    return json({ ok: false, error: "origin is not registered for this site" }, 403, null);
  }
  if (!eventIsConsented(body)) {
    return json({ ok: false, error: "event is not covered by the saved consent choice" }, 403, requestedOrigin);
  }

  const telemetry = publicSite ? sanitizePublicTelemetry(body) : body;
  if (publicSite) telemetry.propertyId = publicAquaPropertyId(siteKey, body.propertyId);

  const limit = rateLimit({
    key: `telemetry:${siteKey}:${clientIpFromHeaders(req.headers)}`,
    max: 180,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return json({ ok: false, error: "signal limit reached" }, 429, requestedOrigin, limit.retryAfterSec);
  }

  await ensureHydrated();
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const recorded = recordClientTelemetry(siteKey, telemetry, userAgent)
    ?? recordAgencyWebsiteTelemetry(siteKey, telemetry, userAgent);
  if (!recorded) return json({ ok: false, error: "unknown site" }, 404, requestedOrigin);
  if (recorded.status === "rate-limited") {
    return json({ ok: false, error: "signal limit reached" }, 429, requestedOrigin);
  }

  if (body.type === "consent") {
    const supabase = createSupabaseAdminClient();
    const occurredAt = typeof body.occurredAt === "number" && Number.isFinite(body.occurredAt)
      ? new Date(body.occurredAt).toISOString()
      : new Date().toISOString();
    const { error } = await supabase.from("website_consent_events").insert({
      brand_slug: publicSite?.brand ?? null,
      site_key: siteKey,
      property_id: publicAquaPropertyId(siteKey, body.propertyId) ?? (clean(body.propertyId, 120) || "unassigned"),
      anonymous_id: clean(body.anonymousId, 120) || null,
      necessary: true,
      preferences: body.consentPreferences === true,
      analytics: body.consentAnalytics === true,
      marketing: body.consentMarketing === true,
      consent_version: typeof body.consentVersion === "number" ? Math.max(1, Math.floor(body.consentVersion)) : 1,
      source: "aqua-tag",
      occurred_at: occurredAt,
      metadata: { origin: requestedOrigin || "unknown" },
    });
    if (error) {
      console.error("[telemetry] consent audit insert failed", error.message);
      return json({ ok: false, error: "consent choice could not be recorded" }, 500, requestedOrigin);
    }
  }

  return json({ ok: true }, 202, requestedOrigin);
}
