import { NextRequest, NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabase/route";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { seedFounder } from "@/lib/server/seeds/founderSeed";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import {
  clientIpFromHeaders,
  isLoginLocked,
  rateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/server/rateLimit";
import { getAgency, listAgencies } from "@/server/tenants";
import { getUserByLogin } from "@/server/users";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { getAuthBrand, matchAuthBrandAgency } from "@/lib/brands/authBrand";
import {
  MFA_LOGIN_REJECTED_MESSAGE,
  consumeRecoveryCode,
  issueRecoveryCodesIfMissing,
  loginMfaStep,
  raisedToSecondFactor,
} from "@/lib/server/auth/mfa";

interface Body {
  email?: unknown;
  username?: unknown;
  password?: unknown;
  brand?: unknown;
  // The six-digit code from an authenticator app. Optional on the wire, never
  // optional in effect: an account with a verified factor is refused a session
  // when this is missing. See `loginMfaStep`.
  code?: unknown;
}

function loginEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ed") {
    return (process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com").trim().toLowerCase();
  }
  return normalized;
}

// ─── Native form posts (published-site Login block) ───────────────────────
//
// `LoginFormBlock` renders a plain `<form method="POST">` with no JS, so a
// visitor's browser full-page-navigates here with an
// `application/x-www-form-urlencoded` body. Before this branch existed the
// JSON parser threw and the visitor landed on a raw `{"ok":false,…}` blob
// with no way back (issues.md #14).
//
// Shape copied from `api/auth/profile/update/route.ts` (content-type branch →
// `formData()` → `NextResponse.redirect(new URL(dest, req.url), 303)`) and
// `api/auth/logout/route.ts` (JSON callers keep their body untouched).
//
// Deliberate choices:
//   - JSON stays the DEFAULT branch. Only an explicitly form-encoded
//     content-type takes the redirect path, so every existing fetch caller
//     (LoginForm, ConnectFlow, `login/browser`) sees a byte-identical body.
//   - The form path re-enters the SAME handler, so the rate limiter, the
//     lockout and every credential check run first, exactly as before —
//     the branch is after them, not around them.
//   - Nothing about the attempt goes in a redirect query string. The failure
//     message rides a short-lived cookie instead, so credentials and error
//     text never reach server logs, referer headers or browser history.
//   - The failure destination is the SAME-ORIGIN referring page (the client's
//     own site), never an attacker-supplied URL and never the portal's
//     branded `/login` when the visitor came from somewhere else.

const LOGIN_ERROR_COOKIE = "aqua_login_error";
const GENERIC_LOGIN_ERROR = "We could not sign you in. Please try again.";

function isFormPost(req: NextRequest): boolean {
  const contentType = req.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

// Where a FAILED form login goes back to. Same-origin referer only; anything
// else (off-origin, unparseable, missing, or the API route itself) falls back
// to the portal's own login page. This is the open-redirect guard — no form
// field or query param can influence it.
function failureDestination(req: NextRequest): URL {
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const candidate = new URL(referer);
      if (
        candidate.origin === req.nextUrl.origin &&
        !candidate.pathname.startsWith("/api/")
      ) {
        candidate.hash = "";
        return candidate;
      }
    } catch {
      // Unparseable referer → fall through to the safe default.
    }
  }
  return new URL("/login", req.nextUrl.origin);
}

// Where a SUCCESSFUL form login goes. Only the server-resolved role-aware
// path is trusted, and only when it is a relative path.
function successDestination(req: NextRequest, resolved: unknown): URL {
  const path =
    typeof resolved === "string" && resolved.startsWith("/") && !resolved.startsWith("//")
      ? resolved
      : "/portal";
  return new URL(path, req.nextUrl.origin);
}

