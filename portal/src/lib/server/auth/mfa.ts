/**
 * Two-factor authentication, via Supabase.
 *
 * Aqua does not implement 2FA — Supabase Auth already has it, and a
 * hand-rolled TOTP implementation is a liability with no upside. What lives
 * here is the part Aqua owns: deciding when a second factor is *required*, and
 * saying so in language somebody can act on.
 *
 * Supabase expresses this as an assurance level on the session:
 *
 *   aal1 — one factor. A password, or a social sign-in.
 *   aal2 — two. A password plus a verified TOTP code.
 *
 * The distinction that matters and is easy to get wrong: a user who has
 * enrolled a factor but has not been challenged on this session is still aal1.
 * Enrolment is not authentication. Reading "has 2FA switched on" as "is
 * strongly authenticated right now" would let a stolen session skip the very
 * check it appears to have.
 */

import { getSupabasePublicConfig } from "@/lib/supabase/config";

export type AssuranceLevel = "aal1" | "aal2";

export interface AssuranceState {
  /** What this session has actually satisfied. */
  current: AssuranceLevel | null;
  /** What this user could satisfy, given what they have enrolled. */
  next: AssuranceLevel | null;
}

export type MfaRequirement =
  /** Strongly authenticated — proceed. */
  | { status: "satisfied" }
  /** Has a factor, has not been challenged on this session. */
  | { status: "challenge-required"; message: string }
  /** No factor at all — must enrol before this action is possible. */
  | { status: "enrolment-required"; message: string };

/**
 * Whether a session may perform an action that requires two factors.
 *
 * Connecting a client's software to their account is exactly such an action:
 * it binds a piece of external software to somebody's name, and afterwards it
 * signs them in without asking again. A password alone is too thin for a
 * decision with that shape.
 */
export function requireTwoFactor(state: AssuranceState): MfaRequirement {
  if (state.current === "aal2") return { status: "satisfied" };

  // Enrolled but unchallenged. Supabase reports this as current aal1 with a
  // next of aal2 — the session can be raised without enrolling anything.
  if (state.next === "aal2") {
    return {
      status: "challenge-required",
      message: "Enter the code from your authenticator app to confirm it is you.",
    };
  }

  return {
    status: "enrolment-required",
    // Says why, not just no. "Two-factor required" leaves somebody hunting for
    // a setting; this tells them what it protects and what to do.
    message: "Connecting software to your account needs two-factor authentication. "
      + "Set it up once and it protects everything else on your account too.",
  };
}

/**
 * Reads the assurance state from whatever Supabase returned.
 *
 * Tolerant of the shape rather than assuming it, and — critically — failing
 * closed. An unreadable response yields no assurance at all, so the caller
 * refuses rather than proceeding on the assumption that silence means fine.
 */
export function readAssurance(value: unknown): AssuranceState {
  const data = value as { currentLevel?: unknown; nextLevel?: unknown } | null | undefined;
  const level = (input: unknown): AssuranceLevel | null =>
    input === "aal1" || input === "aal2" ? input : null;
  return { current: level(data?.currentLevel), next: level(data?.nextLevel) };
}

/** Whether the user has any verified factor at all. */
export function hasVerifiedFactor(factors: Array<{ status?: string }> | null | undefined): boolean {
  return (factors ?? []).some(factor => factor.status === "verified");
}

// ─── The login gate ───────────────────────────────────────────────────────
//
// Everything above decides whether an already-signed-in session is strongly
// authenticated. What follows is the other half, and the one that was missing:
// deciding, at the moment a password has just been accepted, whether a second
// factor has to be produced *before* Aqua issues its own session cookie.
//
// Why it has to live at that exact moment: `/api/auth/login` validates the
// password through Supabase and then mints Aqua's own HMAC cookie
// (`lk_session_v1`). Supabase's session is only a cross-check afterwards. So
// gating Supabase's assurance level alone would gate nothing — the app cookie
// is what opens the portal, and withholding *that* is the whole gate.
//
// These functions are deliberately pure. The route does the network calls; the
// decisions live here where they can be tested without a Supabase in the loop,
// and where the one property that matters — that leaving the code out does not
// skip the step — is a single readable branch rather than a shape of control
// flow spread across a route handler.

/** The shape of the user Supabase hands back from a password sign-in. */
export interface SignedInUser {
  factors?: Array<{
    id?: unknown;
    factor_type?: unknown;
    status?: unknown;
  }> | null;
}

