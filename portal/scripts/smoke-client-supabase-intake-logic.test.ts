// Pure-logic proof for the client-owned intake/read Edge Functions.
//
// The Edge Functions run under Deno against a live Supabase project, which no CI
// here can stand up. But their SECURITY-CRITICAL logic — card-number rejection,
// the strict field allowlist, and the HMAC that authenticates every read — is
// pure and Web-standard, factored into `functions/_shared/intake-logic.ts`. This
// exercises exactly that module in Node, so the checks that must be right can be
// proven without Deno, and can be adversarially re-run by an independent pass.
//
// It also pins the HMAC/hash to Node's own `node:crypto` output — the intake
// function signs with Web Crypto, while the Aqua reader and webhook route verify
// with `node:crypto`, so the two MUST agree byte for byte or a real submission's
// pointer would never verify.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  luhnValid,
  looksLikePan,
  validateSubmission,
  hmacHex,
  sha256Hex,
  timingSafeEqualHex,
  type AllowedField,
} from "../client-supabase-bundle/functions/_shared/intake-logic.ts";

test("Luhn accepts real card lengths and rejects a tampered digit", () => {
  assert.equal(luhnValid("4111111111111111"), true, "a 16-digit Visa test number is Luhn-valid");
  assert.equal(luhnValid("4222222222222"), true, "a 13-digit Visa test number is Luhn-valid");
  assert.equal(luhnValid("4111111111111112"), false, "one changed digit breaks Luhn");
  assert.equal(luhnValid("12345"), false, "too short to be a card number");
});

test("PAN screening catches formatted card numbers and spares ordinary numbers", () => {
  assert.equal(looksLikePan("4111111111111111"), true, "a bare PAN is caught");
  assert.equal(looksLikePan("4111 1111 1111 1111"), true, "a space-grouped PAN is caught");
  assert.equal(looksLikePan("4111-1111-1111-1111"), true, "a dash-grouped PAN is caught");
  assert.equal(looksLikePan("my card is 4111111111111111 thanks"), true, "a PAN embedded in text is caught");
  assert.equal(looksLikePan("4222222222222"), true, "a 13-digit PAN is caught");
  // The Luhn gate is what stops false positives on ordinary long numbers.
  assert.equal(looksLikePan("4111111111111112"), false, "a 16-digit non-Luhn reference is not a PAN");
  assert.equal(looksLikePan("order 12345 placed 2026"), false, "short numbers are not PANs");
  assert.equal(looksLikePan("call +1 415 555 0100"), false, "a phone number is not a PAN");
});

const ALLOWED: AllowedField[] = [
  { key: "name", required: true, maxLength: 100 },
  { key: "email", type: "email", maxLength: 200 },
  { key: "phone", type: "tel" },
  { key: "message", maxLength: 2000 },
];

test("the field allowlist accepts a clean submission and trims it", () => {
  const r = validateSubmission(ALLOWED, { name: "  Ada  ", email: "ada@example.com", message: "hi" }, 100_000);
  assert.ok(r.ok, "a valid submission passes");
  assert.deepEqual(r.clean, { name: "Ada", email: "ada@example.com", message: "hi" }, "values are trimmed and only allowed keys kept");
});

test("the field allowlist rejects everything it must, before persistence", () => {
  const cases: Array<[string, Record<string, unknown>, number]> = [
    ["an unknown field", { name: "Ada", evil: "x" }, 422],
    ["a missing required field", { email: "ada@example.com" }, 422],
    ["a malformed email", { name: "Ada", email: "not-an-email" }, 422],
    ["a malformed phone", { name: "Ada", phone: "abc" }, 422],
    ["a card number in a free-text field", { name: "Ada", message: "pay 4111 1111 1111 1111" }, 422],
    ["an over-length field", { name: "x".repeat(101) }, 422],
    ["a non-string value", { name: 12345 as unknown as string }, 422],
    ["an entirely empty submission", {}, 422],
  ];
  for (const [label, body, status] of cases) {
    const r = validateSubmission(ALLOWED, body, 100_000);
    assert.equal(r.ok, false, `${label} must be rejected`);
    if (!r.ok) assert.equal(r.status, status, `${label} must answer ${status}`);
  }
});

test("the total-byte ceiling answers 413 distinctly from a content rejection", () => {
  const allowed: AllowedField[] = [{ key: "a", maxLength: 100 }, { key: "b", maxLength: 100 }];
  const r = validateSubmission(allowed, { a: "hello", b: "world" }, 5);
  assert.equal(r.ok, false, "a submission over the byte ceiling is rejected");
  if (!r.ok) assert.equal(r.status, 413, "the ceiling is a 413, not a 422");
});

test("the HMAC and hash match node:crypto exactly, so both sides of the boundary agree", async () => {
  const secret = "a-per-site-read-secret-value";
  const message = "1699999999999.nonce-abc.submission-42";
  const web = await hmacHex(secret, message);
  const node = crypto.createHmac("sha256", secret).update(message).digest("hex");
  assert.equal(web, node, "Web Crypto HMAC must equal node:crypto HMAC — the reader verifies with node:crypto");
  assert.notEqual(await hmacHex("different-secret", message), node, "a different secret must produce a different signature");

  const s = await sha256Hex("aqua-intake:contact:203.0.113.7");
  assert.equal(s, crypto.createHash("sha256").update("aqua-intake:contact:203.0.113.7").digest("hex"), "sha256 must match node:crypto");
});

test("the constant-time hex compare is length-safe and correct", () => {
  const sig = "deadbeefcafef00d";
  assert.equal(timingSafeEqualHex(sig, sig), true, "identical signatures compare equal");
  assert.equal(timingSafeEqualHex(sig, "deadbeefcafef00e"), false, "a one-character difference is not equal");
  assert.equal(timingSafeEqualHex(sig, "deadbeef"), false, "unequal lengths are not equal, and must not throw");
});
