// Email-verification HMAC token helper. R020.
// (No `import "server-only"` — same rationale as magicLink.ts: smoke
// imports this directly; the in-memory nonce store + HMAC signing only
// take effect when actually called.)
//
// Token shape:    base64url(JSON({purpose,userId,email,exp,nonce})) "." HMAC
// TTL:            24 hours (longer than magic-link's 15 min — users may
//                 verify later).
// Single-use:     nonce is atomically consumed through the shared durable
//                 nonce store. Agency admission additionally binds the exact
//                 subject/nonce to its password-free operation receipt.

import crypto from "crypto";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

export interface VerifyEmailPayload {
  /** Absent only on pre-purpose legacy links. */
  purpose?: "email-verify" | "agency-signup-email-verify";
  userId: string;
  email: string;
  exp: number;
  nonce: string;
}

function signPayload(payload: VerifyEmailPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function getSecret(): string {
  return resolveSigningSecret();
}

export function signVerifyEmailToken(input: { userId: string; email: string }): {
  token: string;
  payload: VerifyEmailPayload;
} {
  const payload: VerifyEmailPayload = {
    purpose: "email-verify",
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  return { token: signPayload(payload), payload };
}

/** Rebuild the exact token recorded by a durable delivery operation. */
export function signVerifyEmailPayload(
  payload: VerifyEmailPayload & { purpose: "agency-signup-email-verify" },
): string {
  return signPayload({ ...payload, email: payload.email.trim().toLowerCase() });
}

export function verifyVerifyEmailToken(
  token: string,
): { ok: true; payload: VerifyEmailPayload } | { ok: false; error: string } {
  if (token.length > 4_096) return { ok: false, error: "malformed_token" };
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
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "malformed_payload" };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, error: "malformed_payload" };
  }
  const candidate = decoded as Record<string, unknown>;
  if (
    typeof candidate.userId !== "string" || !candidate.userId
    || typeof candidate.email !== "string" || !candidate.email
    || typeof candidate.exp !== "number" || !Number.isSafeInteger(candidate.exp)
    || typeof candidate.nonce !== "string" || !candidate.nonce
  ) {
    return { ok: false, error: "missing_claims" };
  }
  if (
    candidate.purpose !== undefined
    && candidate.purpose !== "email-verify"
    && candidate.purpose !== "agency-signup-email-verify"
  ) return { ok: false, error: "invalid_purpose" };
  const payload = candidate as unknown as VerifyEmailPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired" };
  return { ok: true, payload };
}

// ─── Legacy local shims; runtime redemption uses the durable store ────────

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
  const { getNonceStore } = await import("@/lib/server/auth/nonceStore");
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
