// The OTHER doors into `lk_session_v1` — and what each one proves.
//
// The password door got its MFA gate on 2026-08-20 (`smoke-mfa.test.ts`).
// This file pins the rest of the contract:
//
//   1. The magic-link verify and the Google OAuth callback — single-factor
//      flows with nowhere to type a code — REFUSE to mint the app session for
//      an account whose Supabase identity has a verified second factor, and
//      refuse too when enrolment cannot be checked at all. A side door that
//      opens whenever the check is down is not closed.
//   2. Every minted session carries `aal` — which assurance level that
//      sign-in actually proved — so the rest of the app can gate sensitive
//      actions on "proved two factors", not "was issued at all".
//
// Everything drives the REAL exported route handlers in-process against a
// stub Supabase admin API, because the thing that has to be true is not a
// shape in a source file — it is that no cookie comes back.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { NextRequest } from "next/server";

// Memory backend before anything touches the state layer — these tests must
// never reach `.data/portal-state.json`.
process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "doors-smoke-secret";

import {
  MFA_SIDE_DOOR_ENROLLED_ERROR,
  MFA_SIDE_DOOR_UNCHECKED_ERROR,
  gateSideDoorSession,
  sessionAssurance,
  sessionHasSecondFactor,
} from "../src/lib/server/auth/mfa.ts";
import { GET as magicVerify } from "../src/app/api/auth/magic/verify/route";
import { GET as oauthCallback } from "../src/app/api/auth/oauth/google/callback/route";
import { signMagicToken } from "../src/lib/server/auth/magicLink";
import { buildAuthorizeUrl, readGoogleOAuthConfig } from "../src/lib/server/integrations/oauthGoogle";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser, getUser } from "../src/server/users";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";

const ORIGIN = "http://localhost:3033";
const ENROLLED_EMAIL = "doors.enrolled@doors-smoke.test";
const PLAIN_EMAIL = "doors.plain@doors-smoke.test";
const CUSTOMER_EMAIL = "doors.customer@doors-smoke.test";
const OAUTH_PLAIN_EMAIL = "doors.oauth.plain@doors-smoke.test";
const PASSWORD = "Sup3rSecret!pw";

// ─── the pure decision ─────────────────────────────────────────────────────

describe("deciding whether a side door may mint a session", () => {
  it("clears an email with no Supabase account at all", () => {
    // Most end-customers: magic-link is their only identity.
    assert.deepEqual(gateSideDoorSession({ outcome: "absent" }), { status: "clear" });
  });

  it("clears an account whose only factor was never verified", () => {
    // An abandoned enrolment is not protection — same rule as the login gate.
    const decision = gateSideDoorSession({
      outcome: "found",
      factors: [{ status: "unverified" }],
    });
    assert.deepEqual(decision, { status: "clear" });
  });

  it("refuses any verified factor, whatever its kind", () => {
    // The login gate can be picky about kinds because it can challenge the one
    // kind it knows. A side door can challenge nothing, so "some second factor
    // is on" is the whole answer.
    for (const factors of [
      [{ status: "verified" }],
      [{ status: "unverified" }, { status: "verified" }],
    ]) {
      const decision = gateSideDoorSession({ outcome: "found", factors });
      assert.equal(decision.status, "refuse");
      assert.equal(
        decision.status === "refuse" ? decision.error : "",
        MFA_SIDE_DOOR_ENROLLED_ERROR,
      );
    }
  });

  it("refuses when nothing could be checked — an open-on-failure door is not closed", () => {
    const decision = gateSideDoorSession({ outcome: "unavailable" });
    assert.equal(decision.status, "refuse");
    assert.equal(
      decision.status === "refuse" ? decision.error : "",
      MFA_SIDE_DOOR_UNCHECKED_ERROR,
    );
  });

  it("reads junk factors as not verified, never as a crash or a pass", () => {
    const decision = gateSideDoorSession({
      outcome: "found",
      factors: [null, "junk", 42, {}] as never,
    });
    assert.deepEqual(decision, { status: "clear" });
  });
});

// ─── what a session says it proved ─────────────────────────────────────────

