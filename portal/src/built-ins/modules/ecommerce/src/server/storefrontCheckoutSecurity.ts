import "server-only";

import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import { clientIpFromHeaders } from "@/lib/server/rateLimit";
import { getState } from "@/server/storage";
import { normalizeHost } from "@/server/websiteSources";

import type { PluginCtx } from "../lib/aquaPluginTypes";

export type StorefrontCheckoutKind = "paid" | "free";

export interface StorefrontCheckoutSecurityEnvelope {
  checkoutKind: StorefrontCheckoutKind;
  captchaToken?: string;
}

export type StorefrontCheckoutAdmission =
  | { ok: true; checkout: Record<string, unknown>; kind: StorefrontCheckoutKind; clientIp: string }
  | { ok: false; status: 400 | 403 | 429 | 503; error: string; retryAfterSec?: number };

function parsedOrigin(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol === "https:" && process.env.NODE_ENV === "production" && url.port && url.port !== "443") return null;
    if (url.protocol === "https:") return url;
    return process.env.NODE_ENV !== "production" && url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function parsedRefererOrigin(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const referer = new URL(raw);
    if (referer.username || referer.password) return null;
    return parsedOrigin(referer.origin);
  } catch {
    return null;
  }
}

/**
 * A public ecommerce install is selected by query parameters at the generic
 * plugin dispatcher. That selection is routing evidence, not authority. Bind
 * it back to one globally unique registered website host before accepting a
 * human proof or touching checkout state.
 */
export function exactStorefrontWebsiteHost(
  ctx: PluginCtx,
  originValue: string | null,
): string | null {
  if (!ctx.clientId) return null;
  const origin = parsedOrigin(originValue);
  if (!origin) return null;
  const canonicalHost = normalizeHost(origin.hostname);
  if (!canonicalHost) return null;
  const matches = Object.values(getState().websiteSources ?? {})
    .filter(source => normalizeHost(source.host) === canonicalHost);
  if (matches.length !== 1) return null;
  const source = matches[0]!;
  if (source.agencyId !== ctx.agencyId || source.destinationClientId !== ctx.clientId) return null;
  if (source.destinationCompanyId) return null;
  // Turnstile attests the exact browser hostname. Keep www/apex distinct even
  // though the routing registry intentionally canonicalises them.
  return origin.hostname.trim().toLowerCase();
}

/**
 * Bind all public storefront reads to the registered published website too.
 * Browsers do not consistently send `Origin` on same-origin GET requests, so
 * safe reads may use the exact-origin portion of `Referer`. When both headers
 * exist they must agree; a malformed supplied header is a refusal.
 */
export function exactStorefrontRequestHost(ctx: PluginCtx, req: Request): string | null {
  const rawOrigin = req.headers.get("origin");
  const rawReferer = req.headers.get("referer");
  const origin = parsedOrigin(rawOrigin);
  const refererOrigin = parsedRefererOrigin(rawReferer);
  if (rawOrigin && !origin) return null;
  if (rawReferer && !refererOrigin) return null;
  if (origin && refererOrigin && origin.origin !== refererOrigin.origin) return null;
  return exactStorefrontWebsiteHost(ctx, (origin ?? refererOrigin)?.origin ?? null);
}

function splitEnvelope(raw: unknown): {
  checkout: Record<string, unknown>;
  security: StorefrontCheckoutSecurityEnvelope;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const kind = body.checkoutKind;
  if (kind !== "paid" && kind !== "free") return null;
  const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken.trim() : "";
  if (captchaToken.length > 4_096) return null;
  const checkout = { ...body };
  delete checkout.checkoutKind;
  delete checkout.captchaToken;
  return {
    checkout,
    security: { checkoutKind: kind, ...(captchaToken ? { captchaToken } : {}) },
  };
}

export async function verifyStorefrontCheckoutAdmission(
  req: Request,
  ctx: PluginCtx,
  raw: unknown,
  verify: typeof verifyBotChallenge = verifyBotChallenge,
): Promise<StorefrontCheckoutAdmission> {
  const envelope = splitEnvelope(raw);
  if (!envelope) return { ok: false, status: 400, error: "Checkout verification details are invalid." };
  const hostname = exactStorefrontWebsiteHost(ctx, req.headers.get("origin"));
  if (!hostname) return { ok: false, status: 403, error: "This storefront could not be verified." };
  const clientIp = clientIpFromHeaders(req.headers);
  const challenge = await verify({
    action: envelope.security.checkoutKind === "free"
      ? "storefront-free-order"
      : "storefront-checkout",
    token: envelope.security.captchaToken,
    remoteIp: clientIp,
    hostname,
    tenantId: ctx.agencyId,
  });
  if (!challenge.ok) {
    return {
      ok: false,
      status: challenge.reason === "rate-limited" ? 429 : challenge.reason === "unconfigured-fail-closed" ? 503 : 403,
      error: challenge.message,
      ...(challenge.retryAfterSec ? { retryAfterSec: challenge.retryAfterSec } : {}),
    };
  }
  return { ok: true, checkout: envelope.checkout, kind: envelope.security.checkoutKind, clientIp };
}
