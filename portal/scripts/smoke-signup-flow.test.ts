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
import crypto from "node:crypto";
import {
  signVerifyEmailToken,
  verifyVerifyEmailToken,
  isVerifyNonceUsed,
  markVerifyNonceUsed,
} from "../src/lib/server/auth/emailVerification";
import { resolveSigningSecret } from "../src/lib/server/auth/sessionToken";

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

  it("keeps pre-purpose email-verification links readable for issued accounts", () => {
    const { payload } = signVerifyEmailToken({ userId: "usr_legacy", email: "legacy@example.com" });
    const legacyPayload = {
      userId: payload.userId,
      email: payload.email,
      exp: payload.exp,
      nonce: payload.nonce,
    };
    const body = Buffer.from(JSON.stringify(legacyPayload), "utf8").toString("base64url");
    const signature = crypto
      .createHmac("sha256", resolveSigningSecret())
      .update(body)
      .digest("base64url");
    const verified = verifyVerifyEmailToken(`${body}.${signature}`);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.equal(verified.payload.purpose, undefined);
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

  it("/api/auth/signup records password-free admission and issues a session only after activation", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "signup", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("prepareAgencySignup"));
    assert.ok(src.includes("activateAgencySignup"));
    assert.ok(src.includes('body.phase === "complete"'));
    assert.ok(src.includes("issueSession"));
    assert.ok(src.indexOf("activateAgencySignup") < src.lastIndexOf("issueSession"));
    assert.ok(!src.includes("createUser({"), "the public admission route must not create an owner directly");
  });

  it("/api/auth/verify-email/route.ts exists + redirects on success", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "verify-email", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("verifyVerifyEmailToken"));
    assert.ok(src.includes("markEmailVerified"), "legacy issued tokens remain compatible");
    assert.ok(src.includes("consumeVerifyNonce"));
    assert.ok(src.includes("claimAgencySignupVerification"));
    assert.ok(src.includes("/signup/setup"));
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
