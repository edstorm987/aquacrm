// AUTH-001 — login route is gated by the managed bot-challenge (DECISIONS #13).
//
// Behavioural: drives the REAL exported POST handler of `/api/auth/login`
// in-process (no dev server), mirroring scripts/smoke-auth-form-encoding.test.ts.
// A stub Supabase HTTP server stands in for signInWithPassword; a global-fetch
// wrapper intercepts ONLY the Turnstile siteverify call so no real network is
// used. Turnstile keys are set so the challenge is CONFIGURED (enforced).
//
// Proven here:
//   1. a JSON login with NO captcha token is denied (403) BEFORE any credential
//      work — the Supabase password grant is never reached;
//   2. a JSON login with a VALID token proceeds and succeeds;
//   3. a JSON login with a REJECTED token is denied (403);
//   4. with the challenge UNCONFIGURED (no keys) login proceeds unchanged
//      (backwards-compatibility with every existing caller and the suite);
//   5. a native form POST with no token 303-redirects with the challenge
//      message on a short-lived cookie (never in the URL).
//
// Run: NODE_OPTIONS='--conditions react-server' node --import tsx --test \
//        scripts/smoke-login-bot-challenge.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";

import * as loginRoute from "../src/app/api/auth/login/route";
import { POST as browserPOST } from "../src/app/api/auth/login/browser/route";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { bindSupabaseAuthIdentity, createUser } from "../src/server/users";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";

const ORIGIN = "http://localhost:3030";
const LOGIN_URL = `${ORIGIN}/api/auth/login`;
const ERROR_COOKIE = "aqua_login_error";
const SITE_KEY = "1x00000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

const MEMBER_EMAIL = "captcha.login@auth001.test";
const GOOD_PASSWORD = "Sup3rSecret!pw";
const SB_USER_ID = "sb_user_captcha_login";
const FREELANCER_EMAIL = "bound.freelancer@auth001.test";
const FREELANCER_SB_USER_ID = "sb_user_bound_freelancer";
const WRONG_FREELANCER_SB_USER_ID = "sb_user_wrong_freelancer";
const CLIENT_EMAIL = "exact.client@auth001.test";
const CLIENT_SB_USER_ID = "sb_user_exact_client";
const POST = loginRoute.POST;

let sbServer: Server | undefined;
let sbCalls: string[] = [];
let realFetch: typeof fetch;
let savedEnv: Record<string, string | undefined> = {};
let supabaseReachable = false;
let freelancerAgencyId = "";
let exactClientId = "";
let exactClientUserId = "";
let activeFreelancerSubjectId = FREELANCER_SB_USER_ID;
const EXTERNAL_LOGIN_ORIGIN = "https://portal.aquaoasis.test";

// The canned Turnstile answer for a "valid" token. Bound to action=login and
// the request host (localhost) so the server's strict binding is satisfied.
let turnstileVerdict: (token: string) => Record<string, unknown> = () => ({
  success: true,
  action: "login",
  hostname: "localhost",
  challenge_ts: new Date().toISOString(),
});