/** A factor the login gate is able to challenge. */
export interface ChallengeableFactor {
  id: string;
  factorType: string;
}

/**
 * The message shown when a code is needed.
 *
 * It is only ever reached *after* a correct password, so it cannot be used to
 * discover whether an account exists — but it also says nothing about the
 * account beyond "there is an authenticator", which the person holding the
 * password already knows.
 */
export const MFA_LOGIN_CHALLENGE_MESSAGE =
  "Enter the six-digit code from your authenticator app to finish signing in.";

/** Same wording whether the code was wrong, expired or already used. */
export const MFA_LOGIN_REJECTED_MESSAGE = "That code was not right. Try the current one.";

/** A factor exists but Aqua has no way to challenge it — refuse, never skip. */
export const MFA_LOGIN_UNAVAILABLE_MESSAGE =
  "Two-factor authentication is switched on for this account but could not be checked here. "
  + "Contact your workspace owner to reset it.";

/**
 * Every verified factor on the user, in the order Supabase listed them.
 *
 * Only `verified` counts. An enrolment somebody started and abandoned is not
 * protection, and treating it as one would lock a person out of their own
 * account behind a code no app is generating.
 */
export function verifiedFactors(user: SignedInUser | null | undefined): ChallengeableFactor[] {
  const list = Array.isArray(user?.factors) ? user!.factors! : [];
  const out: ChallengeableFactor[] = [];
  for (const factor of list) {
    if (factor?.status !== "verified") continue;
    if (typeof factor.id !== "string" || !factor.id) continue;
    out.push({ id: factor.id, factorType: typeof factor.factor_type === "string" ? factor.factor_type : "" });
  }
  return out;
}

export type LoginMfaStep =
  /** No verified factor — the password was the whole requirement. */
  | { status: "not-required" }
  /** A factor exists and no code came with the request. Withhold the session. */
  | { status: "code-required"; message: string }
  /** A code came with the request — check it against this factor. */
  | { status: "check-code"; factorId: string; code: string }
  /** The code reads as a recovery code — check it against the stored hashes. */
  | { status: "check-recovery"; code: string }
  /** A factor exists that cannot be challenged here. Refuse. */
  | { status: "unavailable"; message: string };

/**
 * What the login route must do next, given the user Supabase just returned and
 * whatever the caller sent as a code.
 *
 * The property this exists to make unmissable: **an absent code is not a pass**.
 * A missing, blank, non-string or whitespace-only `code` on an account that has
 * a factor lands on `code-required`, never on `not-required`. An MFA step that
 * can be skipped by leaving a field out is worse than no MFA, because it looks
 * like protection.
 */
export function loginMfaStep(input: { user: SignedInUser | null | undefined; code: unknown }): LoginMfaStep {
  const factors = verifiedFactors(input.user);
  if (factors.length === 0) return { status: "not-required" };

  const code = typeof input.code === "string" ? input.code.trim().replace(/\s+/g, "") : "";
  const compact = code.replace(/-/g, "");

  // A recovery code is the one way in that does not need the authenticator —
  // that is its entire purpose — so it is recognised before the TOTP factor
  // is looked for, and it still works when the enrolled factor is of a kind
  // this path cannot challenge (the `unavailable` refusal below would
  // otherwise have no way back in at all). Anything that is not six digits
  // once separators are stripped is treated as a recovery attempt: it can
  // only ever be checked against stored hashes, so a typo costs one rejected
  // attempt — it can never skip the step.
  if (code && !/^\d{6}$/.test(compact)) {
    return { status: "check-recovery", code: normalizeRecoveryCode(code) };
  }

  // Aqua only ever enrols TOTP (`/api/portal/mfa/enrol`). A verified factor of
  // some other kind means protection is on that this code path cannot check —
  // so it refuses rather than waving it through.
  const totp = factors.find(factor => factor.factorType === "totp");
  if (!totp) return { status: "unavailable", message: MFA_LOGIN_UNAVAILABLE_MESSAGE };

  if (!code) return { status: "code-required", message: MFA_LOGIN_CHALLENGE_MESSAGE };

  return { status: "check-code", factorId: totp.id, code: compact };
}

/**
 * The `aal` claim inside a Supabase access token.
 *
 * Returns the level when the token carries one, `"unstated"` when the token
 * reads fine but has no `aal` claim, and `null` when nothing could be read.
 * Nothing here verifies the signature — that is Supabase's, and the token was
 * handed over the wire by Supabase itself. This only reads what it says.
 */
