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
import { sendTransactionalEmail } from "./transactionalEmail";

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
}): Promise<{ delivered: boolean; via: "email-sender" | "resend" | "console" }> {
  if (delivery) {
    await delivery(input);
    return { delivered: true, via: "email-sender" };
  }

  const sent = await sendTransactionalEmail({
    to: input.email,
    agencyId: input.agencyId,
    clientId: input.clientId,
    externalRef: `customer-access:${input.clientId}:${input.email}`,
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
  });
  if (sent.delivered) return { delivered: true, via: "resend" };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[magic-link] Email delivery is not configured. URL for ${input.email}: ${input.magicUrl}`,
    );
  } else {
    console.error(`[magic-link] Delivery failed for ${input.email}: ${sent.reason}`);
  }
  return { delivered: false, via: "console" };
}
