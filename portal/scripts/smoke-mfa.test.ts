import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

import {
  MFA_LOGIN_CHALLENGE_MESSAGE,
  MFA_LOGIN_REJECTED_MESSAGE,
  MFA_LOGIN_UNAVAILABLE_MESSAGE,
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes, hashRecoveryCode, hasVerifiedFactor, loginMfaStep,
  normalizeRecoveryCode, raisedToSecondFactor, readAssurance,
  readTokenAssurance, recoveryCodeMatches, requireTwoFactor, verifiedFactors,
} from "../src/lib/server/auth/mfa.ts";

// Memory backend before anything touches the state layer, exactly as
// `smoke-auth-form-encoding.test.ts` does — the login route hydrates storage
// and these tests must never reach `.data/portal-state.json`.
process.env.PORTAL_BACKEND ??= "memory";

import { POST } from "../src/app/api/auth/login/route";
import { GET as mfaStatus } from "../src/app/api/portal/mfa/enrol/route";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser, getUserByLogin } from "../src/server/users";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { isLoginLocked, recordLoginFailure } from "../src/lib/server/rateLimit";

describe("deciding whether a session is strongly authenticated", () => {
  it("allows a session that has satisfied two factors", () => {
    assert.equal(requireTwoFactor({ current: "aal2", next: "aal2" }).status, "satisfied");
  });

  it("challenges somebody enrolled but not yet asked on this session", () => {
    // The distinction that is easy to get wrong: enrolment is not
    // authentication. Treating "has 2FA switched on" as "is strongly
    // authenticated right now" lets a stolen session skip the very check it
    // appears to have.
    const result = requireTwoFactor({ current: "aal1", next: "aal2" });
    assert.equal(result.status, "challenge-required");
    assert.match(result.status === "challenge-required" ? result.message : "", /authenticator/i);
  });

  it("asks somebody with no factor to enrol", () => {
    const result = requireTwoFactor({ current: "aal1", next: "aal1" });
    assert.equal(result.status, "enrolment-required");
  });

  it("explains what it protects rather than only refusing", () => {
    // "Two-factor required" leaves somebody hunting for a setting.
    const result = requireTwoFactor({ current: "aal1", next: "aal1" });
    const message = result.status === "enrolment-required" ? result.message : "";
    assert.match(message, /protects everything else/i);
  });
});

describe("reading what Supabase returned", () => {
  it("reads the levels", () => {
    assert.deepEqual(readAssurance({ currentLevel: "aal2", nextLevel: "aal2" }), { current: "aal2", next: "aal2" });
  });

  it("fails closed on anything it cannot read", () => {
    // Silence must not be taken to mean fine — an unreadable response yields
    // no assurance, so the caller refuses.
    for (const bad of [null, undefined, {}, { currentLevel: "aal3" }, "nonsense"]) {
      const state = readAssurance(bad);
      assert.equal(state.current, null, `read assurance from ${JSON.stringify(bad)}`);
      assert.equal(requireTwoFactor(state).status, "enrolment-required");
    }
  });
});

describe("knowing whether a factor exists", () => {
  it("counts only verified factors", () => {
    // An enrolment somebody started and abandoned is not protection.
    assert.equal(hasVerifiedFactor([{ status: "unverified" }]), false);
    assert.equal(hasVerifiedFactor([{ status: "verified" }]), true);
    assert.equal(hasVerifiedFactor([]), false);
    assert.equal(hasVerifiedFactor(null), false);
  });
});

describe("where two factors are actually enforced", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8");

  // The connect flow's gate moved from Supabase TOTP to an emailed code
  // (18 Aug 2026). The requirement did not change — nothing may be bound to
  // somebody's name unproven — so these pin the same contract on the new gate.
  // `requireTwoFactor` stays the intended long-term mechanism; see
  // `connectionConfirmation.ts` for what has to happen before it returns.
  it("gates the connection consent, before the connection is touched", () => {
    // This is the moment external software gains the ability to sign somebody
    // in without asking again.
    const route = read("src", "app", "api", "portal", "connections", "accept", "route.ts");
    const gateAt = route.indexOf("checkConfirmationCode({");
    const acceptAt = route.indexOf("acceptPortalConnection({");
    assert.ok(gateAt > 0, "consent is not gated at all");
    assert.ok(gateAt < acceptAt, "the connection is written before the check");
  });

  it("confirms nothing unless the answer is explicitly yes", () => {
    // Every outcome that is not "confirmed" must refuse. An unreadable or
    // unavailable check must never read as consent.
    const route = read("src", "app", "api", "portal", "connections", "accept", "route.ts");
    assert.match(route, /confirmation\.status !== "confirmed"/);
  });

  it("cannot be bypassed anywhere real data lives", () => {
    // The stand-in code is gated on dev mode, which requires a file or memory
    // backend — so it physically cannot confirm against a durable one. Real
    // (non-dev) confirmation goes through a stored, hashed, emailed code.
    const route = read("src", "app", "api", "portal", "connections", "accept", "route.ts");
    assert.match(route, /bypassEnabled: isDevModeEnabled\(\)/);
    const rules = read("src", "lib", "server", "connectionConfirmation.ts");
    // The stand-in only ever confirms behind the dev-mode gate; with the bypass
    // off it is just another wrong string, never a pass.
    assert.match(rules, /input\.bypassEnabled && code === DEV_CONFIRMATION_CODE/);
    // And a real code is checked in constant time against a stored hash.
    assert.match(rules, /crypto\.timingSafeEqual/);
  });

  it("tells the page which step is needed rather than only refusing", () => {
    // A code is a prompt away; an unavailable check is not. One message for
    // both would send somebody to the wrong place.
    const route = read("src", "app", "api", "portal", "connections", "accept", "route.ts");
    assert.match(route, /confirmation: confirmation\.status/);
  });

  it("never stores a copy of the TOTP secret", () => {
    // A second place to steal it from, for no benefit.
    const enrol = read("src", "app", "api", "portal", "mfa", "enrol", "route.ts");
    assert.doesNotMatch(enrol, /mutate\(|state\.|save[A-Z]/);
  });

  it("clears an abandoned enrolment so a second attempt works", () => {
    const enrol = read("src", "app", "api", "portal", "mfa", "enrol", "route.ts");
    assert.match(enrol, /factor\.status !== "verified"/);
    assert.match(enrol, /unenroll/);
  });

  it("does not say whether a code was wrong or merely expired", () => {
    // Telling somebody which narrows the guess for anybody trying codes.
    const verify = read("src", "app", "api", "portal", "mfa", "verify", "route.ts");
    assert.match(verify, /That code was not right/);
    assert.doesNotMatch(verify, /expired.*try again|code expired/i);
  });
});

