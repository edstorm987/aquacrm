import "server-only";

import crypto from "node:crypto";

/**
 * Confirming that the person connecting is who they say they are.
 *
 * The shape Ed wants: sign in, then a code by email, then the portal loads
 * connected. This module owns the decision — is this code good enough to bind
 * a piece of software to somebody's name — so it can be tested without a mail
 * server or a database.
 *
 * ── How the real code works ──────────────────────────────────────────────────
 *
 * A short code a human types cannot be a self-verifying token the way a
 * magic-link is — there is no room in six digits for a signature. So the code
 * is *stored* to be checked later: on "accept connection" a random six-digit
 * code is minted, HMAC-hashed with the session secret, and the hash is written
 * onto the connection record (`pendingCode`) with a fifteen-minute expiry. The
 * raw code is emailed and never kept. Verifying re-hashes what the person typed
 * — with the same connection id and user id mixed in, so a code only ever works
 * for the person it was sent to — and compares in constant time. Single use is
 * the record's job: the moment a code is accepted, `pendingCode` is cleared, so
 * a replay finds nothing to match.
 *
 * The hashing mirrors `magicLink.ts`/`emailVerification.ts`; the durable,
 * multi-instance-safe home mirrors why `nonceStore.ts` exists — a code minted
 * on one serverless instance must be verifiable on another, which an in-memory
 * map cannot promise but the persisted connection record can.
 *
 * ── The dev bypass (kept, tightly gated) ─────────────────────────────────────
 *
 * `DEV_CONFIRMATION_CODE` is accepted ONLY when dev mode is on — which requires,
 * among other things, that the storage backend is file or memory, so it
 * physically cannot confirm anything against real data. It lets the screens be
 * walked end to end without a mailbox. Everywhere else a real, stored code is
 * required.
 */

/** How many digits an emailed confirmation code has. */
export const CONFIRMATION_CODE_LENGTH = 6;

/**
 * How long an emailed code stays good.
 *
 * Fifteen minutes — long enough to switch to an email client and back, short
 * enough that a code seen over a shoulder is not a standing key. Matches the
 * magic-link token's window so the auth surface reads consistently.
 */
export const CONFIRMATION_CODE_TTL_MS = 15 * 60 * 1_000;

/** Stand-in for a real emailed code. Dev mode only. See the note above. */
export const DEV_CONFIRMATION_CODE = "0".repeat(CONFIRMATION_CODE_LENGTH);

/**
 * How many wrong guesses a single code tolerates before it locks.
 *
 * A six-digit code is one in a million per guess; five tries is far too few to
 * brute-force yet forgiving of fat fingers. Once locked, even the right code is
 * refused — the only way on is a fresh code, which resets the count. Expiry
 * clears it too, so a lock is never permanent.
 */
export const MAX_CODE_ATTEMPTS = 5;

/**
 * The stored side of an emailed code — hashed, expiring, single-use.
 *
 * Lives on the connection record. The raw code is never kept; only this hash,
 * against which a typed code is checked. `attempts` counts wrong guesses so the
 * verify endpoint can lock out brute force.
 */
export interface PendingConfirmationCode {
  /** HMAC(secret, "connect-code:{connectionId}:{userId}:{code}"). */
  hash: string;
  /** Epoch ms after which the code no longer confirms. */
  expiresAt: number;
  /** Wrong guesses so far, for lockout. */
  attempts: number;
}

export type ConfirmationOutcome =
  /** Proven — the connection may be completed. */
  | { status: "confirmed" }
  /** A code was given and it was not right. */
  | { status: "wrong-code"; message: string }
  /** The code was right once but has passed its expiry — a fresh one is needed. */
  | { status: "expired"; message: string }
  /** Too many wrong guesses on this code — it is locked until a fresh one is sent. */
  | { status: "locked"; message: string }
  /**
   * No code given yet — the screen should ask for one. Carries nothing about
   * whether a code was really sent.
   */
  | { status: "code-required"; message: string }
  /**
   * Confirmation cannot be carried out here at all — e.g. no email sender is
   * configured to deliver the code. Distinct from a wrong code: retrying will
   * never help.
   */
  | { status: "unavailable"; message: string };

function getSecret(): string {
  return process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
}

/** Spaces and dashes are how people type codes out of an email. */
function normalizeCode(code: string | undefined): string {
  return (code ?? "").replace(/[\s-]/g, "");
}

/**
 * A fresh, uniformly random numeric code.
 *
 * `crypto.randomInt` is unbiased across the range; zero-padding keeps every
 * code the same width so "004821" is never shown as "4821".
 */
export function generateConfirmationCode(): string {
  const ceiling = 10 ** CONFIRMATION_CODE_LENGTH;
  return crypto.randomInt(0, ceiling).toString().padStart(CONFIRMATION_CODE_LENGTH, "0");
}

/**
 * The value stored for a code, and re-derived to check one.
 *
 * The connection id and user id are mixed in, so a code is bound to the person
 * it was sent to and to the one connection — a code cannot be lifted onto
 * another connection, and one user's code cannot confirm another's session.
 */
