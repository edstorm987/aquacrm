// Password-reset HMAC token helper. T1 R038 — chapter #160.
// Mirrors emailVerification.ts (#117 signup flow) with a distinct
// kind so a forgotten-password token can't be replayed against the
// email-verify surface and vice-versa.
//
// Token shape:    base64url(JSON({userId, email, exp, nonce})) "." HMAC
// TTL:            24 hours — comfortable inbox-latency window; longer
//                 than magic-link (15 min) since users may walk away
//                 before clicking through.
// Single-use:     atomic via the durable nonce store (chapter #138 —
//                 `consumeNonce(nonce, "password-reset", ttlMs)`).
//                 The `password-reset` kind is added alongside the
//                 existing `magic-link` / `email-verify` / `csrf` set.
//
// No `import "server-only"` — same rationale as emailVerification.ts:
// the smoke imports this directly; HMAC + nonce store only take
// effect when actually called.

import crypto from "crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

export interface PasswordResetPayload {
  userId: string;
  email: string;
  exp: number;
  nonce: string;
}

function getSecret(): string {
  return process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
}

export function signPasswordResetToken(input: { userId: string; email: string }): {
  token: string;
  payload: PasswordResetPayload;
} {
  const payload: PasswordResetPayload = {
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

export function verifyPasswordResetToken(
  token: string,
): { ok: true; payload: PasswordResetPayload } | { ok: false; error: string } {
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
  let payload: PasswordResetPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as PasswordResetPayload;
  } catch {
    return { ok: false, error: "malformed_payload" };
  }
  if (!payload.userId || !payload.email || !payload.exp || !payload.nonce) {
    return { ok: false, error: "missing_claims" };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired" };
  return { ok: true, payload };
}

// Atomic single-use consume via the durable store. Same shape as
// `consumeVerifyNonce` but distinct kind so the two surfaces can't
// cross-pollinate.
export async function consumeResetNonce(nonce: string, expSec: number): Promise<boolean> {
  const { getNonceStore } = await import("./nonceStore");
  const ttlMs = Math.max(0, expSec * 1000 - Date.now());
  // `password-reset` kind added to NonceKind union in nonceStore.ts.
  return getNonceStore().consumeNonce(nonce, "password-reset", ttlMs);
}
