// Magic-link sign-in for end-customers. R9.
// (No `import "server-only"` — same rationale as oauthGoogle.ts: smoke
// imports this directly; the in-memory nonce store + HMAC signing only
// take effect when actually called.)
//
// Token shape:    base64url(JSON({purpose, email, clientId, agencyId, exp, nonce})) "." HMAC
// TTL:            15 minutes
// Single-use:     nonce is atomically consumed through the shared durable
//                 nonce store. Replay = "already used" reject.
//
// Email delivery: T2 R10's email-sender plugin owns the actual SMTP.
// Foundation calls a registered delivery function (`registerMagicLinkDelivery`).
// When unset (e.g. dev with the plugin not installed), the URL is logged
// to the server console so a developer can copy/paste it.

import crypto from "crypto";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";

const TOKEN_TTL_SECONDS = 60 * 15;

export interface MagicLinkPayload {
  purpose: MagicLinkPurpose;
  email: string;
  clientId: string;
  agencyId: string;
  exp: number;
  nonce: string;
  /** Exact user session epoch at issuance; null only for a new invitation. */
  sessionRev: number | null;
}

export type MagicLinkPurpose = "sign-in" | "client-portal-invite";

/** Stamp the authoritative rotation epoch into a magic-link session. */
export function magicLinkSessionRevision(user: { sessionRev?: number }): number {
  return user.sessionRev ?? 0;
}

type MagicLinkSubject = Pick<MagicLinkPayload, "email" | "clientId" | "agencyId" | "sessionRev"> & {
  /** Durable delivery generations supply these to reconstruct one exact token. */
  nonce?: string;
  exp?: number;
};

function getSecret(): string {
  return resolveSigningSecret();
}

function signPurposeToken(input: MagicLinkSubject, purpose: MagicLinkPurpose): {
  token: string;
  payload: MagicLinkPayload;
} {
  const payload: MagicLinkPayload = {
    purpose,
    email: input.email.trim().toLowerCase(),
    clientId: input.clientId,
    agencyId: input.agencyId,
    exp: input.exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: input.nonce ?? crypto.randomBytes(16).toString("base64url"),
    sessionRev: input.sessionRev,
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return { token: `${b64}.${sig}`, payload };
}

/**
 * Sign-in tokens authenticate an already-existing, exactly scoped end-customer.
 * They are deliberately unable to create membership.
 */
export function signMagicToken(input: MagicLinkSubject): {
  token: string;
  payload: MagicLinkPayload;
} {
  return signPurposeToken(input, "sign-in");
}

/**
 * The only token allowed to create a client-portal membership. Keep this
 * separate from `signMagicToken` so a public sign-in route cannot select the
 * stronger purpose from request data.
 */
export function signClientPortalInviteToken(input: MagicLinkSubject): {
  token: string;
  payload: MagicLinkPayload;
} {
  return signPurposeToken(input, "client-portal-invite");
}

export function verifyMagicToken(
  token: string,
): { ok: true; payload: MagicLinkPayload } | { ok: false; error: string } {
  if (token.length > 4096) return { ok: false, error: "malformed_token" };
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
    typeof candidate.email !== "string" || !candidate.email
    || typeof candidate.clientId !== "string" || !candidate.clientId
    || typeof candidate.agencyId !== "string" || !candidate.agencyId
    || typeof candidate.exp !== "number" || !Number.isSafeInteger(candidate.exp)
    || typeof candidate.nonce !== "string" || !candidate.nonce
    || typeof candidate.purpose !== "string" || !candidate.purpose
    || !(
      candidate.sessionRev === null
      || (typeof candidate.sessionRev === "number"
        && Number.isSafeInteger(candidate.sessionRev)
        && candidate.sessionRev >= 0)
    )
  ) {
    return { ok: false, error: "missing_claims" };
  }
  const payload = candidate as unknown as MagicLinkPayload;
  if (payload.purpose !== "sign-in" && payload.purpose !== "client-portal-invite") {
    return { ok: false, error: "invalid_purpose" };
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

import { getNonceStore } from "@/lib/server/auth/nonceStore";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";

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

export async function consumeClientPortalInviteNonce(nonce: string, expSec: number): Promise<boolean> {
  const ttlMs = Math.max(0, expSec * 1000 - Date.now());
  return getNonceStore().consumeNonce(nonce, "client-portal-invite", ttlMs);
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
    /** Stable for retries of this exact token generation; changes for a new token. */
    operationRef: string;
    /** Public response deadline/caller cancellation reaches every delivery hook. */
    signal?: AbortSignal;
  }): Promise<void>;
}

let delivery: MagicLinkDelivery | null = null;

export function registerMagicLinkDelivery(fn: MagicLinkDelivery | null): void {
  delivery = fn;
}

interface MagicLinkDeliveryInput {
  email: string;
  clientId: string;
  agencyId: string;
  magicUrl: string;
  /** Durable server-side operation identity; never accepted from a request. */
  operationRef?: string;
  signal?: AbortSignal;
}

