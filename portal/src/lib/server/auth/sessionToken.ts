import "server-only";

import crypto from "crypto";
import type { SessionPayload } from "@/server/types";

export const SESSION_COOKIE_NAME = "lk_session_v1";

// Session lifetime. Was a hard-coded 30 days; assume-breach containment
// (2026-09-08) shortens the default to 7 days and makes it tunable so the
// owner can go shorter without a deploy. Clamped to [15 minutes, 30 days] so a
// typo cannot mint decade-long or instantly-dead sessions.
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
function resolveSessionTtl(): number {
  const raw = Number(process.env.PORTAL_SESSION_TTL_SECONDS ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(raw), 60 * 15), 60 * 60 * 24 * 30);
}
export const SESSION_COOKIE_MAX_AGE = resolveSessionTtl();

// FAIL CLOSED (assume-breach containment, 2026-09-08). The previous behaviour
// signed production sessions with the public literal
// "dev-secret-do-not-use-in-prod" when PORTAL_SESSION_SECRET was unset — a
// console.warn and then business as usual, meaning anyone could mint a valid
// owner cookie offline. Production now refuses to sign OR verify anything
// without a real secret; dev/test keep the fallback so local work and the
// smoke suite run without configuration.
const DEV_FALLBACK_SECRET = "dev-secret-do-not-use-in-prod";

function getSessionSecret(): string {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (secret && secret.length > 0) {
    if (process.env.NODE_ENV === "production" && secret === DEV_FALLBACK_SECRET) {
      throw new Error(
        "[auth] PORTAL_SESSION_SECRET is set to the public dev fallback in production. Refusing to sign or verify sessions.",
      );
    }
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] PORTAL_SESSION_SECRET is unset in production. Refusing to sign or verify sessions — set a ≥32-char secret.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

/**
 * The ONE fail-closed signing-secret resolver for every HMAC token family in
 * the portal (sessions, CSRF, magic links, password reset, email verification,
 * OAuth state, connection confirmations, inbox media tokens). Eleven call
 * sites used to inline `process.env.PORTAL_SESSION_SECRET ?? "dev-secret…"`,
 * so fixing the session path alone would have left every sibling token
 * forgeable in a secretless production. They all resolve here now: production
 * throws without a real secret; dev/test keep the fallback.
 */
export function resolveSigningSecret(): string {
  return getSessionSecret();
}

/** Sign a complete session payload without importing tenant storage. */
export function signSessionPayload(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

/**
 * Verify the session token at the request boundary. This intentionally has no
 * dependency on PortalState, which lets the storage layer select a signed
 * sandbox realm before hydrating that realm.
 */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== signatureBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
