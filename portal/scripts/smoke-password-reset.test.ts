// T1 R038 smoke — forgotten-password flow.
// Run via `npm run smoke:password-reset` (tsx --test).
//
// Mix of pure-runtime checks (passwordReset.ts + nonceStore.ts have
// no `import "server-only"` shim — they're explicitly importable from
// smokes) plus source-marker checks for the route handlers, pages,
// and login-page wiring (their dependency graphs reach into
// server-only files like users.ts/storage.ts which tsx --test can't
// load).
//
// Coverage:
//   - HMAC token roundtrip preserves payload (sign → verify).
//   - Tampered token rejected (invalid signature).
//   - Malformed token (no dot) rejected.
//   - Expired token rejected (forged exp in the past, valid sig).
//   - Single-use enforced — consumeResetNonce flips on second call.
//   - Distinct nonce kind 'password-reset' wired into NonceKind union
//     (chapter #138 extension).
//   - Lib + routes + pages + login-link source markers (10 file
//     structure tests including the no-leak assertion on
//     request-reset and the sessionRev/durable reset operation + redirect on
//     reset).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import {
  signPasswordResetToken,
  verifyPasswordResetToken,
  consumeResetNonce,
} from "../src/lib/server/auth/passwordReset";
import {
  _swapStoreForTests,
  _createMemoryAdapterForTests,
} from "../src/lib/server/auth/nonceStore";
import {
  signVerifyEmailToken,
  verifyVerifyEmailToken,
} from "../src/lib/server/auth/emailVerification";
import {
  signMagicToken,
  verifyMagicToken,
} from "../src/lib/server/auth/magicLink";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("Password reset — HMAC token (R038)", () => {
  it("sign → verify roundtrip preserves payload", () => {
    const { token, payload } = signPasswordResetToken({
      userId: "usr_1",
      email: "Ed@Example.com",
      sessionRev: 7,
    });
    const result = verifyPasswordResetToken(token);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.userId, "usr_1");
      assert.equal(result.payload.email, "ed@example.com");
      assert.equal(result.payload.purpose, "password-reset");
      assert.equal(result.payload.sessionRev, 7);
      assert.equal(result.payload.nonce, payload.nonce);
      assert.equal(result.payload.exp, payload.exp);
    }
  });

  it("tampered token fails signature check", () => {
    const { token } = signPasswordResetToken({ userId: "usr_2", email: "x@y.z", sessionRev: 0 });
    const [b64] = token.split(".");
    const tampered = `${b64}.AAAA`;
    const result = verifyPasswordResetToken(tampered);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_signature");
  });

  it("malformed token (no dot) rejected", () => {
    const result = verifyPasswordResetToken("notatoken");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "malformed_token");
  });

  it("expired token rejected (valid signature, exp in past)", () => {
    const payload = {
      purpose: "password-reset",
      userId: "usr_exp",
      email: "old@x.com",
      sessionRev: 4,
      clientId: null,
      exp: Math.floor(Date.now() / 1000) - 60,
      nonce: "expired-nonce",
    };
    const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
    const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
    const result = verifyPasswordResetToken(`${b64}.${sig}`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "expired");
  });

  it("purpose-less legacy-shaped signed payloads fail closed", () => {
    const payload = {
      userId: "usr_legacy",
      email: "legacy@x.com",
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: "legacy-reset-nonce",
    };
    const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
    const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
    const result = verifyPasswordResetToken(`${b64}.${sig}`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "missing_claims");
  });

  it("legacy reset payloads without an immutable client audience fail closed", () => {
    const payload = {
      purpose: "password-reset",
      userId: "usr_legacy_audience",
      email: "legacy-audience@x.com",
      sessionRev: 0,
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: "legacy-audience-nonce",
    };
    const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
    const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
    const result = verifyPasswordResetToken(`${b64}.${sig}`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "missing_claims");
  });

  it("email-verification and magic-link tokens cannot cross into password reset", () => {
    const emailVerification = signVerifyEmailToken({
      userId: "usr_email_verify",
      email: "verify@example.test",
    });
    assert.equal(verifyVerifyEmailToken(emailVerification.token).ok, true);
    const emailAsReset = verifyPasswordResetToken(emailVerification.token);
    assert.equal(emailAsReset.ok, false);
    if (!emailAsReset.ok) assert.equal(emailAsReset.error, "invalid_purpose");

    const magic = signMagicToken({
      email: "magic@example.test",
      clientId: "client_magic",
      agencyId: "agency_magic",
      sessionRev: 0,
    });
    assert.equal(verifyMagicToken(magic.token).ok, true);
    const magicAsReset = verifyPasswordResetToken(magic.token);
    assert.equal(magicAsReset.ok, false);
    if (!magicAsReset.ok) assert.equal(magicAsReset.error, "invalid_purpose");
  });

  it("password-reset tokens cannot cross into email verification or magic sign-in", () => {
    const reset = signPasswordResetToken({
      userId: "usr_reset_only",
      email: "reset-only@example.test",
      sessionRev: 2,
    });
    assert.equal(verifyPasswordResetToken(reset.token).ok, true);
    const asEmailVerification = verifyVerifyEmailToken(reset.token);
    assert.equal(asEmailVerification.ok, false);
    if (!asEmailVerification.ok) assert.equal(asEmailVerification.error, "invalid_purpose");
    assert.equal(verifyMagicToken(reset.token).ok, false);
  });
});