function installFetchInterceptor(): void {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes("challenges.cloudflare.com/turnstile")) {
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const token = new URLSearchParams(bodyText).get("response") ?? "";
      const verdict = turnstileVerdict(token);
      return new Response(JSON.stringify(verdict), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

async function startStubSupabase(): Promise<string> {
  sbServer = createServer((req, res) => {
    sbCalls.push(`${req.method} ${req.url?.split("?")[0]}`);
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = req.url ?? "";
      if (url.startsWith("/auth/v1/token")) {
        const body = Buffer.concat(chunks).toString("utf8");
        let password = "";
        let requestedEmail = "";
        try {
          const parsed = JSON.parse(body) as { email?: string; password?: string };
          password = parsed.password ?? "";
          requestedEmail = parsed.email?.trim().toLowerCase() ?? "";
        } catch {
          password = "";
        }
        if (password !== GOOD_PASSWORD) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        const isFreelancer = requestedEmail === FREELANCER_EMAIL;
        const isClient = requestedEmail === CLIENT_EMAIL;
        res.end(JSON.stringify({
          access_token: "stub-access-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "stub-refresh-token",
          user: {
            id: isFreelancer ? activeFreelancerSubjectId : isClient ? CLIENT_SB_USER_ID : SB_USER_ID,
            aud: "authenticated",
            role: "authenticated",
            email: requestedEmail || MEMBER_EMAIL,
            app_metadata: isFreelancer ? {
              aqua_subject_kind: "agency-staff",
              aqua_profile_role: "staff",
              aqua_agency_id: freelancerAgencyId,
              aqua_provisioning_operation_id: "staff-provisioning-test-operation",
            } : isClient ? {
              aqua_subject_kind: "client-portal",
              aqua_profile_role: "client",
              aqua_local_user_id: exactClientUserId,
              aqua_agency_id: freelancerAgencyId,
              aqua_client_id: exactClientId,
            } : {},
            user_metadata: {},
            created_at: new Date(0).toISOString(),
          },
        }));
        return;
      }
      if (url.startsWith("/rest/v1/profiles")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          url.includes(FREELANCER_SB_USER_ID) || url.includes(WRONG_FREELANCER_SB_USER_ID)
            ? '[{"role":"staff"}]'
            : url.includes(CLIENT_SB_USER_ID)
              ? '[{"role":"client"}]'
            : "[]",
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => sbServer!.listen(0, "127.0.0.1", resolve));
  const address = sbServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

function jsonRequest(body: unknown, ip: string): NextRequest {
  return new NextRequest(LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function formRequest(fields: Record<string, string>, ip: string, referer?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "x-forwarded-for": ip,
  };
  if (referer) headers.referer = referer;
  return new NextRequest(LOGIN_URL, { method: "POST", headers, body: new URLSearchParams(fields).toString() });
}

function browserFormRequest(
  fields: Record<string, string>,
  ip: string,
  origin: string,
): NextRequest {
  return new NextRequest(`${LOGIN_URL}/browser`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
      origin,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function cookieValue(res: Response, name: string): string | undefined {
  const hit = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  const raw = hit.slice(name.length + 1).split(";")[0];
  try { return decodeURIComponent(raw); } catch { return raw; }
}

before(async () => {
  savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    secret: process.env.TURNSTILE_SECRET_KEY,
    node: process.env.NODE_ENV,
    aquaOasis: process.env.NEXT_PUBLIC_AQUAOASIS_URL,
  };
  installFetchInterceptor();
  const base = await startStubSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = base;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
  process.env.NEXT_PUBLIC_AQUAOASIS_URL = EXTERNAL_LOGIN_ORIGIN;
  __resetBotChallengeForTest();

  await ensureHydrated();
  const agency = createAgency({ name: "AUTH001 Captcha Co", ownerEmail: "owner@auth001.test" });
  createUser({ email: MEMBER_EMAIL, password: GOOD_PASSWORD, name: "Captcha Login", role: "agency-owner", agencyId: agency.id });
  freelancerAgencyId = agency.id;
  const client = createClient(agency.id, { name: "Exact login client" });
  exactClientId = client.id;
  const clientUser = createUser({
    email: CLIENT_EMAIL,
    password: GOOD_PASSWORD,
    name: "Exact client",
    role: "client-owner",
    agencyId: agency.id,
    clientId: client.id,
  });
  exactClientUserId = clientUser.id;
  assert.ok(bindSupabaseAuthIdentity(clientUser.id, CLIENT_SB_USER_ID));
  const freelancer = createUser({
    email: FREELANCER_EMAIL,
    password: GOOD_PASSWORD,
    name: "Bound Freelancer",
    role: "freelancer",
    agencyId: agency.id,
  });
  assert.ok(bindSupabaseAuthIdentity(freelancer.id, FREELANCER_SB_USER_ID));

  const probe = await realFetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: MEMBER_EMAIL, password: GOOD_PASSWORD }),
  });
  supabaseReachable = probe.ok;
});

after(() => {
  globalThis.fetch = realFetch;
  const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  restore("NEXT_PUBLIC_SUPABASE_URL", savedEnv.url);
  restore("NEXT_PUBLIC_SUPABASE_ANON_KEY", savedEnv.key);
  restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", savedEnv.site);
  restore("TURNSTILE_SECRET_KEY", savedEnv.secret);
  restore("NODE_ENV", savedEnv.node);
  restore("NEXT_PUBLIC_AQUAOASIS_URL", savedEnv.aquaOasis);
  sbServer?.close();
});

describe("Login is gated by the managed bot-challenge (configured)", () => {
  it("the Next route exports only supported route-handler symbols", () => {
    assert.deepEqual(Object.keys(loginRoute).sort(), ["POST"]);
  });

  it("denies a JSON login with NO token before any credential work", async () => {
    const before = sbCalls.length;
    const res = await POST(jsonRequest({ email: MEMBER_EMAIL, password: GOOD_PASSWORD }, "20.0.0.1"));
    assert.equal(res.status, 403, "no-token login must be refused");
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /verification challenge/i);
    const tokenGrants = sbCalls.slice(before).filter((c) => c === "POST /auth/v1/token");
    assert.equal(tokenGrants.length, 0, "the password grant must NOT be reached without a valid challenge");
  });

  it("denies a JSON login whose token the provider rejects", async () => {
    turnstileVerdict = () => ({ success: false, "error-codes": ["invalid-input-response"] });
    const res = await POST(jsonRequest({ email: MEMBER_EMAIL, password: GOOD_PASSWORD, captchaToken: "reject-me" }, "20.0.0.2"));
    assert.equal(res.status, 403);
    turnstileVerdict = () => ({ success: true, action: "login", hostname: "localhost", challenge_ts: new Date().toISOString() });
  });

  it("allows a JSON login with a VALID token and correct password", async () => {
    assert.equal(supabaseReachable, true, "stub Supabase must be reachable");
    const res = await POST(jsonRequest({ email: MEMBER_EMAIL, password: GOOD_PASSWORD, captchaToken: "good-token-1" }, "20.0.0.3"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
    assert.ok(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)), "a signed-in caller gets the session cookie");
  });

  it("still denies with the wrong password even when the token is valid (challenge is not auth)", async () => {
    const res = await POST(jsonRequest({ email: MEMBER_EMAIL, password: "wrong", captchaToken: "good-token-2" }, "20.0.0.4"));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: "Email or password is incorrect." });
  });

  it("a native form POST with no token 303s with the challenge message on a cookie, not the URL", async () => {
    const res = await POST(formRequest({ email: MEMBER_EMAIL, password: GOOD_PASSWORD }, "20.0.0.5", `${ORIGIN}/sites/acme/login`));
    assert.equal(res.status, 303);
    const location = res.headers.get("location")!;
    assert.ok(!location.toLowerCase().includes("challenge"), "the challenge message must not leak into the URL");
    assert.match(cookieValue(res, ERROR_COOKIE) ?? "", /verification challenge/i);
  });
});

