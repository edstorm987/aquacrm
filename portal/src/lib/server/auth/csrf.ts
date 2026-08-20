// CSRF protection — double-submit pattern. R021.
//
// Token shape: base64url(JSON({nonce, exp})) "." HMAC-SHA256
// TTL: 60 minutes. Token is set in `lk_csrf_v1` cookie AND must be
// echoed back in the `x-csrf-token` request header. Same-origin browsers
// auto-send the cookie; only same-origin JS can read it (HttpOnly off
// because the form needs JS access). A cross-origin attacker can forge
// a request that carries the cookie but cannot read it to set the
// matching header → request rejected.
//
// (No `import "server-only"` — smoke imports the HMAC roundtrip directly.)

import crypto from "crypto";
import type { NextRequest } from "next/server";

const TTL_SECONDS = 60 * 60;
export const CSRF_COOKIE_NAME = "lk_csrf_v1";
export const CSRF_HEADER_NAME = "x-csrf-token";

interface CsrfPayload {
  nonce: string;
  exp: number;
}

function getSecret(): string {
  return process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
}

export function signCsrfToken(): { token: string; payload: CsrfPayload } {
  const payload: CsrfPayload = {
    nonce: crypto.randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return { token: `${b64}.${sig}`, payload };
}

export function verifyCsrfToken(token: string | undefined): CsrfPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as CsrfPayload;
    if (!payload.nonce || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Check that the request carries a CSRF cookie + matching header (double-submit).
// Returns:
//   { ok: true }                     — both present + signatures valid + nonces match.
//   { ok: false, error: "..." }      — missing/mismatched/invalid.
//
// Routes call this and return 403 on failure. We deliberately do NOT auto-issue
// a token here — that's the job of /api/auth/csrf (or the form pre-fetch).
export function requireCsrf(req: NextRequest): { ok: true } | { ok: false; error: string } {
  const cookie = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const header = req.headers.get(CSRF_HEADER_NAME) ?? undefined;
  if (!cookie || !header) return { ok: false, error: "csrf_missing" };
  const a = verifyCsrfToken(cookie);
  const b = verifyCsrfToken(header);
  if (!a || !b) return { ok: false, error: "csrf_invalid" };
  if (a.nonce !== b.nonce) return { ok: false, error: "csrf_mismatch" };
  return { ok: true };
}

export function csrfCookie(token: string) {
  return {
    name: CSRF_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: false, // readable by same-origin JS so the form can echo it
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TTL_SECONDS,
    },
  };
}
