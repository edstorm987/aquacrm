import "server-only";

import crypto from "node:crypto";

/**
 * Signing somebody into their Aqua portal from their own application.
 *
 * A Tier 2 client lives in the product we built them. Their sidebar carries an
 * `Aqua` link, and clicking it should land them in their portal already signed
 * in — they authenticated once, in their own app, and being asked again for a
 * password they may not even have is where this falls down in practice.
 *
 * So their app mints a short-lived handoff token and links to it. Aqua verifies
 * it and issues its own session. Nothing about the two systems' sessions is
 * shared; this is a one-way introduction, not a trust relationship.
 *
 * ── Why it is built the way it is ───────────────────────────────────────────
 *
 * A token in a URL leaks. It sits in browser history, in the referrer header,
 * in server logs, in whatever chat window somebody pastes it into. Every
 * property below exists because that is assumed rather than hoped against:
 *
 *   Short-lived   — 90 seconds. Long enough to follow a link, far too short to
 *                   be useful once it has been logged.
 *   Single-use    — redeemed once, then dead. A leaked token that has already
 *                   been used is worthless.
 *   Scoped        — carries one client and one role. A stolen token cannot be
 *                   edited into a different client; the signature covers it.
 *   Signed        — HMAC over the whole payload with a secret Aqua holds.
 *   Client-only   — never mints an agency session. The worst case is somebody
 *                   reaching one client's portal, not the agency's workspace.
 */

const HANDOFF_TTL_SECONDS = 90;
const MAX_CLOCK_SKEW_SECONDS = 30;

export interface HandoffClaims {
  clientId: string;
  /** The portal user this signs in as. */
  userId: string;
  email: string;
  agencyId: string;
  /** Where to land — a path inside the portal, never an absolute URL. */
  destination?: string;
}

interface HandoffPayload extends HandoffClaims {
  /** Random per token, so two otherwise identical tokens differ and can be
   *  told apart when one is redeemed. */
  jti: string;
  iat: number;
  exp: number;
}

function secret(): string {
  const value = process.env.PORTAL_HANDOFF_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("PORTAL_HANDOFF_SECRET must be set to at least 32 characters before handoff links can be issued.");
  }
  return value;
}

/**
 * Only paths inside the portal.
 *
 * Without this the destination is an open redirect: a link that signs somebody
 * in and then forwards them to an attacker's page, carrying Aqua's name and
 * their trust with it.
 */
export function safeDestination(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return undefined;
  // `//host` is protocol-relative and leaves the site; `/\` is treated as the
  // same by some browsers.
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return undefined;
  if (trimmed.includes("://")) return undefined;
  return trimmed.slice(0, 300);
}

export function mintHandoffToken(claims: HandoffClaims, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const payload: HandoffPayload = {
    ...claims,
    destination: safeDestination(claims.destination),
    jti: crypto.randomBytes(16).toString("base64url"),
    iat: issuedAt,
    exp: issuedAt + HANDOFF_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export type HandoffFailure =
  | "malformed"
  | "bad-signature"
  | "expired"
  | "not-yet-valid"
  | "already-used";

export type HandoffResult =
  | { ok: true; claims: HandoffPayload }
  | { ok: false; reason: HandoffFailure };

/**
 * Verifies a token's shape, signature and freshness.
 *
 * Redemption — marking it used — is separate and belongs to the caller, which
 * owns the store. Verifying and consuming in one function would mean this
 * module could not be tested without one.
 */
export function verifyHandoffToken(token: string | undefined, now = Date.now()): HandoffResult {
  if (!token) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");

  // Constant-time, so the comparison cannot be used to guess a signature one
  // byte at a time. Length is checked first because timingSafeEqual throws on
  // a mismatch, and throwing is itself a timing signal.
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return { ok: false, reason: "bad-signature" };
  }

  let payload: HandoffPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload?.clientId || !payload.userId || !payload.agencyId || !payload.jti) {
    return { ok: false, reason: "malformed" };
  }

  const seconds = Math.floor(now / 1000);
  if (seconds > payload.exp) return { ok: false, reason: "expired" };
  // A token from the future is a clock problem or a forged `iat`. A little
  // skew is tolerated; a lot is refused rather than silently accepted.
  if (payload.iat - seconds > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "not-yet-valid" };

  return { ok: true, claims: payload };
}

/**
 * Remembers which tokens have been redeemed.
 *
 * In memory deliberately: entries only need to outlive the token itself, which
 * is 90 seconds, and a store that survives restarts would grow forever to
 * protect against a replay of something that expired long ago.
 */
const redeemed = new Map<string, number>();

export function redeemHandoffToken(jti: string, expiresAt: number, now = Date.now()): boolean {
  // Swept on use rather than on a timer: this runs in a request, and a
  // background interval in a serverless function is a leak with no owner.
  for (const [key, expiry] of redeemed) {
    if (expiry * 1000 < now) redeemed.delete(key);
  }
  if (redeemed.has(jti)) return false;
  redeemed.set(jti, expiresAt);
  return true;
}

/** Test seam — the store is process-wide and would otherwise leak between tests. */
export function clearRedeemedHandoffTokens(): void {
  redeemed.clear();
}
