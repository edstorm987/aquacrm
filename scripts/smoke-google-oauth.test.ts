// Route-level smoke for Google OAuth activation (T1 — chapter
// `04-google-oauth-activation.md`). Pairs with the helper-level
// `smoke-auth-oauth.test.ts` which already covers
// buildAuthorizeUrl / verifyOAuthState / verifyIdToken.
//
// This file exercises the start + callback ROUTES + secrets accessors
// + ENV_ALLOWLIST + .env.example + deploy.md, plus typed-secret
// accessors from `lib/server/secrets.ts`. Mocks every Google network
// call — no outbound HTTP.
//
// Usage:
//   npx tsx --test scripts/smoke-google-oauth.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isGoogleOAuthConfigured,
  readGoogleOAuthConfig,
  buildAuthorizeUrl,
  verifyOAuthState,
} from "../src/lib/server/oauthGoogle";
import { ENV_ALLOWLIST } from "../src/lib/server/env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ── 1. env gating: false when unset ─────────────────────────────────────────
test("env gating: all unset → isGoogleOAuthConfigured() === false", () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  assert.equal(isGoogleOAuthConfigured(), false);
  assert.equal(readGoogleOAuthConfig(), null);
});

// ── 2. env gating: true when both required set ──────────────────────────────
test("env gating: client_id + client_secret set → configured + redirect derived", () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  process.env.NEXT_PUBLIC_PORTAL_BASE_URL = "https://example.test";
  const cfg = readGoogleOAuthConfig();
  assert.ok(cfg);
  assert.equal(cfg!.clientId, "cid.apps.googleusercontent.com");
  assert.equal(cfg!.redirectUri, "https://example.test/api/auth/oauth/google/callback");
  assert.equal(isGoogleOAuthConfigured(), true);
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_PORTAL_BASE_URL;
});

// ── 3. start route: 302s to Google with required params + state ─────────────
test("start route: builds an authorize URL with all 5 required params + state", () => {
  // We replicate what /start does: read config, build URL, redirect.
  // The route file shape is also asserted (test 4) so a regression in
  // either place trips this smoke.
  const cfg = {
    clientId: "cid.apps.googleusercontent.com",
    clientSecret: "secret",
    redirectUri: "https://example.test/api/auth/oauth/google/callback",
  };
  const { url, state } = buildAuthorizeUrl(cfg, { returnUrl: "/portal", secret: "sess-secret" });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  for (const p of ["client_id", "redirect_uri", "response_type", "scope", "state"]) {
    assert.ok(u.searchParams.get(p), `missing ${p}`);
  }
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(u.searchParams.get("state"), state);
});

// ── 4. start route: file shape (404 + redirect + return-param plumbing) ─────
test("start route: file shape — config gate, 302 redirect, return param", () => {
  const src = read("src/app/api/auth/oauth/google/start/route.ts");
  assert.match(src, /readGoogleOAuthConfig/);
  assert.match(src, /google_oauth_not_configured/);
  assert.match(src, /buildAuthorizeUrl/);
  assert.match(src, /NextResponse\.redirect\(.*302/s);
  assert.match(src, /searchParams\.get\("return"\)/);
});

// ── 5. callback route: bad state rejected ───────────────────────────────────
test("callback: malformed state fails verifyOAuthState (CSRF guard)", () => {
  const r = verifyOAuthState("not-a-real-state", "sess-secret");
  assert.equal(r.ok, false);
});

// ── 6. callback route: file shape — exchanges, verifies email, sessions ─────
test("callback route: file shape — state + email_verified + session + role-aware redirect", () => {
  const src = read("src/app/api/auth/oauth/google/callback/route.ts");
  assert.match(src, /verifyOAuthState/);
  assert.match(src, /exchangeAndVerify/);
  assert.match(src, /emailVerified/);
  assert.match(src, /issueSession/);
  assert.match(src, /sessionCookie/);
  // First-run bootstrap (existing) + existing-email path (existing)
  assert.match(src, /bootstrapAgency/);
  assert.match(src, /getUser\(claims\.email\)/);
  // Role-aware fallback via resolvePostLoginPath (NEW this round —
  // makes lead-role users land on /business-os).
  assert.match(src, /resolvePostLoginPath/);
});

// ── 7. callback route: unknown email → /login?oauth_error=unknown_email ─────
test("callback route: unknown email rejected with redirect (not 200)", () => {
  const src = read("src/app/api/auth/oauth/google/callback/route.ts");
  assert.match(src, /unknown_email/);
  // err() helper redirects back to /login with ?oauth_error=
  assert.match(src, /oauth_error/);
});

// ── 8. ENV_ALLOWLIST extended with the 3 GOOGLE_OAUTH_* keys ────────────────
test("ENV_ALLOWLIST contains the three GOOGLE_OAUTH_* keys", () => {
  assert.ok(ENV_ALLOWLIST.includes("GOOGLE_OAUTH_CLIENT_ID"));
  assert.ok(ENV_ALLOWLIST.includes("GOOGLE_OAUTH_CLIENT_SECRET"));
  assert.ok(ENV_ALLOWLIST.includes("GOOGLE_OAUTH_REDIRECT_URI"));
});

// ── 9. typed accessors in secrets.ts ────────────────────────────────────────
// Source-marker style — `secrets.ts` carries `import "server-only"` so
// it can't be imported under tsx. Verify the three accessors by file
// shape instead (same pattern as the founder-seed smoke).
test("secrets.ts exposes typed googleOauth* accessors", () => {
  const src = read("src/lib/server/secrets.ts");
  assert.match(src, /export function googleOauthClientId\(/);
  assert.match(src, /export function googleOauthClientSecret\(/);
  assert.match(src, /export function googleOauthRedirectUri\(/);
  assert.match(src, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(src, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(src, /GOOGLE_OAUTH_REDIRECT_URI/);
});

// ── 10. .env.example documents all 3 vars + the setup note ─────────────────
test(".env.example documents the 3 GOOGLE_OAUTH_* vars + setup steps", () => {
  const env = read(".env.example");
  assert.match(env, /GOOGLE_OAUTH_CLIENT_ID=/);
  assert.match(env, /GOOGLE_OAUTH_CLIENT_SECRET=/);
  assert.match(env, /GOOGLE_OAUTH_REDIRECT_URI=/);
  assert.match(env, /Google Cloud Console/);
  assert.match(env, /Authorised redirect URI/);
});

// ── 11. deploy.md env table extended with the 3 vars + "optional" flag ─────
test("runbooks/deploy.md env table lists the 3 GOOGLE_OAUTH_* vars as optional", () => {
  const md = readFileSync(join(ROOT, "..", "..", "01 development", "runbooks", "deploy.md"), "utf8");
  assert.match(md, /\| `GOOGLE_OAUTH_CLIENT_ID` \| optional/);
  assert.match(md, /\| `GOOGLE_OAUTH_CLIENT_SECRET` \| optional/);
  assert.match(md, /\| `GOOGLE_OAUTH_REDIRECT_URI` \| optional/);
  assert.match(md, /Login still works without/);
});

// ── 12. LoginForm gates the button on googleEnabled ────────────────────────
test("LoginForm gates the Google button on googleEnabled prop", () => {
  const src = read("src/app/login/LoginForm.tsx");
  assert.match(src, /googleEnabled/);
  assert.match(src, /\/api\/auth\/oauth\/google\/start/);
});
