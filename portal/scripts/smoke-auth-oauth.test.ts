// Mock-smoke for the foundation Google-OAuth helpers. Verifies state
// signing/verification, authorize-URL shape, and tokeninfo verification
// (success + audience mismatch + expired). No real Google calls.
//
// Usage:
//   npx tsx --test scripts/smoke-auth-oauth.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthorizeUrl,
  verifyOAuthState,
  verifyIdToken,
  exchangeAndVerify,
  isGoogleOAuthConfigured,
  readGoogleOAuthConfig,
} from "../src/lib/server/oauthGoogle";

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
  const { url, state } = buildAuthorizeUrl(CFG, { returnUrl: "/portal/agency", secret: SECRET });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("client_id"), CFG.clientId);
  assert.equal(u.searchParams.get("redirect_uri"), CFG.redirectUri);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(u.searchParams.get("state"), state);
});

test("verifyOAuthState: round-trip preserves returnUrl", () => {
  const { state } = buildAuthorizeUrl(CFG, { returnUrl: "/portal/agency/clients", secret: SECRET });
  const r = verifyOAuthState(state, SECRET);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.returnUrl, "/portal/agency/clients");
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
  const r = await exchangeAndVerify(CFG, "real-code", { fetchImpl: f });
  assert.equal(r.ok, true);
});

test("exchangeAndVerify: missing id_token in token response", async () => {
  const f = mockFetch([
    { url: /oauth2\.googleapis\.com\/token$/, status: 200, json: { access_token: "no-id" } },
  ]);
  const r = await exchangeAndVerify(CFG, "real-code", { fetchImpl: f });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "missing_id_token");
});
