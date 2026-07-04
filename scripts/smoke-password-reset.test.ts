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
//     request-reset and the sessionRev/setUserPassword + redirect on
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
} from "../src/lib/server/passwordReset";
import {
  _swapStoreForTests,
  _createMemoryAdapterForTests,
} from "../src/lib/server/nonceStore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("Password reset — HMAC token (R038)", () => {
  it("sign → verify roundtrip preserves payload", () => {
    const { token, payload } = signPasswordResetToken({
      userId: "usr_1",
      email: "Ed@Example.com",
    });
    const result = verifyPasswordResetToken(token);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.userId, "usr_1");
      assert.equal(result.payload.email, "ed@example.com");
      assert.equal(result.payload.nonce, payload.nonce);
      assert.equal(result.payload.exp, payload.exp);
    }
  });

  it("tampered token fails signature check", () => {
    const { token } = signPasswordResetToken({ userId: "usr_2", email: "x@y.z" });
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
      userId: "usr_exp",
      email: "old@x.com",
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
});

describe("Password reset — single-use nonce (R038)", () => {
  it("consumeResetNonce: first call true, second call false (single-use)", async () => {
    await _swapStoreForTests(_createMemoryAdapterForTests());
    const { payload } = signPasswordResetToken({ userId: "usr_n1", email: "n1@x.y" });
    const first = await consumeResetNonce(payload.nonce, payload.exp);
    const second = await consumeResetNonce(payload.nonce, payload.exp);
    assert.equal(first, true);
    assert.equal(second, false);
  });

  it("password-reset uses distinct nonce kind tag (cross-kind isolation)", () => {
    const src = readFileSync(
      join(ROOT, "src", "lib", "server", "passwordReset.ts"),
      "utf8",
    );
    assert.ok(
      src.includes('"password-reset"'),
      "consumeResetNonce must tag nonces with kind 'password-reset' so they can't be replayed against the email-verify or magic-link surfaces",
    );
    const nonceSrc = readFileSync(
      join(ROOT, "src", "lib", "server", "nonceStore.ts"),
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
    const p = join(ROOT, "src", "lib", "server", "passwordReset.ts");
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

  it("/api/auth/password/reset/route.ts verifies + consumes + setUserPassword + redirect", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "password", "reset", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("verifyPasswordResetToken"));
    assert.ok(src.includes("consumeResetNonce"));
    assert.ok(src.includes("validatePassword"));
    // setUserPassword bumps sessionRev — load-bearing per chapter #120.
    assert.ok(src.includes("setUserPassword"));
    // sessionRev bump is comment-documented at the call site so the
    // security guarantee survives future refactors.
    assert.ok(/sessionRev/.test(src), "must reference sessionRev semantics");
    assert.ok(src.includes('"/login?reset=1"'));
    assert.ok(src.includes("password_reset"));
    // Defensive email-mismatch reject (token tampered to swap users).
    assert.ok(src.includes("email_mismatch"));
  });

  it("/login/forgot/page.tsx + ForgotForm.tsx wire to request-reset", () => {
    const page = join(ROOT, "src", "app", "login", "forgot", "page.tsx");
    const form = join(ROOT, "src", "app", "login", "forgot", "ForgotForm.tsx");
    assert.equal(existsSync(page), true);
    assert.equal(existsSync(form), true);
    const pageSrc = readFileSync(page, "utf8");
    assert.ok(pageSrc.includes("SiteShell"));
    assert.ok(pageSrc.includes("ForgotForm"));
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
    assert.ok(pageSrc.includes("SiteShell"));
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
    assert.ok(src.includes('href="/login/forgot"'));
    assert.ok(src.includes("mm-form-toggle"),
      "Use the mm-form-toggle class per the Login premium redesign chapter.");
    assert.ok(src.includes('data-testid="login-forgot-link"'));
    // Link only renders for non-magic + signin mode (not signup, not magic).
    assert.ok(/mode === "signin"/.test(src));
  });
});
