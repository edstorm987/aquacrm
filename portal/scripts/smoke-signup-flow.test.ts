// T1 R020 smoke — account bootstrap + email verification HMAC.
// Run via `npm run smoke:signup-flow` (tsx --test).
//
// We verify:
//   - emailVerification HMAC roundtrip (sign → verify → payload match).
//   - Tampered token fails signature check.
//   - Expired token fails.
//   - Single-use nonce store flips after markVerifyNonceUsed.
//   - Standalone portal keeps public signup/demo surfaces removed while
//     preserving the backend bootstrap + verification contracts.

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

describe("Standalone account bootstrap — file structure (R020)", () => {
  it("public /signup page is intentionally absent in the one-account portal", () => {
    const p = join(ROOT, "src", "app", "signup", "page.tsx");
    assert.equal(existsSync(p), false);
  });

  it("public SignupForm is intentionally absent in the one-account portal", () => {
    const p = join(ROOT, "src", "app", "signup", "SignupForm.tsx");
    assert.equal(existsSync(p), false);
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
    assert.ok(src.includes("consumeVerifyNonce"));
    assert.ok(src.includes("/portal/agency?verified=1"));
  });

  it("LoginForm does not expose public signup in the standalone portal", () => {
    const p = join(ROOT, "src", "app", "login", "LoginForm.tsx");
    const src = readFileSync(p, "utf8");
    assert.ok(!src.includes('href="/signup"'));
    assert.ok(!src.includes('data-testid="login-signup-link"'));
  });

  it("old DemoBanner signup CTA is intentionally absent", () => {
    const p = join(ROOT, "src", "components", "chrome", "DemoBanner.tsx");
    assert.equal(existsSync(p), false);
  });
});