describe("Bound workforce subjects never fall back to a same-email account", () => {
  it("accepts the exact immutable freelancer subject with staff provider metadata", async () => {
    activeFreelancerSubjectId = FREELANCER_SB_USER_ID;
    turnstileVerdict = () => ({
      success: true,
      action: "login",
      hostname: "localhost",
      challenge_ts: new Date().toISOString(),
    });
    const response = await POST(jsonRequest({
      email: FREELANCER_EMAIL,
      password: GOOD_PASSWORD,
      captchaToken: "bound-freelancer",
    }, "20.0.3.1"));
    assert.equal(response.status, 200, await response.clone().text());
    assert.ok(response.headers.getSetCookie().some(cookie => (
      cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
    )));
  });

  it("refuses a different provider subject even when email and admin metadata match", async () => {
    activeFreelancerSubjectId = WRONG_FREELANCER_SB_USER_ID;
    const response = await POST(jsonRequest({
      email: FREELANCER_EMAIL,
      password: GOOD_PASSWORD,
      captchaToken: "wrong-freelancer-subject",
    }, "20.0.3.2"));
    assert.equal(response.status, 403);
    assert.equal(response.headers.getSetCookie().some(cookie => (
      cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
    )), false);
    activeFreelancerSubjectId = FREELANCER_SB_USER_ID;
  });
});