describe("what the person actually sees", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8");
  const setup = () => read("src", "components", "auth", "TwoFactorSetup.tsx");
  // The consent screen and the welcome screen became one component on
  // 18 Aug 2026 — it is one continuous act, and splitting it across page loads
  // made it feel like four unrelated errands.
  const consent = () => read("src", "app", "connect", "[connectionId]", "_ConnectFlow.tsx");

  it("only ever moves forward through the steps", () => {
    // Somebody mid-way through one job must not be dropped back to the start;
    // re-showing a screen they finished reads as it not having worked.
    const source = consent();
    assert.match(source, /type Step = "welcome" \| "code" \| "working" \| "done"/);
    assert.match(source, /setStep\("code"\)/);
  });

  it("says what signing in commits them to, before they do it", () => {
    // Consent has to be informed at the moment it is given, not explained
    // afterwards.
    const source = consent();
    const signInBlock = source.slice(source.indexOf('title={`Welcome'));
    assert.match(signInBlock, /never receives your password/);
    assert.match(signInBlock, /disconnect at any time/);
  });

  it("says where the code went, so it can be found", () => {
    // Names the address the server actually sent to (`sentTo`), which holds
    // even after signing in on the welcome screen, where the `email` prop the
    // page could pass is not yet known.
    assert.match(consent(), /We have sent a code to/);
    assert.match(consent(), /\{sentTo\}/);
  });

  it("asks the server to email a code when the code screen opens", () => {
    // Without this the confirm step would check a code that was never sent.
    assert.match(consent(), /\/api\/portal\/connections\/request-code/);
    assert.match(consent(), /requestCode\(/);
  });

  it("offers a resend rather than sending somebody back to the start", () => {
    // A code can be missed, land in spam, or lapse — resend is the one way
    // forward that keeps them on the same screen.
    assert.match(consent(), /Send it again/);
    assert.match(consent(), /requestCode\(\{ resend: true \}\)/);
  });

  it("counts the code down and says plainly when it has expired", () => {
    // The code lives fifteen minutes; a silent clock leaves somebody typing into
    // one that already lapsed.
    const source = consent();
    assert.match(source, /expires in/);
    assert.match(source, /formatCountdown/);
    assert.match(source, /has expired/);
  });

  it("stops accepting a spent code and makes a fresh one the next move", () => {
    // Once expired or locked, another guess cannot work — the button that can is
    // the resend, so Confirm is disabled and the resend becomes the main action.
    const source = consent();
    assert.match(source, /needsFreshCode/);
    assert.match(source, /disabled=\{busy \|\| !code\.trim\(\) \|\| needsFreshCode\}/);
    assert.match(source, /Send me a new code/);
  });

  it("reads why a confirm failed, so it can point at the right next step", () => {
    // A wrong code is a retry; an expired or locked one wants a fresh code, not
    // another guess.
    const source = consent();
    assert.match(source, /setLastOutcome\(result\.confirmation/);
    assert.match(source, /result\.confirmation === "expired" \|\| result\.confirmation === "locked"/);
  });

  it("does not claim the connection is made before the server says so", () => {
    // The loader runs on a timer because one round trip has no intermediate
    // events. The final stage must still wait for the answer.
    const source = consent();
    assert.match(source, /if \(next === STAGES\.length && !doneRef\.current\) return current;/);
  });

  it("shows the stand-in code only when the server says dev mode is on", () => {
    // The component must not decide this for itself — it cannot know. Pinned
    // as the rule rather than one spelling of it: the page reads dev mode on
    // the server and passes the code down only then.
    assert.match(consent(), /devCode \?/);
    const page = read("src", "app", "connect", "[connectionId]", "page.tsx");
    assert.match(page, /isDevModeEnabled\(\)/, "the page never asks whether dev mode is on");
    assert.match(page, /devCode=\{[^}]*DEV_CONFIRMATION_CODE : undefined\}/s);
    // And never unconditionally.
    assert.doesNotMatch(page, /devCode=\{DEV_CONFIRMATION_CODE\}/);
  });

  it("offers the setup key for anybody who cannot scan a QR code", () => {
    // A desktop authenticator cannot scan the screen it is displayed on.
    assert.match(setup(), /Can’t scan it\?/);
    assert.match(setup(), /factor\.secret/);
  });

  it("accepts only six digits, and pastes a one-time code", () => {
    assert.match(setup(), /replace\(\/\\D\/g, ""\)\.slice\(0, 6\)/);
    assert.match(setup(), /autoComplete="one-time-code"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The login gate itself
// ═══════════════════════════════════════════════════════════════════════════
//
// Everything above this line tests decisions in isolation. What follows drives
// the REAL exported POST handler of `/api/auth/login` in-process, against a
// stub Supabase, because the thing that has to be true is not a shape in a
// source file — it is that **no `lk_session_v1` cookie comes back** when the
// second factor has not been produced.
//
// Before this section existed, every one of these passed a password and got a
// session: `mfa.ts` knew when aal2 was needed and the login route never asked.

describe("deciding what login must do next", () => {
  const withFactor = { factors: [{ id: "factor-1", factor_type: "totp", status: "verified" }] };

  it("asks for nothing when there is no factor", () => {
    assert.equal(loginMfaStep({ user: {}, code: undefined }).status, "not-required");
    assert.equal(loginMfaStep({ user: { factors: [] }, code: undefined }).status, "not-required");
    assert.equal(loginMfaStep({ user: null, code: undefined }).status, "not-required");
  });

  it("ignores an enrolment that was never finished", () => {
    // An abandoned enrolment is not protection, and demanding a code for it
    // would lock somebody out behind an app that generates nothing.
    const step = loginMfaStep({
      user: { factors: [{ id: "f", factor_type: "totp", status: "unverified" }] },
      code: undefined,
    });
    assert.equal(step.status, "not-required");
  });

  it("cannot be skipped by leaving the code out", () => {
    // THE property. An MFA step that a missing parameter switches off is worse
    // than no MFA, because it looks like protection.
    for (const code of [undefined, null, "", "   ", "\t\n ", 123456, {}, [], true, NaN]) {
      const step = loginMfaStep({ user: withFactor, code });
      assert.equal(
        step.status,
        "code-required",
        `code ${JSON.stringify(code)} must not satisfy the gate`,
      );
    }
  });

  it("checks a real code against the enrolled factor", () => {
    const step = loginMfaStep({ user: withFactor, code: " 123 456 " });
    assert.equal(step.status, "check-code");
    assert.equal(step.status === "check-code" ? step.factorId : "", "factor-1");
    // Spaces are how authenticator apps display a code; they are not part of it.
    assert.equal(step.status === "check-code" ? step.code : "", "123456");
  });

  it("routes anything that does not read as six digits to the recovery check", () => {
    // A recovery code can only ever be checked against stored hashes, so a
    // typo costs one rejected attempt — it can never skip the step.
    const step = loginMfaStep({ user: withFactor, code: " abcde-fghij " });
    assert.equal(step.status, "check-recovery");
    assert.equal(step.status === "check-recovery" ? step.code : "", "ABCDEFGHIJ");
    // Too short for a TOTP is still a recovery attempt, never a pass.
    assert.equal(loginMfaStep({ user: withFactor, code: "12345" }).status, "check-recovery");
  });

  it("still reads a dashed six-digit code as a TOTP", () => {
    const step = loginMfaStep({ user: withFactor, code: "123-456" });
    assert.equal(step.status, "check-code");
    assert.equal(step.status === "check-code" ? step.code : "", "123456");
  });

  it("lets a recovery code past a factor the login cannot challenge", () => {
    // The `unavailable` refusal exists so an uncheckable factor is never waved
    // through — but the recovery code must still work there, or that account
    // has no way back in at all.
    const step = loginMfaStep({
      user: { factors: [{ id: "p1", factor_type: "phone", status: "verified" }] },
      code: "ABCDE-FGHIJ",
    });
    assert.equal(step.status, "check-recovery");
  });

  it("refuses rather than waves through a factor it cannot challenge", () => {
    // A verified factor of a kind this path cannot check still means protection
    // is switched on. Skipping it would silently turn 2FA off for that account.
    const step = loginMfaStep({
      user: { factors: [{ id: "p1", factor_type: "phone", status: "verified" }] },
      code: undefined,
    });
    assert.equal(step.status, "unavailable");
    assert.equal(step.status === "unavailable" ? step.message : "", MFA_LOGIN_UNAVAILABLE_MESSAGE);
  });

  it("reads only well-formed verified factors", () => {
    assert.deepEqual(
      verifiedFactors({
        factors: [
          { id: "a", factor_type: "totp", status: "verified" },
          { id: "", factor_type: "totp", status: "verified" },
          { factor_type: "totp", status: "verified" },
          { id: "b", factor_type: "totp", status: "unverified" },
        ],
      }),
      [{ id: "a", factorType: "totp" }],
    );
    assert.deepEqual(verifiedFactors({ factors: "not an array" as never }), []);
  });
});

describe("reading the assurance a token claims", () => {
  const jwt = (claims: Record<string, unknown>) =>
    `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.`
    + `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.stub-signature`;

  it("reads the aal claim", () => {
    assert.equal(readTokenAssurance(jwt({ aal: "aal2" })), "aal2");
    assert.equal(readTokenAssurance(jwt({ aal: "aal1" })), "aal1");
    assert.equal(readTokenAssurance(jwt({ sub: "x" })), "unstated");
  });

  it("reads nothing out of something that is not a token", () => {
    for (const bad of ["", "not-a-jwt", "a.b", "a.b.c", null, undefined, 42, {}]) {
      assert.equal(readTokenAssurance(bad), null, `read ${JSON.stringify(bad)}`);
    }
  });

  it("treats a verify that did not raise the session as a failure", () => {
    // A 200 that leaves the assurance level where it was is not a second
    // factor. It is a 200.
    assert.equal(raisedToSecondFactor(jwt({ aal: "aal2" })), true);
    assert.equal(raisedToSecondFactor(jwt({ aal: "aal1" })), false);
    assert.equal(raisedToSecondFactor("nonsense"), false);
    assert.equal(raisedToSecondFactor(undefined), false);
    // A token that states no level at all is not a contradiction — the verify
    // call itself already succeeded — so it is allowed through.
    assert.equal(raisedToSecondFactor(jwt({ sub: "x" })), true);
  });
});

// ─── stub Supabase ────────────────────────────────────────────────────────
// Shape borrowed from `smoke-auth-form-encoding.test.ts`; extended with the
// three MFA endpoints the gate touches.

const ORIGIN = "http://localhost:3031";
const LOGIN_URL = `${ORIGIN}/api/auth/login`;
const PASSWORD = "Sup3rSecret!pw";
const GOOD_CODE = "123456";
const GUARDED_EMAIL = "mfa.guarded@p2-smoke.test";
const PLAIN_EMAIL = "mfa.plain@p2-smoke.test";
// Enrolled accounts that start with NO recovery codes — one for the recovery
// loop itself, one to prove a native form post does not burn the one showing.
const RECOVERY_EMAIL = "mfa.recovery@p2-smoke.test";
const FORM_FIRST_EMAIL = "mfa.formfirst@p2-smoke.test";
const FACTOR_ID = "factor-totp-1";
const ENROLLED_EMAILS = new Set([GUARDED_EMAIL, RECOVERY_EMAIL, FORM_FIRST_EMAIL]);

function jwtWith(aal: string): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.`
    + `${part({ sub: "sb-user", aal, exp: Math.floor(Date.now() / 1000) + 3600 })}.stub-signature`;
}

let sbServer: Server | undefined;
let sbCalls: string[] = [];
/** What the verify endpoint hands back on success. */
let verifyAal = "aal2";
/** Codes already spent — a second use is refused, the way a real TOTP is. */
let spentCodes = new Set<string>();
/** Whether the guarded account's factor is finished or half-set-up. */
let factorStatus = "verified";

function resetStub() {
  sbCalls = [];
  verifyAal = "aal2";
  spentCodes = new Set<string>();
  factorStatus = "verified";
}

function factorsFor(email: string) {
  return ENROLLED_EMAILS.has(email)
    ? [{ id: FACTOR_ID, friendly_name: "Aqua", factor_type: "totp", status: factorStatus,
        created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString() }]
    : [];
}

function stubUser(email: string) {
  return {
    id: `sb_${email}`,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
    factors: factorsFor(email),
  };
}

async function startStubSupabase(): Promise<string> {
  sbServer = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    sbCalls.push(`${req.method} ${path}`);
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const json = (): Record<string, unknown> => {
        try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
      };
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      if (path.startsWith("/auth/v1/token")) {
        const body = json();
        if (body.password !== PASSWORD) {
          return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        }
        const email = String(body.email ?? "");
        return send(200, {
          access_token: jwtWith("aal1"),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "stub-refresh-token",
          user: stubUser(email),
        });
      }

      if (/\/auth\/v1\/factors\/[^/]+\/challenge$/.test(path)) {
        return send(200, {
          id: `challenge-${sbCalls.length}`,
          type: "totp",
          expires_at: Math.floor(Date.now() / 1000) + 300,
        });
      }

      if (/\/auth\/v1\/factors\/[^/]+\/verify$/.test(path)) {
        const body = json();
        const code = String(body.code ?? "");
        if (code !== GOOD_CODE || spentCodes.has(code)) {
          return send(400, { error: "invalid_code", error_description: "Invalid TOTP code entered" });
        }
        spentCodes.add(code);
        return send(200, {
          access_token: jwtWith(verifyAal),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "stub-refresh-token-2",
          user: stubUser(GUARDED_EMAIL),
        });
      }

      if (req.method === "GET" && path === "/auth/v1/user") {
        // GoTrue returns the user object at the top level.
        return send(200, stubUser(GUARDED_EMAIL));
      }

      if (path.startsWith("/rest/v1/profiles")) return send(200, []);
      return send(200, {});
    });
  });
  await new Promise<void>(resolve => sbServer!.listen(0, "127.0.0.1", resolve));
  const address = sbServer.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

// ─── driving the route ────────────────────────────────────────────────────

function loginRequest(body: unknown, ip: string): NextRequest {
  return new NextRequest(LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function sessionCookieOf(res: Response): string | undefined {
  return res.headers.getSetCookie().find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}

/** The `aal` claim inside the minted app session cookie, or undefined. */
function sessionAalOf(res: Response): unknown {
  const cookie = sessionCookieOf(res);
  if (!cookie) return undefined;
  const token = decodeURIComponent(cookie.split(";")[0]!.slice(`${SESSION_COOKIE_NAME}=`.length));
  const payload = JSON.parse(
    Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"),
  ) as { aal?: unknown };
  return payload.aal;
}

let savedEnv: Record<string, string | undefined> = {};
let stubReachable = false;

before(async () => {
  savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  const base = await startStubSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = base;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

  await ensureHydrated();
  const agency = createAgency({ name: "MFA Gate Co", ownerEmail: "owner@p2-smoke.test" });
  for (const email of [GUARDED_EMAIL, PLAIN_EMAIL, RECOVERY_EMAIL, FORM_FIRST_EMAIL]) {
    createUser({ email, password: PASSWORD, name: "MFA Tester", role: "agency-owner", agencyId: agency.id });
  }

  const probe = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: GUARDED_EMAIL, password: PASSWORD }),
  });
  stubReachable = probe.ok;
  resetStub();
});

after(() => {
  if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.key;
  sbServer?.close();
});

describe("a password alone cannot open the portal", () => {
  it("withholds the session cookie from an account with an authenticator", async () => {
    // The whole plan in one assertion. `lk_session_v1` is what opens the
    // portal — Supabase's session is only cross-checked afterwards — so this
    // cookie's absence IS the gate.
    assert.equal(stubReachable, true, "the stub must be reachable or this proves nothing");
    resetStub();
    const res = await POST(loginRequest({ email: GUARDED_EMAIL, password: PASSWORD }, "10.9.0.1"));
    assert.equal(res.status, 401);
    assert.equal(sessionCookieOf(res), undefined, "a password alone must not mint a session");
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body.ok, false);
    assert.equal(body.mfaRequired, true, "the caller has to be told which step is missing");
    assert.equal(body.error, MFA_LOGIN_CHALLENGE_MESSAGE);
    assert.ok(
      !sbCalls.some(call => call.includes("/verify")),
      "nothing should have been verified — no code was sent",
    );
  });

  it("cannot be skipped by omitting, blanking or mistyping the code field", async () => {
    // The negative path, driven through the real handler rather than the pure
    // decision: every one of these is a request an attacker can actually send.
    const shapes: unknown[] = [
      { email: GUARDED_EMAIL, password: PASSWORD },
      { email: GUARDED_EMAIL, password: PASSWORD, code: "" },
      { email: GUARDED_EMAIL, password: PASSWORD, code: "   " },
      { email: GUARDED_EMAIL, password: PASSWORD, code: null },
      { email: GUARDED_EMAIL, password: PASSWORD, code: 123456 },
      { email: GUARDED_EMAIL, password: PASSWORD, code: true },
      { email: GUARDED_EMAIL, password: PASSWORD, code: ["123456"] },
      { email: GUARDED_EMAIL, password: PASSWORD, code: { code: "123456" } },
    ];
    let ip = 10;
    for (const shape of shapes) {
      resetStub();
      const res = await POST(loginRequest(shape, `10.9.1.${ip++}`));
      assert.equal(res.status, 401, `${JSON.stringify(shape)} must not sign in`);
      assert.equal(
        sessionCookieOf(res),
        undefined,
        `${JSON.stringify(shape)} produced a session cookie`,
      );
    }
  });

  it("mints the session once the right code is produced", async () => {
    resetStub();
    const res = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.2.1"),
    );
    assert.equal(res.status, 200);
    assert.ok(sessionCookieOf(res), "the code was right — the session must be issued");
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body.ok, true);
    // The success body is a portal-wide contract (see
    // `smoke-auth-form-encoding.test.ts`, which pins the password-only shape
    // untouched). The ONE key the gate may add is `recoveryCodes`, and only on
    // the sign-in that generated them — this is that sign-in for this account.
    assert.deepEqual(
      Object.keys(body).sort(),
      ["mustChangePassword", "ok", "recoveryCodes", "redirect", "user"],
    );
    // And the cookie itself must say a second factor was proven.
    assert.equal(sessionAalOf(res), "aal2", "a TOTP-gated sign-in is aal2");

    const challenge = sbCalls.findIndex(call => call.includes("/challenge"));
    const verify = sbCalls.findIndex(call => call.includes("/verify"));
    assert.ok(challenge >= 0 && verify > challenge, "a fresh challenge must precede every verify");
  });

  it("refuses a wrong code, and says no more than that it was wrong", async () => {
    resetStub();
    const res = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: "000000" }, "10.9.3.1"),
    );
    assert.equal(res.status, 401);
    assert.equal(sessionCookieOf(res), undefined);
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body.error, MFA_LOGIN_REJECTED_MESSAGE);
    // Same wording for wrong, expired and spent. Saying which narrows the guess.
    assert.doesNotMatch(String(body.error), /expired|already used|spent/i);
  });

  it("refuses a code that has already been spent", async () => {
    resetStub();
    const first = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.4.1"),
    );
    assert.equal(first.status, 200);
    // A real TOTP stays numerically valid for the rest of its window; what
    // stops a replay is the server refusing a code it has already honoured.
    // The route must ask again every time rather than remember a pass.
    const replay = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.4.2"),
    );
    assert.equal(replay.status, 401);
    assert.equal(sessionCookieOf(replay), undefined);
  });

  it("refuses when the verify succeeded but the session was never raised", async () => {
    // Defence in depth: Aqua's cookie is withheld unless Supabase's own token
    // says the assurance level actually moved to aal2.
    resetStub();
    verifyAal = "aal1";
    const res = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.5.1"),
    );
    assert.equal(res.status, 401);
    assert.equal(sessionCookieOf(res), undefined);
    assert.ok(sbCalls.some(call => call.includes("/verify")), "the verify did happen");
    resetStub();
  });

  it("leaves an account with no authenticator exactly as it was", async () => {
    // The gate must be invisible to everybody who has not switched 2FA on —
    // and must not cost them a round trip to Supabase either.
    resetStub();
    const res = await POST(loginRequest({ email: PLAIN_EMAIL, password: PASSWORD }, "10.9.6.1"));
    assert.equal(res.status, 200);
    assert.ok(sessionCookieOf(res), "an account without a factor signs in on a password");
    assert.ok(
      !sbCalls.some(call => call.includes("/challenge") || call.includes("/verify")),
      "no factor means no MFA round trip at all",
    );
  });
});

describe("what the gate is careful not to give away or weaken", () => {
  it("still refuses a bad password with the same message it always did", async () => {
    // The gate sits after every existing check, so nothing about which errors
    // appear in which order has moved. A wrong password must never reveal that
    // the account exists, has 2FA, or is provisioned.
    resetStub();
    const res = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: "wrong", code: GOOD_CODE }, "10.9.7.1"),
    );
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: "Email or password is incorrect." });
  });

  it("says the same thing for an account that does not exist", async () => {
    resetStub();
    const res = await POST(loginRequest({ email: "nobody@p2-smoke.test", password: "wrong" }, "10.9.7.2"));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: "Email or password is incorrect." });
  });

  it("counts a wrong code towards the lockout", async () => {
    // Pre-loaded to one short of the threshold so a single request proves the
    // route records the failure — otherwise a code could be guessed forever
    // under whatever budget the per-minute limiter allows.
    const ip = "10.9.8.1";
    for (let i = 0; i < 9; i += 1) recordLoginFailure({ ip, email: GUARDED_EMAIL });
    assert.equal(isLoginLocked({ ip, email: GUARDED_EMAIL }).locked, false);
    resetStub();
    const res = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: "000000" }, ip),
    );
    assert.equal(res.status, 401);
    assert.equal(isLoginLocked({ ip, email: GUARDED_EMAIL }).locked, true, "the lockout must engage");
  });

  it("does not count the code prompt itself as a failed attempt", async () => {
    // Asking for the code is the ordinary first half of a two-step sign-in.
    // Burning the counter here would lock an honest person out after ten
    // perfectly normal sign-ins.
    const ip = "10.9.8.2";
    for (let i = 0; i < 9; i += 1) recordLoginFailure({ ip, email: GUARDED_EMAIL });
    resetStub();
    const res = await POST(loginRequest({ email: GUARDED_EMAIL, password: PASSWORD }, ip));
    assert.equal(res.status, 401);
    assert.equal(isLoginLocked({ ip, email: GUARDED_EMAIL }).locked, false);
  });

  it("caps code guesses tighter than the handler's own limiter, before Supabase is touched", async () => {
    const ip = "10.9.9.1";
    resetStub();
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(loginRequest({ email: PLAIN_EMAIL, password: PASSWORD, code: "000000" }, ip));
      assert.equal(res.status, 200, "the plain account has no factor — these are ordinary sign-ins");
    }
    // Same budget, on the account that actually has a factor.
    const guardedIp = "10.9.9.2";
    resetStub();
    let lastStatus = 0;
    let verifies = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await POST(
        loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: "000000" }, guardedIp),
      );
      lastStatus = res.status;
      verifies = sbCalls.filter(call => call.includes("/verify")).length;
      if (res.status === 429) break;
    }
    assert.equal(lastStatus, 429, "a sixth code in a minute must be refused");
    assert.equal(verifies, 5, "the limiter must refuse before Supabase is asked again");
  });

  it("never puts a code, or the reason a code failed, into a URL", async () => {
    // A native form post redirects. Anything in that Location lands in server
    // logs, referer headers and browser history.
    const res = await POST(
      new NextRequest(LOGIN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "10.9.10.1",
          referer: `${ORIGIN}/sites/acme/login`,
        },
        body: new URLSearchParams({ email: GUARDED_EMAIL, password: PASSWORD, code: "000000" }).toString(),
      }),
    );
    assert.equal(res.status, 303);
    const location = res.headers.get("location") ?? "";
    assert.doesNotMatch(location, /000000|code=|password|mfa/i);
    assert.equal(new URL(location).search, "", "nothing about the attempt belongs in a query string");
    assert.equal(sessionCookieOf(res), undefined, "a wrong code must not sign a form visitor in");
  });

  it("lets a native form post complete the second step too", async () => {
    // Dropping the field on the form path would leave anybody with an
    // authenticator unable to sign in from a published site at all.
    resetStub();
    const res = await POST(
      new NextRequest(LOGIN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "10.9.11.1",
          referer: `${ORIGIN}/sites/acme/login`,
        },
        body: new URLSearchParams({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }).toString(),
      }),
    );
    assert.equal(res.status, 303);
    assert.ok(sessionCookieOf(res), "the right code must sign a form visitor in");
  });
});

describe("recovery codes — the way back in when the authenticator is gone", () => {
  // Shared across this describe on purpose: the codes are shown exactly once,
  // so the later tests can only hold what the first sign-in handed out —
  // exactly the position a real person is in.
  let savedCodes: string[] = [];

  it("hands out ten codes on the first two-factor sign-in, hashed at rest, shown once", async () => {
    assert.equal(stubReachable, true, "the stub must be reachable or this proves nothing");
    resetStub();
    const first = await POST(
      loginRequest({ email: RECOVERY_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.20.1"),
    );
    assert.equal(first.status, 200);
    const body = await first.json() as { recoveryCodes?: unknown };
    assert.ok(Array.isArray(body.recoveryCodes), "the first gated sign-in must hand the codes out");
    savedCodes = body.recoveryCodes as string[];
    assert.equal(savedCodes.length, RECOVERY_CODE_COUNT);
    for (const code of savedCodes) {
      assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/, `${code} is not a readable recovery code`);
    }
    assert.equal(new Set(savedCodes).size, savedCodes.length, "codes must not repeat");

    // At rest: hashes only. A plaintext copy in state is a second place to
    // steal the account from, which is the opposite of a recovery path.
    const stored = getUserByLogin(RECOVERY_EMAIL)?.mfaRecovery;
    assert.ok(stored, "the hashes must be stored, or the codes can never be checked");
    assert.equal(stored!.codeHashes.length, RECOVERY_CODE_COUNT);
    for (const hash of stored!.codeHashes) {
      assert.match(hash, /^scrypt\$/, "stored form must be an scrypt hash");
      for (const code of savedCodes) {
        assert.ok(!hash.includes(code.replace("-", "")), "no plaintext code may appear in state");
      }
    }

    // Shown once. The second sign-in gets the session and nothing else.
    resetStub();
    const second = await POST(
      loginRequest({ email: RECOVERY_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.20.2"),
    );
    assert.equal(second.status, 200);
    const secondBody = await second.json() as Record<string, unknown>;
    assert.ok(!("recoveryCodes" in secondBody), "the codes are shown exactly once");
  });

  it("signs in with password + one recovery code, and spends it", async () => {
    resetStub();
    const res = await POST(
      loginRequest({ email: RECOVERY_EMAIL, password: PASSWORD, code: savedCodes[0]! }, "10.9.21.1"),
    );
    assert.equal(res.status, 200);
    assert.ok(sessionCookieOf(res), "a recovery code is the second factor — the session must mint");
    // It counts as a proven second factor on the session it minted…
    assert.equal(sessionAalOf(res), "aal2", "a recovery sign-in proved two factors");
    // …and it never touches the authenticator machinery to do it.
    assert.ok(
      !sbCalls.some(call => call.includes("/challenge") || call.includes("/verify")),
      "recovery must not depend on the authenticator that was lost",
    );

    const remaining = getUserByLogin(RECOVERY_EMAIL)?.mfaRecovery;
    assert.equal(remaining?.codeHashes.length, RECOVERY_CODE_COUNT - 1, "the spent code's hash is deleted");
    assert.equal(remaining?.usedCount, 1);

    // Single-use means single-use: the same code again is just a wrong code.
    const replay = await POST(
      loginRequest({ email: RECOVERY_EMAIL, password: PASSWORD, code: savedCodes[0]! }, "10.9.21.2"),
    );
    assert.equal(replay.status, 401);
    assert.equal(sessionCookieOf(replay), undefined, "a spent recovery code must never sign in again");
    assert.equal(((await replay.json()) as { error?: unknown }).error, MFA_LOGIN_REJECTED_MESSAGE);
  });

  it("counts a wrong recovery code towards the lockout, like any wrong code", async () => {
    const ip = "10.9.22.1";
    for (let i = 0; i < 9; i += 1) recordLoginFailure({ ip, email: RECOVERY_EMAIL });
    assert.equal(isLoginLocked({ ip, email: RECOVERY_EMAIL }).locked, false);
    resetStub();
    const res = await POST(
      loginRequest({ email: RECOVERY_EMAIL, password: PASSWORD, code: "WRONG-WRONG" }, ip),
    );
    assert.equal(res.status, 401);
    assert.equal(sessionCookieOf(res), undefined);
    assert.equal(isLoginLocked({ ip, email: RECOVERY_EMAIL }).locked, true, "the lockout must engage");
  });

  it("does not burn the one showing on a native form post", async () => {
    // A published-site form login redirects — there is nowhere to show the
    // codes. If that sign-in generated them anyway they would be stored,
    // never seen, and gone. So the form path must not trigger generation;
    // the next JSON sign-in, which CAN show them, does.
    resetStub();
    const formRes = await POST(
      new NextRequest(LOGIN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "10.9.23.1",
          referer: `${ORIGIN}/sites/acme/login`,
        },
        body: new URLSearchParams({
          email: FORM_FIRST_EMAIL, password: PASSWORD, code: GOOD_CODE,
        }).toString(),
      }),
    );
    assert.equal(formRes.status, 303);
    assert.ok(sessionCookieOf(formRes), "the form sign-in itself must still work");
    assert.equal(
      getUserByLogin(FORM_FIRST_EMAIL)?.mfaRecovery,
      undefined,
      "a sign-in that cannot show the codes must not generate them",
    );

    resetStub();
    const jsonRes = await POST(
      loginRequest({ email: FORM_FIRST_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.23.2"),
    );
    assert.equal(jsonRes.status, 200);
    const body = await jsonRes.json() as { recoveryCodes?: unknown };
    assert.ok(
      Array.isArray(body.recoveryCodes),
      "the first sign-in that can show the codes hands them out",
    );
  });

  it("stamps password-only sign-ins as one factor, not two", async () => {
    resetStub();
    const res = await POST(loginRequest({ email: PLAIN_EMAIL, password: PASSWORD }, "10.9.24.1"));
    assert.equal(res.status, 200);
    assert.equal(sessionAalOf(res), "aal1", "no second factor was proven here");
  });

  it("generates, normalizes and matches codes honestly (the pure pieces)", () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, RECOVERY_CODE_COUNT);
    // Typed the way people type: any case, dashes and spaces optional.
    assert.equal(normalizeRecoveryCode(` ${codes[0]!.toLowerCase()} `), codes[0]!.replace("-", ""));
    assert.equal(normalizeRecoveryCode(42), "");
    const hashes = codes.map(hashRecoveryCode);
    assert.equal(recoveryCodeMatches(codes[3]!, hashes), 3);
    assert.equal(recoveryCodeMatches(codes[3]!.toLowerCase(), hashes), 3);
    assert.equal(recoveryCodeMatches("AAAAA-AAAAA", hashes), -1);
    assert.equal(recoveryCodeMatches("", hashes), -1);
  });

  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8");

  // ─── The lockout window, closed 2026-08-30 ─────────────────────────────
  //
  // Codes used to be issued ONLY on the login route's check-code branch. Enrol
  // on the account page, lose the phone before the next sign-in, and there
  // were no codes, no un-enrol path and no owner reset. The account was gone.
  // These three pin the floor that was put under it.

  it("issues the codes at enrolment, not only at the first gated login", () => {
    const verify = read("src", "app", "api", "portal", "mfa", "verify", "route.ts");
    assert.match(verify, /issueRecoveryCodesIfMissing/,
      "enrolling can once again leave somebody with a factor and no way back in");
    assert.match(verify, /recoveryCodes/,
      "the codes are generated but never returned, so nobody can save them");
  });

  it("does not let a failed lookup undo a factor that is already proven", () => {
    // The factor is verified with Supabase before this point. Throwing here
    // would tell the caller enrolment failed while leaving them enrolled.
    const verify = read("src", "app", "api", "portal", "mfa", "verify", "route.ts");
    assert.match(verify, /try \{[\s\S]*issueRecoveryCodesIfMissing[\s\S]*\} catch/,
      "a portal-user lookup failure would fail the whole verification");
  });

  it("holds the panel open on the one showing instead of closing over it", () => {
    // `onVerified` usually closes the panel. Calling it in the same breath as
    // receiving the codes would show them for exactly one render.
    const setup = read("src", "components", "auth", "TwoFactorSetup.tsx");
    assert.match(setup, /if \(result\.recoveryCodes\?\.length\) \{[\s\S]{0,220}return;/,
      "the codes no longer stop the panel closing — they would be shown and lost");
    assert.match(setup, /data-testid="mfa-recovery-codes"/);
    assert.match(setup, /I have saved these/,
      "there is no acknowledgement step, so the codes can be dismissed by accident");
  });

  it("no longer tells people there are no backup codes", () => {
    // The copy predated the codes and stayed false for ten days.
    const panel = read("src", "app", "portal", "account", "TwoFactorPanel.tsx");
    assert.doesNotMatch(panel, /no backup codes yet/,
      "the panel claims there are no recovery codes, which has not been true since 2026-08-20");
    assert.match(panel, /recovery codes/i);
  });
});

describe("the account page's honest answer to \"is it on?\"", () => {
  // Enrolment already existed as endpoints; what was missing was anywhere on
  // somebody's own account to start it from and anything that says whether it
  // is switched on. The state has to come from the server, because a screen
  // that says "protected" without checking is worse than no indicator.

  function statusRequest(cookieHeader?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (cookieHeader) headers.cookie = cookieHeader;
    return new NextRequest(`${ORIGIN}/api/portal/mfa/enrol`, { method: "GET", headers });
  }

  it("refuses to answer for anybody who is not signed in", async () => {
    resetStub();
    const res = await mfaStatus(statusRequest());
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: "Sign in first." });
  });

  it("reports the factor of the account whose cookies were sent", async () => {
    // Driven with the Supabase cookies a real signed-in-with-MFA response
    // hands back, rather than a hand-built cookie name — so it breaks if the
    // route stops issuing them, which is the thing worth knowing.
    resetStub();
    const signIn = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.12.1"),
    );
    assert.equal(signIn.status, 200);
    const cookieHeader = signIn.headers
      .getSetCookie()
      .map(cookie => cookie.split(";")[0])
      .filter(pair => pair.startsWith("sb-"))
      .join("; ");
    assert.ok(cookieHeader, "a signed-in response must carry the Supabase session forward");

    resetStub();
    const res = await mfaStatus(statusRequest(cookieHeader));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, enrolled: true });
  });

  it("does not call a half-finished setup protection", async () => {
    // The one that matters on this screen: an abandoned enrolment reported as
    // "On" tells somebody they are covered when nothing is asking for a code.
    // It is the same rule the login gate uses, so the two never disagree.
    resetStub();
    factorStatus = "unverified";
    const signIn = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD }, "10.9.12.3"),
    );
    assert.equal(signIn.status, 200, "an unverified factor must not gate the login either");
    const cookieHeader = signIn.headers
      .getSetCookie()
      .map(cookie => cookie.split(";")[0])
      .filter(pair => pair.startsWith("sb-"))
      .join("; ");
    const res = await mfaStatus(statusRequest(cookieHeader));
    assert.deepEqual(await res.json(), { ok: true, enrolled: false });
    resetStub();
  });

  it("never enrols anything as a side effect of being asked", async () => {
    // A GET that clears a half-finished enrolment would destroy a setup
    // somebody is part-way through just by their opening the page.
    resetStub();
    const signIn = await POST(
      loginRequest({ email: GUARDED_EMAIL, password: PASSWORD, code: GOOD_CODE }, "10.9.12.2"),
    );
    const cookieHeader = signIn.headers
      .getSetCookie()
      .map(cookie => cookie.split(";")[0])
      .filter(pair => pair.startsWith("sb-"))
      .join("; ");
    resetStub();
    await mfaStatus(statusRequest(cookieHeader));
    assert.ok(
      !sbCalls.some(call => call.includes("factors") && call.startsWith("POST")),
      `asking the question must not enrol or unenrol anything: ${sbCalls.join(", ")}`,
    );
  });
});

describe("what the account page shows", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8");
  const panel = () => read("src", "app", "portal", "account", "TwoFactorPanel.tsx");

  it("is reachable from the account page at all", () => {
    // The endpoints existed for two months with nowhere to reach them from.
    assert.match(read("src", "app", "portal", "account", "page.tsx"), /<TwoFactorPanel available=\{/);
  });

  it("does not ask a question the deployment has already answered", () => {
    // Two-factor here is Supabase TOTP. On a deployment with no Supabase auth
    // the route answers an honest 503 — but the panel used to fire the request
    // anyway, on every load, producing a console error and a failed request
    // that can never resolve. The browser matrix reported it on all seventeen
    // viewports: 34 of its 352 failures were this one component asking a
    // question whose answer is fixed at deploy time.
    //
    // The capability is decided on the SERVER, where the environment actually
    // is, and passed in. A client-side probe would reintroduce the request.
    const page = read("src", "app", "portal", "account", "page.tsx");
    assert.match(page, /getSupabasePublicConfig\(\) !== null/, "the server decides, from the real environment");
    assert.match(panel(), /if \(available\) void refresh\(\)/, "no request when it cannot succeed");
    assert.match(panel(), /if \(!available\) \{/, "and a stated reason in place of the control");
    assert.match(panel(), /Unavailable/, "…labelled Unavailable, never as merely Off");
  });

  it("still says Off — not Unavailable — when the deployment CAN do it", () => {
    // The failure this pins is the mirror image: a panel that reports
    // "Unavailable" on a working deployment would talk a user out of turning
    // on two-factor they are perfectly able to turn on. `available` defaults
    // to true, and the unavailable branch is reached only by an explicit false.
    assert.match(panel(), /\{ available = true \}/, "available defaults to true");
  });

  it("reuses the existing setup component rather than a second one", () => {
    // The QR, the setup key and the six-digit box already exist and are already
    // tested. A second copy is a second thing to get subtly wrong.
    assert.match(panel(), /from "@\/components\/auth\/TwoFactorSetup"/);
    assert.match(panel(), /mode="enrol"/);
  });

  it("asks the server again after a confirm instead of believing the client", () => {
    assert.match(panel(), /onVerified=\{\(\) => \{[\s\S]*?void refresh\(\);/);
  });

  it("says it does not know rather than showing a reassuring guess", () => {
    // An unreadable answer must never render as "On".
    assert.match(panel(), /setEnrolled\(null\);\s*\n\s*setFailed\(true\);/);
    assert.match(panel(), /"Unknown"/);
  });
});

// ---- the screen that satisfies the gate -------------------------------------
//
// The server gate shipped before the login form could answer it. For a window,
// /portal/account offered enrolment while /login had no code field and never
// read `mfaRequired` — so turning 2FA on locked you out of every surface, with
// no recovery path built yet. These pin the two halves together.

describe("the screen that satisfies the gate", () => {
  it("lets the login form answer the MFA challenge the server sends", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const form = readFileSync(join(root, "src/app/login/LoginForm.tsx"), "utf8");

    assert.match(form, /mfaRequired/, "the form must react to the server's mfaRequired answer");
    assert.match(form, /data-testid="login-mfa-code"/, "there must be a code field to type into");
    assert.match(form, /autoComplete="one-time-code"/, "authenticator autofill should work");
    assert.match(
      form,
      /code:\s*code\.trim\(\)/,
      "the code must actually be sent on the retry, not just collected",
    );
    // The retry must reuse the credentials already in state — a form that clears
    // the password on the challenge makes the second step impossible to complete.
    assert.doesNotMatch(
      form,
      /setPassword\(""\)[\s\S]{0,200}mfaRequired/,
      "the password must survive the challenge so the retry is one field",
    );
});

  it("holds the redirect until freshly issued recovery codes have been seen", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const form = readFileSync(join(root, "src/app/login/LoginForm.tsx"), "utf8");

    // The server sends the codes exactly once. A form that navigates straight
    // past that response has shown them to nobody, ever.
    assert.match(form, /recoveryCodes\?:\s*string\[\]/, "the form must read the codes off the response");
    assert.match(form, /data-testid="login-recovery-codes"/, "there must be a screen that shows them");
    assert.match(form, /setPendingRedirect\(destination\)/, "the redirect must wait for the person");
    // And the code field must admit a recovery code, not just six digits.
    assert.match(form, /recovery code/i, "the field must say recovery codes work here");
    assert.doesNotMatch(form, /maxLength=\{8\}/, "an 11-character recovery code must fit in the field");
  });

  it("explains a side-door refusal instead of a silent bounce", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const form = readFileSync(join(root, "src/app/login/LoginForm.tsx"), "utf8");

    // The magic-link and Google doors redirect here with an error code when
    // they refuse an enrolled account. Untranslated, that bounce reads as
    // "the link is broken" — so the form must say what actually happened.
    assert.match(form, /magic_error/, "the form must read the magic-link refusal");
    assert.match(form, /oauth_error/, "the form must read the OAuth refusal");
    assert.match(form, /mfa_required/, "the enrolled refusal must be translated for the person");
    assert.match(form, /mfa_unavailable/, "the unchecked refusal must be translated too");
  });

  it("never offers enrolment without a way to sign in afterwards", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const panel = readFileSync(join(root, "src/app/portal/account/TwoFactorPanel.tsx"), "utf8");
    const form = readFileSync(join(root, "src/app/login/LoginForm.tsx"), "utf8");

    // If the enrolment panel exists at all, the login form MUST be able to
    // complete the challenge. Deleting the code field to "simplify" the form
    // turns this red rather than turning sign-in into a trap.
    if (/TwoFactorSetup/.test(panel)) {
      assert.match(form, /mfaRequired/, "enrolment is live but the login form cannot answer it");
    }
});
});

describe("an unconfigured deployment says two-factor is unavailable, not broken", () => {
  // Every MFA route builds its client with `createRouteSupabaseClient`, which
  // calls `requireSupabasePublicConfig()` and THROWS when Supabase is absent.
  // An uncaught throw in a route handler is a 500, so a deployment that simply
  // has no Supabase credentials reported "two-factor is broken". The browser
  // matrix caught `POST /api/portal/mfa/enrol` answering 500 on EVERY viewport.
  // A missing configuration is not a server fault.
  it("mfaUnavailableResponse answers 503 with a reason when Supabase is absent", async () => {
    const mod = await import("../src/lib/server/auth/mfa");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = mod.mfaUnavailableResponse();
      assert.ok(response, "an unconfigured deployment was waved through to a throw");
      assert.equal(response.status, 503, "a missing configuration is not a 500 server fault");
      const body = await response.json() as { ok: boolean; code: string; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.code, "mfa_unavailable");
      assert.match(body.error, /not configured|not available/i,
        "the refusal must say WHY, not just fail");
    } finally {
      if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
    }
  });

  it("every MFA handler consults it before touching Supabase", () => {
    // The guard is worthless if a handler forgets it, so this is a sweep, not
    // a spot-check: any exported handler in the MFA routes must call it.
    for (const file of ["src/app/api/portal/mfa/enrol/route.ts", "src/app/api/portal/mfa/verify/route.ts"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const handlers = (source.match(/export async function (GET|POST|DELETE|PATCH|PUT)\(/g) ?? []).length;
      const guards = (source.match(/mfaUnavailableResponse\(\)/g) ?? []).length;
      assert.ok(handlers > 0, `${file}: no handlers found — this sweep has gone blind`);
      assert.equal(guards, handlers,
        `${file}: ${handlers} handler(s) but ${guards} guard(s) — one can still 500 on an unconfigured deployment`);
    }
  });
});