describe("reading the assurance a session cookie carries", () => {
  it("reads the stamped level", () => {
    assert.equal(sessionAssurance({ aal: "aal2" }), "aal2");
    assert.equal(sessionAssurance({ aal: "aal1" }), "aal1");
  });

  it("fails closed on everything else", () => {
    // A legacy cookie from before `aal` existed may well have passed the gate
    // once — but nothing can confirm that now, and "probably" is not a level.
    for (const bad of [{}, { aal: "aal3" }, { aal: 2 }, { aal: null }, null, undefined]) {
      assert.equal(sessionAssurance(bad as never), null, `read ${JSON.stringify(bad)}`);
      assert.equal(sessionHasSecondFactor(bad as never), false);
    }
    assert.equal(sessionHasSecondFactor({ aal: "aal1" }), false);
    assert.equal(sessionHasSecondFactor({ aal: "aal2" }), true);
  });
});

// ─── stub Supabase admin API ───────────────────────────────────────────────
//
// The side-door check reads enrolment through `auth.admin.listUsers` (these
// flows hold no Supabase session of their own). The stub serves exactly that.

let sbServer: Server | undefined;
let adminCalls = 0;

function supabaseAdminUser(email: string, verified: boolean) {
  return {
    id: `sb_${email}`,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
    factors: verified
      ? [{ id: "factor-1", factor_type: "totp", status: "verified",
          created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString() }]
      : [],
  };
}

async function startStubSupabase(): Promise<string> {
  sbServer = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (path === "/auth/v1/admin/users") {
      adminCalls += 1;
      // Only the enrolled account exists in Supabase; everybody else is
      // portal-only, the way end-customers actually are.
      return send(200, { users: [supabaseAdminUser(ENROLLED_EMAIL, true)], aud: "authenticated" });
    }
    return send(200, {});
  });
  await new Promise<void>(resolve => sbServer!.listen(0, "127.0.0.1", resolve));
  const address = sbServer.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

// ─── shared fixtures ───────────────────────────────────────────────────────

let clientId = "";
let agencyId = "";
const savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

const GOOGLE_CLIENT_ID = "doors-google-client-id";
/** What the fake Google says about the identity being signed in. */
let googleEmail = PLAIN_EMAIL;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

before(async () => {
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI",
  ]) {
    savedEnv[key] = process.env[key];
  }
  const base = await startStubSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = base;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role-key";
  process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "doors-google-secret";
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;

  // Google's endpoints are not configurable, so the fake sits on global fetch
  // and answers only for them — everything else (the Supabase stub included)
  // passes straight through to the real fetch.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // tokeninfo FIRST — "…/tokeninfo" also startsWith "…/token".
    if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return jsonResponse({
        aud: GOOGLE_CLIENT_ID,
        iss: "https://accounts.google.com",
        exp: String(Math.floor(Date.now() / 1000) + 3600),
        sub: "google-sub-1",
        email: googleEmail,
        email_verified: "true",
        name: "Doors Tester",
      });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return jsonResponse({ id_token: "stub-google-id-token" });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;

  await ensureHydrated();
  const agency = createAgency({ name: "Doors Co", ownerEmail: "owner@doors-smoke.test" });
  agencyId = agency.id;
  const client = createClient(agency.id, { name: "Doors Client" });
  clientId = client.id;
  for (const email of [ENROLLED_EMAIL, PLAIN_EMAIL, OAUTH_PLAIN_EMAIL]) {
    createUser({ email, password: PASSWORD, name: "Doors", role: "agency-owner", agencyId: agency.id });
  }
});

after(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  sbServer?.close();
});

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

function magicRequestFor(email: string): NextRequest {
  const { token } = signMagicToken({ email, clientId, agencyId });
  const url = new URL("/api/auth/magic/verify", ORIGIN);
  url.searchParams.set("token", token);
  return new NextRequest(url, { method: "GET" });
}

// ─── the magic-link door ───────────────────────────────────────────────────

