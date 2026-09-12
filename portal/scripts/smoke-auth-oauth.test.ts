// Mock-smoke for the foundation Google-OAuth helpers. Verifies state
// signing/verification, authorize-URL shape, and tokeninfo verification
// (success + audience mismatch + expired). No real Google calls.
//
// Usage:
//   npx tsx --test scripts/smoke-auth-oauth.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  buildAuthorizeUrl,
  GOOGLE_OAUTH_FLOW_COOKIE,
  verifyOAuthState,
  verifyOAuthBrowserProof,
  verifyIdToken,
  exchangeAndVerify,
  isGoogleOAuthConfigured,
  readGoogleOAuthConfig,
} from "../src/lib/server/integrations/oauthGoogle";

const SECRET = "smoke-secret-1";
const CFG = {
  clientId: "client-abc.apps.googleusercontent.com",
  clientSecret: "secret-xyz",
  redirectUri: "http://localhost:3030/api/auth/oauth/google/callback",
};

test("env gating: unset → not configured", () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  assert.equal(isGoogleOAuthConfigured(), false);
  assert.equal(readGoogleOAuthConfig(), null);
});

test("env gating: both set → configured", () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "x";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "y";
  assert.equal(isGoogleOAuthConfigured(), true);
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
});

test("buildAuthorizeUrl: contains all required params", () => {
  const { url, state, browserProof } = buildAuthorizeUrl(CFG, { returnUrl: "/portal/agency", secret: SECRET });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("client_id"), CFG.clientId);
  assert.equal(u.searchParams.get("redirect_uri"), CFG.redirectUri);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(u.searchParams.get("state"), state);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  const verifier = browserProof.split(".")[2]!;
  assert.equal(
    u.searchParams.get("code_challenge"),
    crypto.createHash("sha256").update(verifier).digest("base64url"),
  );
  assert.equal(GOOGLE_OAUTH_FLOW_COOKIE.startsWith("__Host-"), true);
});

test("verifyOAuthState: round-trip preserves returnUrl", () => {
  const { state, browserProof } = buildAuthorizeUrl(CFG, { returnUrl: "/portal/agency/clients", secret: SECRET });
  const r = verifyOAuthState(state, SECRET);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.returnUrl, "/portal/agency/clients");
    assert.equal(verifyOAuthBrowserProof(r, browserProof).ok, true);
    assert.deepEqual(verifyOAuthBrowserProof(r, undefined), { ok: false, error: "missing_browser_proof" });
    assert.deepEqual(
      verifyOAuthBrowserProof(r, buildAuthorizeUrl(CFG, { secret: SECRET }).browserProof),
      { ok: false, error: "invalid_browser_proof" },
    );
  }
});

test("verifyOAuthState: bad signature rejected", () => {
  const { state } = buildAuthorizeUrl(CFG, { returnUrl: "/", secret: SECRET });
  const r = verifyOAuthState(state, "different-secret");
  assert.equal(r.ok, false);
});

test("verifyOAuthState: malformed rejected", () => {
  const r = verifyOAuthState("not.a.valid.token", SECRET);
  assert.equal(r.ok, false);
});

test("verifyOAuthState: an otherwise valid state is refused at expiry", () => {
  const { state } = buildAuthorizeUrl(CFG, { returnUrl: "/portal", secret: SECRET });
  const encoded = state.split(".")[0]!;
  const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  body.exp = Math.floor(Date.now() / 1_000);
  const expiredBody = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(expiredBody).digest("base64url");
  assert.deepEqual(verifyOAuthState(`${expiredBody}.${signature}`, SECRET), {
    ok: false,
    error: "expired_state",
  });
});

// Mock fetch helper for tokeninfo / token-exchange paths.
function mockFetch(plan: { url: RegExp; status: number; json: unknown }[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const match = plan.find(p => p.url.test(u));
    if (!match) throw new Error(`mockFetch: no plan matches ${u}`);
    return new Response(JSON.stringify(match.json), {
      status: match.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("verifyIdToken: happy path returns claims", async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const f = mockFetch([{
    url: /tokeninfo/,
    status: 200,
    json: {
      sub: "g-1",
      email: "ed@example.com",
      email_verified: "true",
      name: "Ed",
      aud: CFG.clientId,
      iss: "https://accounts.google.com",
      exp: String(exp),
    },
  }]);
  const r = await verifyIdToken("fake-id-token", CFG.clientId, { fetchImpl: f });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.claims.email, "ed@example.com");
    assert.equal(r.claims.emailVerified, true);
    assert.equal(r.claims.aud, CFG.clientId);
  }
});

test("verifyIdToken: audience mismatch rejected", async () => {
  const f = mockFetch([{
    url: /tokeninfo/,
    status: 200,
    json: {
      sub: "g-1", email: "ed@example.com", email_verified: "true",
      aud: "attacker-app.apps.googleusercontent.com",
      iss: "https://accounts.google.com",
      exp: String(Math.floor(Date.now() / 1000) + 600),
    },
  }]);
  const r = await verifyIdToken("fake", CFG.clientId, { fetchImpl: f });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "audience_mismatch");
});

test("verifyIdToken: expired rejected", async () => {
  const f = mockFetch([{
    url: /tokeninfo/,
    status: 200,
    json: {
      sub: "g-1", email: "ed@example.com", email_verified: "true",
      aud: CFG.clientId, iss: "https://accounts.google.com",
      exp: String(Math.floor(Date.now() / 1000) - 10),
    },
  }]);
  const r = await verifyIdToken("fake", CFG.clientId, { fetchImpl: f });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "expired_id_token");
});

test("exchangeAndVerify: combines token-exchange + verify", async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const f = mockFetch([
    { url: /oauth2\.googleapis\.com\/token$/, status: 200, json: { id_token: "abc" } },
    { url: /tokeninfo/, status: 200, json: {
      sub: "g-1", email: "ed@example.com", email_verified: "true",
      aud: CFG.clientId, iss: "https://accounts.google.com", exp: String(exp),
    } },
  ]);
  const r = await exchangeAndVerify(CFG, "real-code", { fetchImpl: f, codeVerifier: "test-code-verifier" });
  assert.equal(r.ok, true);
});

test("exchangeAndVerify: sends the callback-bound PKCE verifier", async () => {
  let tokenBody = "";
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/token")) {
      tokenBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id_token: "pkce-id-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({
      sub: "pkce-sub",
      email: "pkce@example.test",
      email_verified: "true",
      aud: CFG.clientId,
      iss: "https://accounts.google.com",
      exp: String(Math.floor(Date.now() / 1000) + 600),
    }), { status: 200 });
  }) as typeof fetch;
  assert.equal((await exchangeAndVerify(CFG, "fresh-code", {
    fetchImpl: f,
    codeVerifier: "callback-bound-verifier",
  })).ok, true);
  assert.equal(new URLSearchParams(tokenBody).get("code_verifier"), "callback-bound-verifier");
});

test("exchangeAndVerify: missing id_token in token response", async () => {
  const f = mockFetch([
    { url: /oauth2\.googleapis\.com\/token$/, status: 200, json: { access_token: "no-id" } },
  ]);
  const r = await exchangeAndVerify(CFG, "real-code", { fetchImpl: f });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "missing_id_token");
});
