// T1 R021 smoke — CSRF + login lockout + sweep + session rotation.
// Run via `npm run smoke:session-security` (tsx --test).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signCsrfToken, verifyCsrfToken } from "../src/lib/server/csrf";

// rateLimit.ts has `import "server-only"` so we can't import it from a
// node:test smoke. We exercise its logic indirectly by verifying the
// helper exports + behaviour markers are present in source. The CSRF
// module has no `server-only` shim → roundtrip-tested directly above.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

describe("CSRF token (R021)", () => {
  it("sign → verify roundtrip preserves nonce + exp", () => {
    const { token, payload } = signCsrfToken();
    const back = verifyCsrfToken(token);
    assert.ok(back);
    if (back) {
      assert.equal(back.nonce, payload.nonce);
      assert.equal(back.exp, payload.exp);
    }
  });

  it("tampered token fails", () => {
    const { token } = signCsrfToken();
    const [b64] = token.split(".");
    assert.equal(verifyCsrfToken(`${b64}.AAAA`), null);
  });

  it("malformed token (no dot) rejected", () => {
    assert.equal(verifyCsrfToken("nope"), null);
  });

  it("undefined token rejected", () => {
    assert.equal(verifyCsrfToken(undefined), null);
  });
});

describe("Login lockout + sweep — source markers (R021)", () => {
  it("rateLimit.ts exports isLoginLocked / recordLoginFailure / recordLoginSuccess / sweepExpired", () => {
    const p = join(ROOT, "src", "lib", "server", "rateLimit.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("export function isLoginLocked"));
    assert.ok(src.includes("export function recordLoginFailure"));
    assert.ok(src.includes("export function recordLoginSuccess"));
    // R028 made sweepExpired async (nonce GC awaits the durable store).
    assert.ok(src.match(/export async function sweepExpired/));
  });

  it("rateLimit.ts uses 10-attempt threshold + 5min window + 5min lockout", () => {
    const p = join(ROOT, "src", "lib", "server", "rateLimit.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("LOGIN_FAIL_THRESHOLD = 10"));
    assert.ok(/LOGIN_FAIL_WINDOW_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/.test(src));
    assert.ok(/LOGIN_LOCKOUT_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/.test(src));
  });

  it("sweepExpired returns SweepStats shape (rateLimitBuckets + loginFails + ranAt)", () => {
    const p = join(ROOT, "src", "lib", "server", "rateLimit.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("rateLimitBuckets:"));
    assert.ok(src.includes("loginFails:"));
    assert.ok(src.includes("ranAt:"));
  });
});

describe("File structure (R021)", () => {
  it("/api/auth/csrf/route.ts exists + GET issues token + cookie", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "csrf", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("signCsrfToken"));
    assert.ok(src.includes("res.cookies.set"));
  });

  it("/api/internal/sweep/route.ts exists + founder-gated", () => {
    const p = join(ROOT, "src", "app", "api", "internal", "sweep", "route.ts");
    assert.equal(existsSync(p), true);
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes('requireRole("agency-owner")'));
    assert.ok(src.includes("sweepExpired"));
  });

  it("login route wires lockout helpers", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "login", "route.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("isLoginLocked"));
    assert.ok(src.includes("recordLoginFailure"));
    assert.ok(src.includes("recordLoginSuccess"));
    assert.ok(src.includes("sessionRev: user.sessionRev"));
  });

  it("signup route stamps sessionRev on issued session", () => {
    const p = join(ROOT, "src", "app", "api", "auth", "signup", "route.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("sessionRev: user.sessionRev"));
  });

  it("auth.ts exports isSessionFresh + threads sessionRev through issueSession", () => {
    const p = join(ROOT, "src", "lib", "server", "auth.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("export function isSessionFresh"));
    assert.ok(src.includes("sessionRev: input.sessionRev"));
  });

  it("users.ts exports rotateUserSession + bumps on password/role change", () => {
    const p = join(ROOT, "src", "server", "users.ts");
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("export function rotateUserSession"));
    // setUserPassword bumps sessionRev
    assert.ok(/sessionRev:\s*\(stored\.sessionRev\s*\?\?\s*0\)\s*\+\s*1/.test(src));
    // updateUser bumps on role/clientId change
    assert.ok(src.includes("roleOrScopeChanged"));
  });
});