describe("Password reset — single-use nonce (R038)", () => {
  it("consumeResetNonce: first call true, second call false (single-use)", async () => {
    await _swapStoreForTests(_createMemoryAdapterForTests());
    const { payload } = signPasswordResetToken({ userId: "usr_n1", email: "n1@x.y", sessionRev: 0 });
    const first = await consumeResetNonce(payload.nonce, payload.exp);
    const second = await consumeResetNonce(payload.nonce, payload.exp);
    assert.equal(first, true);
    assert.equal(second, false);
  });

  it("password-reset uses distinct nonce kind tag (cross-kind isolation)", () => {
    const src = readFileSync(
      join(ROOT, "src", "lib", "server", "auth", "passwordReset.ts"),
      "utf8",
    );
    assert.ok(
      src.includes('"password-reset"'),
      "consumeResetNonce must tag nonces with kind 'password-reset' so they can't be replayed against the email-verify or magic-link surfaces",
    );
    const nonceSrc = readFileSync(
      join(ROOT, "src", "lib", "server", "auth", "nonceStore.ts"),
      "utf8",
    );
    assert.ok(
      /NonceKind\s*=\s*[^;]*"password-reset"/.test(nonceSrc),
      "NonceKind union must include 'password-reset'",
    );
  });
});

describe("Password reset — file structure (R038)", () => {
  it("lib/server/passwordReset.ts exports signer/verifier/consumer", () => {
    const p = join(ROOT, "src", "lib", "server", "auth", "passwordReset.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("export function signPasswordResetToken"));
    assert.ok(src.includes("export function verifyPasswordResetToken"));
    assert.ok(src.includes("export async function consumeResetNonce"));
    // Mirror of emailVerification.ts — must NOT have a server-only
    // shim so the smoke + future ports can drive the helper directly.
    // Match the line-level form so my doc comment doesn't trigger.
    assert.ok(!/^\s*import\s+"server-only";?\s*$/m.test(src),
      "passwordReset.ts must not import 'server-only' — smoke driver imports it");
  });

  it("/api/auth/password/request-reset/route.ts rate-limits + no-leak", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "password", "request-reset", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("rateLimit"));
    assert.ok(src.includes("password-reset-request"));
    assert.ok(src.includes("max: 5"));
    assert.ok(src.includes("signPasswordResetToken"));
    assert.ok(src.includes("/login/reset?token="));
    assert.ok(src.includes("devResetUrl"));
    // No-leak: the route must return ok:true when getUser misses,
    // matching the success branch shape so a probing attacker can't
    // distinguish "email exists" from "email doesn't".
    assert.ok(
      /if \(!user\)[\s\S]*?return NextResponse\.json\(\s*\{\s*ok:\s*true\s*\}/.test(src),
      "missing user must still return ok:true (no enumeration leak)",
    );
  });

  it("/api/auth/password/reset/route.ts verifies + consumes + commits a durable exact-user reset", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "password", "reset", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("verifyPasswordResetToken"));
    assert.ok(src.includes("executePasswordReset"));
    assert.ok(src.includes("validatePassword"));
    // setUserPassword bumps sessionRev — load-bearing per chapter #120.
    const operation = readFileSync(
      join(ROOT, "src", "server", "passwordResetOperation.ts"),
      "utf8",
    );
    assert.ok(operation.includes("consumeResetNonce"));
    assert.ok(operation.includes("setUserPasswordById"));
    assert.ok(operation.includes("updateBoundClientPortalPassword"));
    assert.ok(operation.includes("provisionBoundClientPortalIdentity"));
    assert.doesNotMatch(operation, /updateSupabasePassword\(/,
      "reset must never mutate whichever global provider subject shares an email");
    // sessionRev bump is comment-documented at the call site so the
    // security guarantee survives future refactors.
    assert.ok(/sessionRev/.test(src), "must reference sessionRev semantics");
    assert.ok(src.includes('"/login?reset=1"'));
    assert.ok(src.includes("password_reset"));
    // Exact immutable-subject reject now lives in the resumable operation.
    assert.ok(operation.includes("password_reset_invalid"));
    assert.ok(operation.includes("password_reset_subject_changed"));
  });

  it("/login/forgot/page.tsx + ForgotForm.tsx wire to request-reset", () => {
    const page = join(ROOT, "src", "app", "login", "forgot", "page.tsx");
    const form = join(ROOT, "src", "app", "login", "forgot", "ForgotForm.tsx");
    assert.equal(existsSync(page), true);
    assert.equal(existsSync(form), true);
    const pageSrc = readFileSync(page, "utf8");
    assert.ok(pageSrc.includes("mm-auth-shell"));
    assert.ok(pageSrc.includes("getAuthBrand"));
    assert.ok(pageSrc.includes("ForgotForm"));
    assert.ok(pageSrc.includes("brand={brand.id}"));
    const formSrc = readFileSync(form, "utf8");
    assert.ok(formSrc.includes('"use client"'));
    assert.ok(formSrc.includes("/api/auth/password/request-reset"));
    assert.ok(formSrc.includes("devResetUrl"));
    assert.ok(formSrc.includes('data-testid="forgot-form"'));
    assert.ok(formSrc.includes("Check your inbox"));
  });

  it("/login/reset/page.tsx + ResetForm.tsx wire to reset + redirect", () => {
    const page = join(ROOT, "src", "app", "login", "reset", "page.tsx");
    const form = join(ROOT, "src", "app", "login", "reset", "ResetForm.tsx");
    assert.equal(existsSync(page), true);
    assert.equal(existsSync(form), true);
    const pageSrc = readFileSync(page, "utf8");
    assert.ok(pageSrc.includes("mm-auth-shell"));
    assert.ok(pageSrc.includes("getAuthBrand"));
    assert.ok(pageSrc.includes("data-auth-brand={brand.id}"));
    assert.ok(pageSrc.includes("ResetForm"));
    const formSrc = readFileSync(form, "utf8");
    assert.ok(formSrc.includes('"use client"'));
    assert.ok(formSrc.includes("/api/auth/password/reset"));
    assert.ok(formSrc.includes("useSearchParams"));
    // Client-side mismatch validation per the brief.
    assert.ok(formSrc.includes("Passwords don't match"));
    assert.ok(formSrc.includes('data-testid="reset-form"'));
  });

  it("LoginForm exposes a Forgot password? link in password sign-in mode", () => {
    const p = join(ROOT, "src", "app", "login", "LoginForm.tsx");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("const forgotHref = `/login/forgot"));
    assert.ok(src.includes('forgotParams.set("clientId", clientId)'));
    assert.ok(src.includes("mm-form-toggle"),
      "Use the mm-form-toggle class per the Login premium redesign chapter.");
    assert.ok(src.includes('data-testid="login-forgot-link"'));
    // Link only renders for non-magic + signin mode (not signup, not magic).
    assert.ok(/mode === "signin"/.test(src));
  });
});
