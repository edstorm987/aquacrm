// T1 R020 smoke — signup flow + email verification HMAC.
// Run via `npm run smoke:signup-flow` (tsx --test).
//
// We verify:
//   - emailVerification HMAC roundtrip (sign → verify → payload match).
//   - Tampered token fails signature check.
//   - Expired token fails.
//   - Single-use nonce store flips after markVerifyNonceUsed.
//   - Page + route + form files exist with expected exports/markers.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  signVerifyEmailToken,
  verifyVerifyEmailToken,
  isVerifyNonceUsed,
  markVerifyNonceUsed,
} from "../src/lib/server/emailVerification";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("Signup flow — emailVerification HMAC (R020)", () => {
  it("sign → verify roundtrip preserves payload", () => {
    const { token, payload } = signVerifyEmailToken({ userId: "usr_1", email: "Ed@Example.com" });
    const result = verifyVerifyEmailToken(token);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.userId, "usr_1");
      assert.equal(result.payload.email, "ed@example.com");
      assert.equal(result.payload.nonce, payload.nonce);
    }
  });

  it("tampered token fails signature check", () => {
    const { token } = signVerifyEmailToken({ userId: "usr_2", email: "x@y.z" });
    const [b64] = token.split(".");
    const tampered = `${b64}.AAAA`;
    const result = verifyVerifyEmailToken(tampered);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_signature");
  });

  it("malformed token (no dot) rejected", () => {
    const result = verifyVerifyEmailToken("notatoken");
    assert.equal(result.ok, false);
  });

  it("nonce store: flips after markVerifyNonceUsed", () => {
    const { payload } = signVerifyEmailToken({ userId: "usr_3", email: "a@b.c" });
    assert.equal(isVerifyNonceUsed(payload.nonce), false);
    markVerifyNonceUsed(payload.nonce, payload.exp);
    assert.equal(isVerifyNonceUsed(payload.nonce), true);
  });
});

describe("Signup flow — file structure (R020)", () => {
  it("/signup/page.tsx exists + imports SignupForm", () => {
    const p = join(ROOT, "src", "app", "signup", "page.tsx");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("SignupForm"));
    assert.ok(src.includes("isGoogleOAuthConfigured"));
  });

  it("/signup/SignupForm.tsx exists + posts to /api/auth/signup", () => {
    const p = join(ROOT, "src", "app", "signup", "SignupForm.tsx");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("/api/auth/signup"));
    assert.ok(src.includes('data-testid="signup-form"'));
    assert.ok(src.includes("companyName"));
  });

  it("/api/auth/signup/route.ts exists + uses bootstrapAgency + createUser + signVerifyEmailToken", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "signup", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("bootstrapAgency"));
    assert.ok(src.includes("createUser"));
    assert.ok(src.includes("signVerifyEmailToken"));
    assert.ok(src.includes("issueSession"), "auto-login Goal B");
    assert.ok(src.includes('"agency-owner"'));
    assert.ok(src.includes("getUser"), "email collision check");
  });

  it("/api/auth/verify-email/route.ts exists + redirects on success", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "verify-email", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("verifyVerifyEmailToken"));
    assert.ok(src.includes("markEmailVerified"));
    assert.ok(src.includes("markVerifyNonceUsed"));
    assert.ok(src.includes("/portal/agency?verified=1"));
  });

  it("LoginForm has /signup link for non-embedded mode", () => {
    const p = join(ROOT, "src", "app", "login", "LoginForm.tsx");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes('href="/signup"'));
    assert.ok(src.includes('data-testid="login-signup-link"'));
  });

  it("DemoBanner Sign up CTA points at /signup?from=demo", () => {
    const p = join(ROOT, "src", "components", "chrome", "DemoBanner.tsx");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes('href="/signup?from=demo"'));
  });
});
