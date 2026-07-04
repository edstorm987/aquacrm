// Mock-smoke for the magic-link helpers. Verifies signing/verification,
// expiry, single-use replay rejection, signature mismatch.
//
// Usage:
//   npx tsx --test scripts/smoke-auth-magic.test.ts

import test from "node:test";
import assert from "node:assert/strict";

process.env.PORTAL_SESSION_SECRET = "smoke-secret-magic";

import {
  signMagicToken,
  verifyMagicToken,
  isUsed,
  markUsed,
  _clearUsedForTests,
  registerMagicLinkDelivery,
  deliverMagicLink,
} from "../src/lib/server/magicLink";

test("signMagicToken → verifyMagicToken round-trip", () => {
  const { token, payload } = signMagicToken({ email: "Jane@Example.COM", clientId: "cl_1", agencyId: "ag_1" });
  const r = verifyMagicToken(token);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.email, "jane@example.com");
    assert.equal(r.payload.clientId, "cl_1");
    assert.equal(r.payload.agencyId, "ag_1");
    assert.equal(r.payload.nonce, payload.nonce);
  }
});

test("verifyMagicToken: tampered signature rejected", () => {
  const { token } = signMagicToken({ email: "j@x.com", clientId: "cl_1", agencyId: "ag_1" });
  const dot = token.indexOf(".");
  const tampered = token.slice(0, dot) + "." + "A".repeat(token.length - dot - 1);
  const r = verifyMagicToken(tampered);
  assert.equal(r.ok, false);
});

test("verifyMagicToken: malformed rejected", () => {
  assert.equal(verifyMagicToken("noop").ok, false);
  assert.equal(verifyMagicToken("").ok, false);
  assert.equal(verifyMagicToken(".").ok, false);
});

test("verifyMagicToken: expired payload rejected", () => {
  // Hand-craft an expired payload with a valid signature.
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expired = {
    email: "j@x.com",
    clientId: "cl_1",
    agencyId: "ag_1",
    exp: Math.floor(Date.now() / 1000) - 10,
    nonce: "n1",
  };
  const json = JSON.stringify(expired);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.PORTAL_SESSION_SECRET!).update(b64).digest("base64url");
  const token = `${b64}.${sig}`;
  const r = verifyMagicToken(token);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "expired");
});

test("single-use: mark + replay rejection", () => {
  _clearUsedForTests();
  const { payload } = signMagicToken({ email: "j@x.com", clientId: "cl_1", agencyId: "ag_1" });
  assert.equal(isUsed(payload.nonce), false);
  markUsed(payload.nonce, payload.exp);
  assert.equal(isUsed(payload.nonce), true);
});

test("delivery hook: registered hook is called and reports email-sender via", async () => {
  const calls: unknown[] = [];
  registerMagicLinkDelivery(async input => { calls.push(input); });
  const r = await deliverMagicLink({
    email: "x@y.com", clientId: "c", agencyId: "a", magicUrl: "https://x.test/link",
  });
  assert.equal(r.delivered, true);
  assert.equal(r.via, "email-sender");
  assert.equal(calls.length, 1);
  registerMagicLinkDelivery(null);
});

test("delivery hook: when unregistered falls back to console (delivered:false, via:console)", async () => {
  registerMagicLinkDelivery(null);
  // Silence console.log for the duration of this test.
  const origLog = console.log;
  console.log = () => {};
  try {
    const r = await deliverMagicLink({
      email: "x@y.com", clientId: "c", agencyId: "a", magicUrl: "https://x.test/link",
    });
    assert.equal(r.delivered, false);
    assert.equal(r.via, "console");
  } finally {
    console.log = origLog;
  }
});