export function readTokenAssurance(accessToken: unknown): AssuranceLevel | "unstated" | null {
  if (typeof accessToken !== "string") return null;
  const segments = accessToken.split(".");
  if (segments.length !== 3) return null;
  try {
    const base64 = segments[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { aal?: unknown };
    if (payload.aal === "aal1" || payload.aal === "aal2") return payload.aal;
    return "unstated";
  } catch {
    return null;
  }
}

/**
 * Whether a factor verification actually *raised* the session.
 *
 * The point of the check: a verify call that answers "fine" without the
 * assurance level moving is not a second factor, it is a 200. Aqua's cookie is
 * withheld unless Supabase's own token backs the claim up.
 *
 * A token that decodes but states no `aal` at all is accepted — the claim is
 * absent, not contradicted, and the verify call itself already succeeded.
 * A token that states `aal1`, or that cannot be read, is refused: the first is
 * an explicit contradiction, the second means nothing can be confirmed.
 */
export function raisedToSecondFactor(accessToken: unknown): boolean {
  const level = readTokenAssurance(accessToken);
  return level === "aal2" || level === "unstated";
}

// ─── Session assurance (phase 3) ──────────────────────────────────────────
//
// The login gate proves the second factor once, at sign-in — and then the app
// mints its own HMAC cookie and Supabase's assurance level goes home. What
// carries the proof forward is `SessionPayload.aal`, stamped by the flow that
// minted the cookie. These read it back, failing closed the way everything
// else in this file does: junk or absence is "not proven", never aal2.

/** The assurance level an app session cookie proved at sign-in, or null. */
export function sessionAssurance(
  session: { aal?: unknown } | null | undefined,
): AssuranceLevel | null {
  const aal = session?.aal;
  return aal === "aal1" || aal === "aal2" ? aal : null;
}

/**
 * Whether this app session proved a second factor when it was minted.
 *
 * The one to gate sensitive actions on (owner actions, erasure, key material):
 * a legacy cookie from before `aal` existed answers `false` here, which is the
 * correct reading — it may well have passed the gate, but nothing can confirm
 * that now, and "probably" is not an assurance level.
 */
export function sessionHasSecondFactor(
  session: { aal?: unknown } | null | undefined,
): boolean {
  return sessionAssurance(session) === "aal2";
}

// ─── The side doors (phase 2 of closing the gate) ─────────────────────────
//
// `signInWithPassword` lives in exactly one route, so gating it gated the
// password door. But `lk_session_v1` is also minted by the magic-link verify
// and the Google OAuth callback — single-factor flows that never see the
// password, and before this section, never asked about MFA either. For an
// enrolled account they were a clean walk around the TOTP challenge.
//
// Neither flow has anywhere to type a code (a magic link is a GET redirect;
// Google hands back a finished identity), so the contract is refusal, not
// challenge: an enrolled account is sent to the password + code sign-in,
// which CAN check the second factor. And because these flows hold no Supabase
// session of their own, enrolment is read through the admin API — when that
// cannot be read at all, the answer is refusal too. A side door that opens
// whenever the check is unavailable is not closed.

/** Query-string error code: enrolled — use password + authenticator instead. */
export const MFA_SIDE_DOOR_ENROLLED_ERROR = "mfa_required";
/** Query-string error code: enrolment could not be checked — refused. */
export const MFA_SIDE_DOOR_UNCHECKED_ERROR = "mfa_unavailable";

/** What the enrolment lookup found out, expressed without a Supabase type. */
export type SideDoorLookup =
  /** A Supabase account exists — here are its factors as returned. */
  | { outcome: "found"; factors: Array<{ status?: unknown }> | null | undefined }
  /** No Supabase account for this email at all (most end-customers). */
  | { outcome: "absent" }
  /** The lookup failed or is not configured. Nothing can be confirmed. */
  | { outcome: "unavailable" };

export type SideDoorMfaDecision =
  | { status: "clear" }
  | {
      status: "refuse";
      error: typeof MFA_SIDE_DOOR_ENROLLED_ERROR | typeof MFA_SIDE_DOOR_UNCHECKED_ERROR;
    };

/**
 * Whether a single-factor flow may mint the app session for this account.
 *
 * ANY verified factor refuses — not just TOTP. The login gate can be picky
 * about factor kinds because it can challenge the one kind it knows; a side
 * door can challenge nothing, so "some second factor is switched on" is
 * already the whole answer.
 */
export function gateSideDoorSession(lookup: SideDoorLookup): SideDoorMfaDecision {
  if (lookup.outcome === "unavailable") {
    return { status: "refuse", error: MFA_SIDE_DOOR_UNCHECKED_ERROR };
  }
  if (lookup.outcome === "absent") return { status: "clear" };
  const factors = (lookup.factors ?? []).filter(
    (factor): factor is { status?: string } => typeof factor === "object" && factor !== null,
  );
  return hasVerifiedFactor(factors)
    ? { status: "refuse", error: MFA_SIDE_DOOR_ENROLLED_ERROR }
    : { status: "clear" };
}

/**
 * The impure edge of the side-door gate: look the email up through the
 * Supabase admin API and hand the answer to `gateSideDoorSession`.
 *
 * Dynamic import on purpose — `lib/supabase/admin` carries `server-only` and
 * the service-role client, and pulling either in at module load would change
 * what this file is safe to import from. The decision stays in the pure
 * function above, where the tests can reach every branch without a network.
 */
export async function checkSideDoorMfa(email: string): Promise<SideDoorMfaDecision> {
  let lookup: SideDoorLookup;
  try {
    const { findSupabaseUserByEmail } = await import("@/lib/supabase/admin");
    const user = await findSupabaseUserByEmail(email);
    lookup = user ? { outcome: "found", factors: user.factors } : { outcome: "absent" };
  } catch {
    // Unconfigured admin access and a failed call land in the same place:
    // nothing was confirmed, so nothing is minted.
    lookup = { outcome: "unavailable" };
  }
  return gateSideDoorSession(lookup);
}

// ─── Recovery codes (phase 4) ─────────────────────────────────────────────
//
// The way back in when the authenticator is gone. Ten single-use codes,
// generated when an account's first TOTP-gated sign-in completes (the first
// moment both factors have actually been proven together), shown exactly
// once in that response, and stored only as scrypt hashes on the user record.
// Spending one deletes its hash — single-use by absence, not by bookkeeping.
//
// Why generation rides the first gated sign-in rather than the enrolment
// confirm: the enrolment surface (`/api/portal/mfa/verify` + the account
// panel) belongs to another lane of the same plan, and a proven sign-in is
// the strictest context available here — the person holding the codes has
// just demonstrated the password AND the authenticator, which is more than
// the enrolment screen itself demands.

export const RECOVERY_CODE_COUNT = 10;

// No I, L, O, U, 0 or 1 — nothing a handwritten copy can mistake. 30 symbols
// over 10 positions is ~49 bits, behind scrypt at rest and the login route's
// 5-attempts-a-minute limiter plus lockout in transit.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const RECOVERY_CODE_LENGTH = 10;

// Same cost parameters as `server/users.ts` password hashing, deliberately:
// one scrypt profile to reason about, one format (`scrypt$N$r$p$salt$hash`).
const RECOVERY_SCRYPT_N = 16384;
const RECOVERY_SCRYPT_R = 8;
const RECOVERY_SCRYPT_P = 1;
const RECOVERY_SCRYPT_KEYLEN = 32;

/** Ten fresh plaintext codes, formatted XXXXX-XXXXX for reading aloud. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const { randomInt } = nodeCrypto();
  const codes: string[] = [];
  while (codes.length < count) {
    let raw = "";
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i += 1) {
      raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]!;
    }
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/**
 * A code the way a person will actually type it: any case, with or without
 * the dash, with stray spaces. Everything is compared in this normal form.
 */
export function normalizeRecoveryCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.toUpperCase().replace(/[\s-]+/g, "");
}

