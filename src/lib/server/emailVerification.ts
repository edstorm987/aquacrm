// Email-verification HMAC token helper. R020.
// (No `import "server-only"` — same rationale as magicLink.ts: smoke
// imports this directly; the in-memory nonce store + HMAC signing only
// take effect when actually called.)
//
// Token shape:    base64url(JSON({userId, email, exp, nonce})) "." HMAC
// TTL:            24 hours (longer than magic-link's 15 min — users may
//                 verify later; v1 doesn't gate portal access on it).
// Single-use:     nonce stored in an in-memory Set with TTL expiry. Replay
//                 = "already used" reject. Same v1 single-process
//                 limitation as magic-link; documented for R+1 alongside
//                 RLS multi-instance hardening.

import crypto from "crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

export interface VerifyEmailPayload {
  userId: string;
  email: string;
  exp: number;
  nonce: string;
}

function getSecret(): string {
  return process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
}

export function signVerifyEmailToken(input: { userId: string; email: string }): {
  token: string;
  payload: VerifyEmailPayload;
} {
  const payload: VerifyEmailPayload = {
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return { token: `${b64}.${sig}`, payload };
}

export function verifyVerifyEmailToken(
  token: string,
): { ok: true; payload: VerifyEmailPayload } | { ok: false; error: string } {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, error: "malformed_token" };
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_signature" };
  }
  let payload: VerifyEmailPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as VerifyEmailPayload;
  } catch {
    return { ok: false, error: "malformed_payload" };
  }
  if (!payload.userId || !payload.email || !payload.exp || !payload.nonce) {
    return { ok: false, error: "missing_claims" };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired" };
  return { ok: true, payload };
}

// ─── Single-use nonce store (in-memory; v1) ───────────────────────────────

const used = new Map<string, number>();

function gcUsedSet(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of used) {
    if (v < now) used.delete(k);
  }
}

// R028: atomic single-use consume via the durable store. Replaces the
// check-then-mark race window — same pattern as magicLink.
export async function consumeVerifyNonce(nonce: string, expSec: number): Promise<boolean> {
  const { getNonceStore } = await import("./nonceStore");
  const ttlMs = Math.max(0, expSec * 1000 - Date.now());
  return getNonceStore().consumeNonce(nonce, "email-verify", ttlMs);
}

// Back-compat shims — prefer `consumeVerifyNonce`. NOT atomic.
export function isVerifyNonceUsed(nonce: string): boolean {
  gcUsedSet();
  return used.has(nonce);
}

export function markVerifyNonceUsed(nonce: string, exp: number): void {
  used.set(nonce, exp);
}
