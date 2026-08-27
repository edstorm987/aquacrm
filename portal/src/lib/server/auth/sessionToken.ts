import "server-only";

import crypto from "crypto";
import type { SessionPayload } from "@/server/types";

export const SESSION_COOKIE_NAME = "lk_session_v1";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getSessionSecret(): string {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] PORTAL_SESSION_SECRET is unset — sessions are signing with the dev fallback. Production deploys MUST set this.",
    );
  }
  return "dev-secret-do-not-use-in-prod";
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