describe("Exact client context narrows password login", () => {
  it("mints the exact bound client and rejects altered client/tenant context", async () => {
    turnstileVerdict = () => ({
      success: true,
      action: "login",
      hostname: "localhost",
      challenge_ts: new Date().toISOString(),
    });
    const exact = await POST(jsonRequest({
      email: CLIENT_EMAIL,
      password: GOOD_PASSWORD,
      brand: freelancerAgencyId,
      clientId: exactClientId,
      captchaToken: "exact-client-context",
    }, "20.0.4.1"));
    assert.equal(exact.status, 200, await exact.clone().text());
    const cookie = cookieValue(exact, SESSION_COOKIE_NAME);
    assert.ok(cookie);
    const payload = JSON.parse(Buffer.from(cookie!.split(".")[0]!, "base64url").toString("utf8"));
    assert.equal(payload.agencyId, freelancerAgencyId);
    assert.equal(payload.clientId, exactClientId);

    for (const [index, context] of [
      { brand: "other-agency", clientId: exactClientId },
      { brand: freelancerAgencyId, clientId: "other-client" },
      { brand: freelancerAgencyId, clientId: `${exactClientId} ` },
      { brand: freelancerAgencyId, clientId: 42 },
      { brand: freelancerAgencyId, clientId: null },
    ].entries()) {
      const refused = await POST(jsonRequest({
        email: CLIENT_EMAIL,
        password: GOOD_PASSWORD,
        ...context,
        captchaToken: `altered-client-context-${index}`,
      }, `20.0.4.${index + 2}`));
      assert.equal(refused.status, 403);
      assert.equal(cookieValue(refused, SESSION_COOKIE_NAME), undefined);
      assert.deepEqual(await refused.json(), {
        ok: false,
        error: "Account access is not configured correctly.",
      });
    }
  });
});

describe("Branded browser login preserves the external challenge hostname", () => {
  const common = {
    email: MEMBER_EMAIL,
    password: GOOD_PASSWORD,
    brand: "aqua",
  };

  it("rejects an Origin that does not exactly match the selected brand", async () => {
    const before = sbCalls.length;
    const res = await browserPOST(browserFormRequest(
      { ...common, captchaToken: "external-wrong-origin" },
      "20.0.2.1",
      "https://evil.example",
    ));
    assert.equal(res.status, 303);
    assert.match(res.headers.get("location") ?? "", /error=/);
    assert.equal(
      sbCalls.slice(before).filter((call) => call === "POST /auth/v1/token").length,
      0,
      "an untrusted Origin must be rejected before credential work",
    );
  });

  it("denies the right external Origin when no challenge token is supplied", async () => {
    const before = sbCalls.length;
    const res = await browserPOST(browserFormRequest(
      common,
      "20.0.2.2",
      EXTERNAL_LOGIN_ORIGIN,
    ));
    assert.equal(res.status, 303);
    const error = new URL(res.headers.get("location") ?? ORIGIN).searchParams.get("error") ?? "";
    assert.match(error, /verification challenge/i);
    assert.equal(
      sbCalls.slice(before).filter((call) => call === "POST /auth/v1/token").length,
      0,
    );
  });

  it("denies a provider token minted for the portal host on an external login", async () => {
    turnstileVerdict = () => ({
      success: true,
      action: "login",
      hostname: "localhost",
      challenge_ts: new Date().toISOString(),
    });
    const before = sbCalls.length;
    const res = await browserPOST(browserFormRequest(
      { ...common, captchaToken: "external-wrong-host" },
      "20.0.2.4",
      EXTERNAL_LOGIN_ORIGIN,
    ));
    assert.equal(res.status, 303);
    const error = new URL(res.headers.get("location") ?? ORIGIN).searchParams.get("error") ?? "";
    assert.match(error, /verification challenge/i);
    assert.equal(
      sbCalls.slice(before).filter((call) => call === "POST /auth/v1/token").length,
      0,
      "hostname mismatch must fail before password verification",
    );
  });

  it("accepts a token bound to the trusted external hostname", async () => {
    turnstileVerdict = (token) => ({
      success: token === "external-good-token",
      action: "login",
      hostname: "portal.aquaoasis.test",
      challenge_ts: new Date().toISOString(),
    });
    const res = await browserPOST(browserFormRequest(
      { ...common, captchaToken: "external-good-token" },
      "20.0.2.3",
      EXTERNAL_LOGIN_ORIGIN,
    ));
    assert.equal(res.status, 303);
    assert.ok(
      res.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`)),
      `a correctly host-bound branded login receives the session cookie; location=${res.headers.get("location")}`,
    );
    turnstileVerdict = () => ({
      success: true,
      action: "login",
      hostname: "localhost",
      challenge_ts: new Date().toISOString(),
    });
  });
});

describe("Login is unchanged when the challenge is UNCONFIGURED (dev/suite)", () => {
  it("proceeds to the credential check with no token when no keys are set", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "test";
    const res = await POST(jsonRequest({ email: MEMBER_EMAIL, password: GOOD_PASSWORD }, "20.0.1.1"));
    assert.equal(res.status, 200, "unconfigured challenge must not block login outside production");
    // restore for any later tests in this file
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
    process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
  });
});