export interface MagicLinkDeliveryResult {
  delivered: boolean;
  via: "email-sender" | "resend" | "console";
  /**
   * Provider idempotency identity for this exact signed-token generation.
   * A caller retrying an ambiguous delivery must reuse the same magicUrl and
   * therefore the same operationRef. A later request mints a new token/nonce
   * and receives a different operationRef.
   */
  operationRef: string;
  reason?: string;
  code?: "REMOTE_OPERATION_TIMEOUT" | "REMOTE_OPERATION_ABORTED" | "REMOTE_OPERATION_FAILED";
  outcomeUnknown?: boolean;
  retry?: "safe" | "same-operation-key" | "reconcile-first";
}

function magicTokenGenerationIdentity(magicUrl: string): string {
  try {
    const parsed = new URL(magicUrl, "https://invalid.aquacrm.local");
    const token = parsed.searchParams.get("token")?.trim();
    if (token) return token;
  } catch {
    // A registered test/dev delivery may use a non-URL marker. Hashing the
    // exact marker still gives retries a stable identity without leaking it.
  }
  return magicUrl;
}

/**
 * Build a non-secret provider idempotency key for one signed-link operation.
 * The raw token and recipient address never leave this module in the key.
 */
export function magicLinkDeliveryOperationRef(input: MagicLinkDeliveryInput): string {
  const generationDigest = crypto
    .createHash("sha256")
    .update(input.agencyId)
    .update("\0")
    .update(input.clientId)
    .update("\0")
    .update(input.email.trim().toLowerCase())
    .update("\0")
    .update(magicTokenGenerationIdentity(input.magicUrl))
    .digest("base64url")
    .slice(0, 32);
  return `customer-access:${input.clientId}:${generationDigest}`;
}

export async function deliverMagicLink(
  input: MagicLinkDeliveryInput,
  dependencies: { sendEmail?: typeof sendTransactionalEmail } = {},
): Promise<MagicLinkDeliveryResult> {
  const operationRef = input.operationRef ?? magicLinkDeliveryOperationRef(input);
  if (delivery) {
    await delivery({ ...input, operationRef, signal: input.signal });
    return { delivered: true, via: "email-sender", operationRef };
  }

  const sent = await (dependencies.sendEmail ?? sendTransactionalEmail)({
    to: input.email,
    agencyId: input.agencyId,
    clientId: input.clientId,
    externalRef: operationRef,
    subject: "Your private Milesymedia home is ready",
    bodyText: [
      "MILESYMEDIA",
      "",
      "Your private Milesymedia home is ready.",
      "",
      "Your project, files, billing, approvals, and support now have one secure place.",
      "",
      "Open your client portal:",
      input.magicUrl,
      "",
      "For your security, this link expires in 15 minutes and can only be used once.",
      "",
      "If you did not request this email, you can ignore it.",
    ].join("\n"),
    bodyHtml: [
      '<!doctype html><html><body style="margin:0;background:#f4f1eb;color:#1b1a18;font-family:Arial,Helvetica,sans-serif;">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1eb;padding:40px 16px;"><tr><td align="center">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fbfaf8;border:1px solid #ded9cf;">',
      '<tr><td style="padding:28px 36px;border-bottom:1px solid #ded9cf;">',
      '<p style="margin:0;font-family:Georgia,Times,serif;font-size:22px;color:#1b1a18;">Milesymedia</p>',
      '<p style="margin:6px 0 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b6c33;">Client concierge</p>',
      '</td></tr>',
      '<tr><td style="padding:48px 36px 42px;">',
      '<p style="margin:0 0 14px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b6c33;">Private access</p>',
      '<h1 style="margin:0;font-family:Georgia,Times,serif;font-size:38px;line-height:1.15;font-weight:400;color:#1b1a18;">Your Milesymedia home is ready.</h1>',
      '<p style="margin:20px 0 0;max-width:470px;font-size:15px;line-height:1.7;color:#5f5b55;">Your project, files, billing, approvals, and support now have one secure place.</p>',
      `<p style="margin:30px 0 0;"><a href="${input.magicUrl}" style="display:inline-block;background:#1b1a18;color:#ffffff;text-decoration:none;padding:14px 22px;font-size:14px;font-weight:600;">Open your client portal</a></p>`,
      '<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#817b72;">For your security, this link expires in 15 minutes and can only be used once.</p>',
      '</td></tr>',
      '<tr><td style="padding:22px 36px;border-top:1px solid #ded9cf;font-size:11px;line-height:1.6;color:#8d877e;">If you did not request this email, you can safely ignore it.</td></tr>',
      '</table>',
      '</td></tr></table>',
      '</body></html>',
    ].join(""),
    signal: input.signal,
  });
  if (sent.delivered) return { delivered: true, via: "resend", operationRef };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[magic-link] Email delivery is not configured. URL for ${input.email}: ${input.magicUrl}`,
    );
  } else {
    console.error("[magic-link] Delivery failed.");
  }
  return {
    delivered: false,
    via: "console",
    operationRef,
    ...(sent.reason ? { reason: sent.reason } : {}),
    ...(sent.code ? { code: sent.code } : {}),
    ...(sent.outcomeUnknown !== undefined ? { outcomeUnknown: sent.outcomeUnknown } : {}),
    ...(sent.retry ? { retry: sent.retry } : {}),
  };
}