describe("the magic-link door", () => {
  it("still signs a plain end-customer in — and stamps what it proved", async () => {
    const res = await magicVerify(magicRequestFor(CUSTOMER_EMAIL));
    assert.equal(res.status, 302);
    assert.ok(sessionCookieOf(res), "a magic link is a real sign-in for an unenrolled account");
    // One factor (mailbox access) is what happened, and the cookie says so.
    assert.equal(sessionAalOf(res), "aal1");
  });

  it("refuses to mint a session for an enrolled account", async () => {
    // THE door. Before this gate, a magic link was a clean walk around the
    // TOTP challenge for exactly the accounts that switched the challenge on.
    const before = adminCalls;
    const res = await magicVerify(magicRequestFor(ENROLLED_EMAIL));
    assert.equal(res.status, 302);
    assert.equal(sessionCookieOf(res), undefined, "an enrolled account must not get a cookie here");
    const location = new URL(res.headers.get("location") ?? "", ORIGIN);
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("magic_error"), MFA_SIDE_DOOR_ENROLLED_ERROR);
    assert.ok(adminCalls > before, "the refusal must come from actually checking enrolment");
    // And the refusal must not have auto-created the end-customer either —
    // a side effect of a sign-in that was refused is still a side effect.
    assert.equal(getUser(ENROLLED_EMAIL, { clientId, role: "end-customer" }), null);
  });

  it("refuses everyone when enrolment cannot be checked at all", async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = await magicVerify(magicRequestFor("doors.unchecked@doors-smoke.test"));
      assert.equal(res.status, 302);
      assert.equal(sessionCookieOf(res), undefined, "unchecked must not mean unprotected");
      const location = new URL(res.headers.get("location") ?? "", ORIGIN);
      assert.equal(location.searchParams.get("magic_error"), MFA_SIDE_DOOR_UNCHECKED_ERROR);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});

// ─── the Google OAuth door ─────────────────────────────────────────────────

function oauthCallbackRequest(): NextRequest {
  const config = readGoogleOAuthConfig(`${ORIGIN}/api/auth/oauth/google/callback`);
  assert.ok(config, "Google OAuth env must be configured for this test");
  const { url } = buildAuthorizeUrl(config!, {
    returnUrl: "/portal",
    secret: process.env.PORTAL_SESSION_SECRET!,
  });
  const state = new URL(url).searchParams.get("state")!;
  const callback = new URL("/api/auth/oauth/google/callback", ORIGIN);
  callback.searchParams.set("code", "stub-auth-code");
  callback.searchParams.set("state", state);
  return new NextRequest(callback, { method: "GET" });
}

describe("the Google OAuth door", () => {
  it("still signs a known, unenrolled account in — and stamps what it proved", async () => {
    googleEmail = OAUTH_PLAIN_EMAIL;
    const res = await oauthCallback(oauthCallbackRequest());
    assert.equal(res.status, 302);
    assert.ok(sessionCookieOf(res), "Google sign-in stays a real sign-in for unenrolled accounts");
    assert.equal(sessionAalOf(res), "aal1", "Google is one factor, and the cookie must say so");
  });

  it("refuses to mint a session for an enrolled account", async () => {
    // The worst of the side doors before the gate: it minted agency-owner
    // sessions, not client-scoped ones.
    googleEmail = ENROLLED_EMAIL;
    const res = await oauthCallback(oauthCallbackRequest());
    assert.equal(res.status, 302);
    assert.equal(sessionCookieOf(res), undefined, "an enrolled account must not get a cookie here");
    const location = new URL(res.headers.get("location") ?? "", ORIGIN);
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("oauth_error"), MFA_SIDE_DOOR_ENROLLED_ERROR);
  });

  it("refuses everyone when enrolment cannot be checked at all", async () => {
    googleEmail = OAUTH_PLAIN_EMAIL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = await oauthCallback(oauthCallbackRequest());
      assert.equal(res.status, 302);
      assert.equal(sessionCookieOf(res), undefined, "unchecked must not mean unprotected");
      const location = new URL(res.headers.get("location") ?? "", ORIGIN);
      assert.equal(location.searchParams.get("oauth_error"), MFA_SIDE_DOOR_UNCHECKED_ERROR);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});
