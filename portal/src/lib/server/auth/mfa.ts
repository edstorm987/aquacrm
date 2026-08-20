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

  // Aqua only ever enrols TOTP (`/api/portal/mfa/enrol`). A verified factor of
  // some other kind means protection is on that this code path cannot check —
  // so it refuses rather than waving it through.
  const totp = factors.find(factor => factor.factorType === "totp");
  if (!totp) return { status: "unavailable", message: MFA_LOGIN_UNAVAILABLE_MESSAGE };

  const code = typeof input.code === "string" ? input.code.trim().replace(/\s+/g, "") : "";
  if (!code) return { status: "code-required", message: MFA_LOGIN_CHALLENGE_MESSAGE };

  return { status: "check-code", factorId: totp.id, code };
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