// Cookie value is a short, punctuation-only-safe slice of the API's own
// user-facing message. It never contains the submitted email or password.
function safeErrorMessage(raw: unknown): string {
  if (typeof raw !== "string") return GENERIC_LOGIN_ERROR;
  const cleaned = raw.replace(/[^\w .,'’!?()/-]/g, " ").trim();
  return cleaned ? cleaned.slice(0, 160) : GENERIC_LOGIN_ERROR;
}

async function handleFormLogin(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    form = new FormData();
  }
  const field = (name: string): string | undefined => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };

  // Re-enter the JSON handler so there is exactly one copy of the sign-in
  // logic (rate limit → lockout → Supabase → portal provisioning).
  const headers = new Headers({ "content-type": "application/json" });
  // A form login ends in a redirect — there is nowhere to SHOW anything.
  // The JSON handler reads this to hold back the one-time showing of fresh
  // recovery codes (generating them here would store them, never show them,
  // and lose them). Spoofing the header from a JSON caller only suppresses
  // the showing for that request — it grants nothing.
  headers.set("x-aqua-login-surface", "native-form");
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  if (realIp) headers.set("x-real-ip", realIp);
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) headers.set("cookie", cookieHeader);

  const internalRequest = new NextRequest(new URL("/api/auth/login", req.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: field("email") ?? "",
      username: field("username"),
      password: field("password") ?? "",
      brand: field("brand"),
      // Carried through so a native form post can complete the MFA step too.
      // Dropping it here would leave anybody with an authenticator unable to
      // sign in from a published site at all.
      code: field("code"),
    }),
  });

  const jsonResponse = await handleJsonLogin(internalRequest);
  const payload = (await jsonResponse.json().catch(() => ({}))) as {
    ok?: unknown;
    error?: unknown;
    redirect?: unknown;
  };
  const succeeded = jsonResponse.ok && payload.ok === true;

  const destination = succeeded
    ? successDestination(req, payload.redirect)
    : failureDestination(req);
  const response = NextResponse.redirect(destination, { status: 303 });

  // ORDER MATTERS. `response.cookies.set()` re-serialises the whole
  // set-cookie header from its own snapshot map, wiping anything appended
  // raw beforehand — so every `.set()` has to happen BEFORE the passthrough
  // appends below.
  if (succeeded) {
    response.cookies.set(LOGIN_ERROR_COOKIE, "", { path: "/", maxAge: 0 });
  } else {
    response.cookies.set(LOGIN_ERROR_COOKIE, safeErrorMessage(payload.error), {
      httpOnly: false, // the login block reads it to show the message
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60,
    });
  }

  // Carry every cookie the JSON handler set (session + brand on success,
  // Supabase's own cookie churn either way).
  for (const cookie of jsonResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export async function POST(req: NextRequest) {
  if (isFormPost(req)) return handleFormLogin(req);
  return handleJsonLogin(req);
}

async function handleJsonLogin(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `login:${ip}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const suppliedLogin =
    typeof body.email === "string"
      ? body.email
      : typeof body.username === "string"
        ? body.username
        : "";
  const email = loginEmail(suppliedLogin);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Username/email and password are required." },
      { status: 400 },
    );
  }

  const lock = isLoginLocked({ ip, email });
  if (lock.locked) {
    return NextResponse.json(
      { ok: false, error: "Too many failed attempts. Account temporarily locked." },
      { status: 429, headers: { "retry-after": String(lock.retryAfterSec) } },
    );
  }

  const { client: supabase, applyCookies } = createRouteSupabaseClient(req);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.user) {
    recordLoginFailure({ ip, email });
    return applyCookies(
      NextResponse.json({ ok: false, error: "Email or password is incorrect." }, { status: 401 }),
    );
  }

  await ensureHydrated({ fresh: true });
  const founderEmail = (process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com").toLowerCase();
  if (email === founderEmail) {
    await seedFounder();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle<{ role: "owner" | "staff" | "client" }>();

  const portalUser = getUserByLogin(email);
  if (!portalUser) {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json(
        {
          ok: false,
          error:
            profile?.role === "client"
              ? "Your account is valid but has not been attached to a client portal yet."
              : "Your account is valid but has not been provisioned in AquaCRM yet.",
        },
        { status: 403 },
      ),
    );
  }

  const expectedInternalRole = profile?.role === "owner" || profile?.role === "staff";
  if (expectedInternalRole && !portalUser.role.startsWith("agency-")) {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json({ ok: false, error: "Account access is not configured correctly." }, { status: 403 }),
    );
  }
  if (!getAgency(portalUser.agencyId)) {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json({ ok: false, error: "Account is not attached to an active workspace." }, { status: 403 }),
    );
  }

  // ─── Second factor — the gate on the app session cookie ─────────────────
  //
  // Reached only by somebody who typed the right password for a real,
  // provisioned account: every existing check runs above this line, so the
  // ordering of the errors — and what they do and do not reveal about whether
  // an account exists — is exactly as it was.
  //
  // The gate is on `issueSession` below, not on Supabase's assurance level.
  // `lk_session_v1` is what opens the portal (Supabase's session is only
  // cross-checked afterwards), so withholding *that cookie* is the whole gate.
  //
  // None of these refusals call `applyCookies`. That is deliberate: the
  // Supabase session this request just created must not reach the browser
  // half-finished. Not handing it over is stronger than signing out afterwards
  // and, unlike `signOut()`, it cannot revoke the person's sessions on their
  // other devices as a side effect of a sign-in they are still part-way
  // through.
  const step = loginMfaStep({ user: authData.user, code: body.code });

  if (step.status === "unavailable" || step.status === "code-required") {
    // `code-required` is the ordinary first half of a two-step sign-in, not a
    // failed attempt, so it must not burn the lockout counter — otherwise ten
    // honest sign-ins would lock the account. The per-IP limiter at the top of
    // this handler still counts every one of these.
    return NextResponse.json(
      { ok: false, mfaRequired: true, error: step.message },
      { status: 401 },
    );
  }

  // Fresh recovery codes, when this sign-in is the one that generates them.
  // Set only on the first TOTP-gated JSON sign-in of an enrolled account;
  // shown in that response and never recoverable again.
  let freshRecoveryCodes: string[] | undefined;

  if (step.status === "check-code" || step.status === "check-recovery") {
    // A tighter budget than the 10/min covering the handler as a whole: the
    // secret is six digits, and five guesses a minute is already generous.
    // Keyed on the pair, so one account under attack cannot lock out another.
    // Recovery attempts share the SAME budget — two kinds of code must not
    // mean twice the guesses.
    const codeLimit = rateLimit({ key: `login-mfa:${ip}|${email}`, max: 5, windowMs: 60_000 });
    if (!codeLimit.allowed) {
      return NextResponse.json(
        { ok: false, mfaRequired: true, error: "Too many codes tried. Wait a moment and use the next one." },
        { status: 429, headers: { "retry-after": String(codeLimit.retryAfterSec) } },
      );
    }
  }

  if (step.status === "check-recovery") {
    // The way back in when the authenticator is gone (phase 4). The code is
    // checked against scrypt hashes on the user record and DELETED on use —
    // single-use by absence. It never touches Supabase's MFA machinery,
    // because the whole point is that the enrolled factor is unavailable.
    const spent = await consumeRecoveryCode(portalUser.id, step.code);
    if (!spent.ok) {
      recordLoginFailure({ ip, email });
      // Same message as a wrong TOTP. Saying "that recovery code is spent"
      // would confirm it was ever real.
      return NextResponse.json(
        { ok: false, mfaRequired: true, error: MFA_LOGIN_REJECTED_MESSAGE },
        { status: 401 },
      );
    }
    logActivity({
      agencyId: portalUser.agencyId,
      clientId: portalUser.clientId,
      actorUserId: portalUser.id,
      actorEmail: portalUser.email,
      category: "auth",
      action: "user.mfa_recovery_used",
      message: `${portalUser.email} signed in with a two-factor recovery code (${spent.remaining} left).`,
    });
  }

  if (step.status === "check-code") {

    // A fresh challenge on every attempt. Holding one open across attempts is
    // what makes a spent code keep working for as long as the challenge lives.
    let verified: { access_token?: unknown } | null = null;
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: step.factorId,
    });
    if (!challengeError && challenge) {
      const { data, error } = await supabase.auth.mfa.verify({
        factorId: step.factorId,
        challengeId: challenge.id,
        code: step.code,
      });
      if (!error) verified = data as { access_token?: unknown };
    }

    // Refused unless Supabase both accepted the code and handed back a session
    // whose own `aal` claim says the assurance level actually rose. A 200 that
    // leaves the session where it was is not a second factor.
    if (!verified || !raisedToSecondFactor(verified.access_token)) {
      recordLoginFailure({ ip, email });
      // One message for wrong, expired and already-used. Saying which narrows
      // the guess for anybody working through codes.
      return NextResponse.json(
        { ok: false, mfaRequired: true, error: MFA_LOGIN_REJECTED_MESSAGE },
        { status: 401 },
      );
    }

    // Both factors have just been proven together — the strictest moment this
    // route has — so this is when the recovery codes are generated, once.
    // Not on the native-form path: that response is a redirect with nowhere
    // to show them, and codes stored but never shown are codes lost.
    if (req.headers.get("x-aqua-login-surface") !== "native-form") {
      freshRecoveryCodes = await issueRecoveryCodesIfMissing(portalUser.id);
    }
  }

  recordLoginSuccess({ ip, email });

  // ─── Which company does this sign-in land in? ───────────────────────────
  //
  // "if I login it goes to my AquaCRM but as whatever company I am coming
  // from." Each company website hands the visitor to /login?brand=<slug>, and
  // that value rides through to here.
  //
  // SECURITY: the candidate list is narrowed to THIS user's own memberships
  // BEFORE the brand is matched against it. So `brand` can only ever pick
  // between agencies the account already belongs to — it can never add one,
  // and a brand naming an agency they are not in simply falls through to their
  // primary. It is a preference, never a grant. (Same rule the switcher
  // enforces in /api/auth/switch-agency.)
  const memberAgencyIds = portalUser.agencyIds && portalUser.agencyIds.length > 0
    ? portalUser.agencyIds
    : [portalUser.agencyId];
  const requestedBrandValue =
    typeof body.brand === "string"
      ? body.brand
      : req.cookies.get("aqua_public_brand")?.value;
  const brandAgency = matchAuthBrandAgency(
    requestedBrandValue,
    listAgencies().filter(a => memberAgencyIds.includes(a.id)),
  );
  const activeAgencyId = brandAgency?.id ?? portalUser.agencyId;

  const token = issueSession({
    userId: portalUser.id,
    email: portalUser.email,
    role: portalUser.role,
    agencyId: portalUser.agencyId,
    agencyIds: memberAgencyIds,
    activeAgencyId,
    clientId: portalUser.clientId,
    sessionRev: portalUser.sessionRev ?? 0,
    // What this sign-in actually proved. `check-code` was confirmed by
    // Supabase's own aal2 token; `check-recovery` spent a stored single-use
    // code. Everything else got here on a password alone.
    aal: step.status === "not-required" ? "aal1" : "aal2",
  });
  const cookie = sessionCookie(token);
  const redirect = resolvePostLoginPath(null, portalUser);

  logActivity({
    agencyId: activeAgencyId,
    clientId: portalUser.clientId,
    actorUserId: portalUser.id,
    actorEmail: portalUser.email,
    category: "auth",
    action: "user.signed_in",
    message: `${portalUser.email} signed in through Supabase (${portalUser.role}).`,
  });

  try {
    await flushPendingWrites();
  } catch {
    await supabase.auth.signOut();
    return applyCookies(
      NextResponse.json(
        { ok: false, error: "Your workspace could not be saved. Please try signing in again." },
        { status: 503 },
      ),
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: {
      id: portalUser.id,
      email: portalUser.email,
      name: portalUser.name,
      role: portalUser.role,
      agencyId: portalUser.agencyId,
      clientId: portalUser.clientId,
    },
    mustChangePassword: false,
    redirect,
    // Present ONLY on the sign-in that generated them (see above) — the one
    // and only time the plaintext exists outside the person's own copy.
    ...(freshRecoveryCodes ? { recoveryCodes: freshRecoveryCodes } : {}),
  });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  // The public-brand cookie still resolves through the STATIC front list on
  // purpose: it paints the client-facing customer portal, whose reader
  // (`getAuthBrand`) only knows the four hand-written designs. An agency slug
  // therefore lands on the neutral AquaCRM front there, which is the existing
  // guard, not a regression.
  const publicBrand = portalUser.role.startsWith("agency-")
    ? "aquacrm"
    : getAuthBrand(requestedBrandValue).id;
  response.cookies.set("aqua_public_brand", publicBrand, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return applyCookies(response);
}
