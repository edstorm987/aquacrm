import { NextResponse, type NextRequest } from "next/server";
import { recordClientTelemetry } from "@/lib/server/clients/clientTelemetryService";
import { recordAgencyWebsiteTelemetry } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicAquaPropertyId, publicAquaSite } from "@/lib/public/publicSites";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { parseJsonObject, readBoundedRequestBody } from "@/lib/server/boundedRequestBody";
import { resolveAquaTagAdmissionScope } from "@/lib/server/security/aquaTagFormAdmission";

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
  const bounded = await readBoundedRequestBody(req, 32_768);
  if (!bounded.ok) {
    return json(
      { ok: false, error: bounded.status === 413 ? "payload too large" : "invalid payload" },
      bounded.status,
      requestedOrigin,
    );
  }

  const body = parseJsonObject(bounded.rawBody);
  if (!body) {
    return json({ ok: false, error: "invalid payload" }, 400, requestedOrigin);
  }

  const siteKey = clean(body.siteKey, 160);
  if (!siteKey) return json({ ok: false, error: "siteKey required" }, 400, requestedOrigin);
  await ensureHydrated({ fresh: true });
  const scope = resolveAquaTagAdmissionScope(siteKey, requestedOrigin);
  if (!scope) {
    return json({ ok: false, error: "origin is not registered for this site" }, 403, null);
  }
  const publicSite = publicAquaSite(siteKey);
  if (!eventIsConsented(body)) {
    return json({ ok: false, error: "event is not covered by the saved consent choice" }, 403, requestedOrigin);
  }

  // Every Aqua Tag key is browser-public. Keep proof material and any other
  // caller-supplied extras out of all telemetry sinks, not only fixed sites.
  const telemetry = sanitizePublicTelemetry(body);
  if (publicSite) telemetry.propertyId = publicAquaPropertyId(siteKey, body.propertyId);

  const limit = rateLimit({
    key: `telemetry:${siteKey}:${clientIpFromHeaders(req.headers)}`,
    max: 180,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return json({ ok: false, error: "signal limit reached" }, 429, requestedOrigin, limit.retryAfterSec);
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;
  // Resolution is the authority. Never rediscover an owner from the public key
  // inside a sink: duplicate keys on different tenants otherwise make `.find()`
  // write to whichever client happens to be enumerated first.
  const recorded = scope.keyClass === "client-telemetry" && scope.clientId
    ? recordClientTelemetry(siteKey, telemetry, userAgent, {
        agencyId: scope.agencyId,
        clientId: scope.clientId,
        siteKey: scope.siteKey,
        siteId: scope.siteId,
        host: scope.host,
        keyClass: scope.keyClass,
      })
    : scope.keyClass === "public" || scope.keyClass === "agency-master" || scope.keyClass === "agency-website"
      ? recordAgencyWebsiteTelemetry(siteKey, telemetry, userAgent, {
          agencyId: scope.agencyId,
          siteKey: scope.siteKey,
          siteId: scope.siteId,
          host: scope.host,
          keyClass: scope.keyClass,
        })
      : null;
  if (!recorded) return json({ ok: false, error: "unknown site" }, 404, requestedOrigin);
  if (recorded.status === "rate-limited") {
    return json({ ok: false, error: "signal limit reached" }, 429, requestedOrigin);
  }

  if (body.type === "consent") {
    const supabase = createSupabaseAdminClient();
    const occurredAt = typeof body.occurredAt === "number" && Number.isFinite(body.occurredAt)
      ? new Date(body.occurredAt).toISOString()
      : new Date().toISOString();
    const metadata: Record<string, unknown> = { origin: requestedOrigin || "unknown" };
    metadata.resolvedScope = {
      agencyId: scope.agencyId,
      clientId: scope.clientId ?? null,
      siteId: scope.siteId,
      siteKey: scope.siteKey,
      host: scope.host,
      keyClass: scope.keyClass,
    };
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
      // Copy the resolver's immutable result into the durable audit row. The
      // browser-public key and host may later be rotated or reassigned; neither
      // can then erase which exact tenant/client/site accepted this choice.
      // These are operational identifiers and a public origin, never captured
      // form fields, challenge material or other visitor PII.
      metadata,
    });
    if (error) {
      console.error("[telemetry] consent audit insert failed", error.message);
      return json({ ok: false, error: "consent choice could not be recorded" }, 500, requestedOrigin);
    }
  }

  return json({ ok: true }, 202, requestedOrigin);
}