/** scrypt hash in the same format `server/users.ts` uses for passwords. */
export function hashRecoveryCode(code: string): string {
  const crypto = nodeCrypto();
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(normalizeRecoveryCode(code), salt, RECOVERY_SCRYPT_KEYLEN, {
    N: RECOVERY_SCRYPT_N, r: RECOVERY_SCRYPT_R, p: RECOVERY_SCRYPT_P,
  });
  return `scrypt$${RECOVERY_SCRYPT_N}$${RECOVERY_SCRYPT_R}$${RECOVERY_SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyRecoveryHash(normalizedCode: string, encoded: string): boolean {
  const crypto = nodeCrypto();
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = parseInt(parts[1]!, 10);
  const r = parseInt(parts[2]!, 10);
  const p = parseInt(parts[3]!, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  try {
    const salt = Buffer.from(parts[4]!, "hex");
    const expected = Buffer.from(parts[5]!, "hex");
    const actual = crypto.scryptSync(normalizedCode, salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Which stored hash (if any) a submitted code matches. Every hash is checked
 * even after a match is found, so the work done does not say where — or
 * whether — the match happened.
 */
export function recoveryCodeMatches(code: unknown, hashes: string[]): number {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return -1;
  let found = -1;
  for (let index = 0; index < hashes.length; index += 1) {
    if (verifyRecoveryHash(normalized, hashes[index]!) && found === -1) found = index;
  }
  return found;
}

// require() over import so this stays a plain function call inside the code
// paths that need node:crypto, while the module itself keeps loading in any
// runtime that can already run the pure decision functions above.
function nodeCrypto(): typeof import("crypto") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("crypto") as typeof import("crypto");
}

/**
 * Generate and store this user's recovery codes if they have none left to
 * lose — no existing set, or a set that is fully spent. Returns the plaintext
 * codes ONLY when a fresh set was just created; the caller shows them once
 * and they are never recoverable again.
 */
export async function issueRecoveryCodesIfMissing(userId: string): Promise<string[] | undefined> {
  const { getState, mutate } = await import("@/server/storage");
  const existing = Object.values(getState().users).find(user => user.id === userId);
  if (!existing) return undefined;
  if (existing.mfaRecovery && existing.mfaRecovery.codeHashes.length > 0) return undefined;

  const codes = generateRecoveryCodes();
  const codeHashes = codes.map(hashRecoveryCode);
  let stored = false;
  mutate(state => {
    const user = Object.values(state.users).find(candidate => candidate.id === userId);
    if (!user) return;
    if (user.mfaRecovery && user.mfaRecovery.codeHashes.length > 0) return;
    user.mfaRecovery = { codeHashes, generatedAt: Date.now(), usedCount: 0 };
    user.updatedAt = Date.now();
    stored = true;
  });
  // Never hand out codes that were not actually stored — a set the server
  // cannot check later is not a recovery path, it is a printout.
  return stored ? codes : undefined;
}

/**
 * Spend one recovery code. The re-check happens inside the mutation, so two
 * requests racing on the same code cannot both be told yes — `mutate` is
 * synchronous and the second one finds the hash already gone.
 */
export async function consumeRecoveryCode(
  userId: string,
  rawCode: unknown,
): Promise<{ ok: true; remaining: number } | { ok: false }> {
  const normalized = normalizeRecoveryCode(rawCode);
  if (!normalized) return { ok: false };
  const { getState, mutate } = await import("@/server/storage");

  // Cheap pre-check outside the mutation: a miss (the overwhelmingly common
  // case for an attacker) never marks state dirty or bumps a version.
  const user = Object.values(getState().users).find(candidate => candidate.id === userId);
  if (recoveryCodeMatches(normalized, user?.mfaRecovery?.codeHashes ?? []) < 0) {
    return { ok: false };
  }

  let outcome: { ok: true; remaining: number } | { ok: false } = { ok: false };
  mutate(state => {
    const target = Object.values(state.users).find(candidate => candidate.id === userId);
    const recovery = target?.mfaRecovery;
    if (!target || !recovery) return;
    const index = recoveryCodeMatches(normalized, recovery.codeHashes);
    if (index < 0) return;
    recovery.codeHashes.splice(index, 1);
    recovery.usedCount += 1;
    target.updatedAt = Date.now();
    outcome = { ok: true, remaining: recovery.codeHashes.length };
  });
  return outcome;
}

/**
 * The honest answer when two-factor cannot run at all.
 *
 * Every MFA route builds its client with `createRouteSupabaseClient`, which
 * calls `requireSupabasePublicConfig()` and THROWS when Supabase is not
 * configured. An uncaught throw in a route handler is a 500, so a deployment
 * that simply has no Supabase credentials reported "two-factor is broken"
 * rather than "two-factor is not set up here" — the browser matrix found
 * `POST /api/portal/mfa/enrol` answering 500 on every single viewport.
 *
 * A missing configuration is not a server fault. Returning `null` here means
 * "carry on"; returning a response means the caller must answer with it.
 */
export function mfaUnavailableResponse(): Response | null {
  if (getSupabasePublicConfig()) return null;
  return Response.json({
    ok: false,
    code: "mfa_unavailable",
    error: "Two-factor sign-in is not available on this deployment — it needs Supabase auth, which is not configured here.",
  }, { status: 503 });
}