export function hashConfirmationCode(input: {
  connectionId: string;
  userId: string;
  code: string;
}): string {
  const code = normalizeCode(input.code);
  return crypto
    .createHmac("sha256", getSecret())
    .update(`connect-code:${input.connectionId}:${input.userId}:${code}`)
    .digest("base64url");
}

/** Deliberately vague — neither "expired" nor "never sent" narrows a guess. */
const WRONG_CODE_MESSAGE = "That code was not right. Check the code and try again.";

/**
 * Whether this code confirms the person.
 *
 * Fails closed in every direction that is not an explicit, unexpired match.
 * The dev stand-in is honoured only where the bypass is allowed; everywhere
 * else a real stored code is required and compared in constant time.
 */
export function checkConfirmationCode(input: {
  code: string | undefined;
  bypassEnabled: boolean;
  connectionId: string;
  userId: string;
  /** The code stored for this connection, if one has been issued. */
  stored: PendingConfirmationCode | undefined;
  /** Wrong guesses tolerated before the code locks. Defaults to `MAX_CODE_ATTEMPTS`. */
  maxAttempts?: number;
  now?: number;
}): ConfirmationOutcome {
  const now = input.now ?? Date.now();
  const maxAttempts = input.maxAttempts ?? MAX_CODE_ATTEMPTS;
  const code = normalizeCode(input.code);

  if (!code) {
    return {
      status: "code-required",
      message: `Enter the ${CONFIRMATION_CODE_LENGTH}-digit code to confirm it is you.`,
    };
  }

  // The dev stand-in, honoured only where the bypass is allowed. A real stored
  // code, if one exists, still verifies below — so the real path is walkable in
  // dev too, not only the bypass. Deliberately above the lockout: the bypass is
  // for walking the flow, and locking it out would defeat that.
  if (input.bypassEnabled && code === DEV_CONFIRMATION_CODE) {
    return { status: "confirmed" };
  }

  if (!input.stored) {
    // Nothing was issued (or a code was already used). Vague on purpose — the
    // screen offers a resend as the way forward.
    return { status: "wrong-code", message: WRONG_CODE_MESSAGE };
  }

  // Locked after too many wrong guesses — even a correct code is refused now, so
  // guessing to the limit and then trying the real one cannot work. A resend
  // mints a fresh code with the count reset.
  if (input.stored.attempts >= maxAttempts) {
    return {
      status: "locked",
      message: "Too many tries on this code. Send yourself a fresh one and try again.",
    };
  }

  if (now > input.stored.expiresAt) {
    // Expiry is not a guessing oracle — knowing a code lapsed does not narrow
    // the next guess — and saying so lets the screen offer a new one.
    return {
      status: "expired",
      message: "That code has expired. Send a fresh one and try again.",
    };
  }

  const submitted = hashConfirmationCode({
    connectionId: input.connectionId,
    userId: input.userId,
    code,
  });
  const a = Buffer.from(submitted, "utf8");
  const b = Buffer.from(input.stored.hash, "utf8");
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    return { status: "confirmed" };
  }

  return { status: "wrong-code", message: WRONG_CODE_MESSAGE };
}

/**
 * The email that carries a confirmation code.
 *
 * Kept a pure content builder — no mail transport — so the copy is testable and
 * the transport (`transactionalEmail.ts`) stays the one place delivery is
 * decided. Mirrors the magic-link email's Milesymedia concierge styling so the
 * two transactional emails read as one voice. The code is shown large; the
 * expiry and single-use are stated plainly, because those are the two things a
 * person needs to trust and to act in time.
 */
export function connectionCodeEmail(input: {
  /** The plaintext code — this email is the only place it appears. */
  code: string;
  /** The software being connected, for context: "Cedar booking app". */
  label: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const ttlMinutes = Math.round(CONFIRMATION_CODE_TTL_MS / 60_000);
  const spaced = input.code.split("").join(" ");
  return {
    subject: `${input.code} is your confirmation code`,
    bodyText: [
      "MILESYMEDIA",
      "",
      "Your confirmation code",
      "",
      `Enter this code to connect ${input.label} to your portal:`,
      "",
      `    ${input.code}`,
      "",
      `For your security, this code expires in ${ttlMinutes} minutes and can only be used once.`,
      "",
      "If you did not ask to connect anything, you can ignore this email — nothing will happen.",
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
      '<p style="margin:0 0 14px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b6c33;">Confirmation code</p>',
      `<h1 style="margin:0;font-family:Georgia,Times,serif;font-size:30px;line-height:1.2;font-weight:400;color:#1b1a18;">Enter this code to connect ${input.label}.</h1>`,
      `<p style="margin:28px 0 0;font-family:'Courier New',monospace;font-size:40px;letter-spacing:12px;font-weight:700;color:#1b1a18;">${spaced}</p>`,
      `<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#817b72;">For your security, this code expires in ${ttlMinutes} minutes and can only be used once.</p>`,
      '</td></tr>',
      '<tr><td style="padding:22px 36px;border-top:1px solid #ded9cf;font-size:11px;line-height:1.6;color:#8d877e;">If you did not ask to connect anything, you can safely ignore this email.</td></tr>',
      '</table>',
      '</td></tr></table>',
      '</body></html>',
    ].join(""),
  };
}
