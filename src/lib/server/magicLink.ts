// Magic-link sign-in for end-customers. R9.
// (No `import "server-only"` — same rationale as oauthGoogle.ts: smoke
// imports this directly; the in-memory nonce store + HMAC signing only
// take effect when actually called.)
//
// Token shape:    base64url(JSON({email, clientId, agencyId, exp, nonce})) "." HMAC
// TTL:            15 minutes
// Single-use:     nonce stored in an in-memory Set with TTL expiry. Replay
//                 = "already used" reject. (v1 limitation: single-process —
//                 prod multi-instance needs shared storage; documented.)
//
// Email delivery: T2 R10's email-sender plugin owns the actual SMTP.
// Foundation calls a registered delivery function (`registerMagicLinkDelivery`).
// When unset (e.g. dev with the plugin not installed), the URL is logged
// to the server console so a developer can copy/paste it.

import crypto from "crypto";

const TOKEN_TTL_SECONDS = 60 * 15;

export interface MagicLinkPayload {
  email: string;
  clientId: string;
  agencyId: string;
  exp: number;
  nonce: string;
}

function getSecret(): string {
  return process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
}

export function signMagicToken(input: Omit<MagicLinkPayload, "exp" | "nonce">): {
  token: string;
  payload: MagicLinkPayload;
} {
  const payload: MagicLinkPayload = {
    email: input.email.trim().toLowerCase(),
    clientId: input.clientId,
    agencyId: input.agencyId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return { token: `${b64}.${sig}`, payload };
}

export function verifyMagicToken(
  token: string,
): { ok: true; payload: MagicLinkPayload } | { ok: false; error: string } {
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
  let payload: MagicLinkPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as MagicLinkPayload;
  } catch {
    return { ok: false, error: "malformed_payload" };
  }
  if (!payload.email || !payload.clientId || !payload.exp || !payload.nonce) {
    return { ok: false, error: "missing_claims" };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, error: "expired" };
  return { ok: true, payload };
}

// ─── Single-use nonce store ───────────────────────────────────────────────
// R028: durable nonces via shared store (memory in dev, Postgres in
// prod). The legacy `isUsed`/`markUsed` pair is now a thin wrapper:
// a single `consumeNonce` call replaces the check-then-mark race
// the previous shape implicitly tolerated (small window between
// check + mark on a hot magic-link). Atomic INSERT-or-fail at the
// store layer closes the gap.

import { getNonceStore } from "./nonceStore";

// Legacy callers expected `isUsed(nonce)` to return whether the nonce
// was already consumed without itself consuming. The verify route now
// calls `consumeNonceOrReject(nonce, exp)` which does both in one
// atomic step — wrappers below preserve the API surface so the smoke +
// existing route keep compiling, but the route handler is updated to
// the atomic helper.
export async function consumeMagicNonce(nonce: string, expSec: number): Promise<boolean> {
  const ttlMs = Math.max(0, expSec * 1000 - Date.now());
  return getNonceStore().consumeNonce(nonce, "magic-link", ttlMs);
}

// Back-compat shims — prefer `consumeMagicNonce` going forward. These
// preserve a check/mark API for callers that haven't migrated yet,
// but they are NOT atomic: prefer the single-call variant.
const _legacyUsed = new Map<string, number>();
export function isUsed(nonce: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of _legacyUsed) if (v < now) _legacyUsed.delete(k);
  return _legacyUsed.has(nonce);
}
export function markUsed(nonce: string, exp: number): void {
  _legacyUsed.set(nonce, exp);
}

// Test-only: clear the local back-compat set so smoke can run replay
// scenarios in isolation. NOT exported via barrel.
export function _clearUsedForTests(): void {
  _legacyUsed.clear();
}

// ─── Email delivery hook ──────────────────────────────────────────────────

export interface MagicLinkDelivery {
  (input: {
    email: string;
    clientId: string;
    agencyId: string;
    magicUrl: string;
  }): Promise<void>;
}

let delivery: MagicLinkDelivery | null = null;

export function registerMagicLinkDelivery(fn: MagicLinkDelivery | null): void {
  delivery = fn;
}

export async function deliverMagicLink(input: {
  email: string;
  clientId: string;
  agencyId: string;
  magicUrl: string;
}): Promise<{ delivered: boolean; via: "email-sender" | "console" }> {
  if (delivery) {
    await delivery(input);
    return { delivered: true, via: "email-sender" };
  }
  // Dev fallback — log so the URL can be copy-pasted.
  console.log(
    `[magic-link] No delivery hook registered. URL for ${input.email}: ${input.magicUrl}`,
  );
  return { delivered: false, via: "console" };
}
