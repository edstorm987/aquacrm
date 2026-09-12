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
  signClientPortalInviteToken,
  verifyMagicToken,
  isUsed,
  markUsed,
  _clearUsedForTests,
  registerMagicLinkDelivery,
  deliverMagicLink,
  magicLinkDeliveryOperationRef,
  magicLinkSessionRevision,
} from "../src/lib/server/auth/magicLink";

test("signMagicToken → verifyMagicToken round-trip", () => {
  const { token, payload } = signMagicToken({ email: "Jane@Example.COM", clientId: "cl_1", agencyId: "ag_1" });
  const r = verifyMagicToken(token);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.payload.email, "jane@example.com");
    assert.equal(r.payload.clientId, "cl_1");
    assert.equal(r.payload.agencyId, "ag_1");
    assert.equal(r.payload.purpose, "sign-in");
    assert.equal(r.payload.nonce, payload.nonce);
  }
});

test("client portal invitations carry a distinct, signed admission purpose", () => {
  const { token } = signClientPortalInviteToken({
    email: "Jane@Example.COM",
    clientId: "cl_1",
    agencyId: "ag_1",
  });
  const result = verifyMagicToken(token);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.purpose, "client-portal-invite");
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
    purpose: "sign-in",
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

test("verifyMagicToken: legacy purpose-less tokens fail closed", () => {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const legacy = {
    email: "j@x.com",
    clientId: "cl_1",
    agencyId: "ag_1",
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: "legacy-nonce",
  };
  const b64 = Buffer.from(JSON.stringify(legacy), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.PORTAL_SESSION_SECRET!).update(b64).digest("base64url");
  const result = verifyMagicToken(`${b64}.${sig}`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "missing_claims");
});

test("single-use: mark + replay rejection", () => {
  _clearUsedForTests();
  const { payload } = signMagicToken({ email: "j@x.com", clientId: "cl_1", agencyId: "ag_1" });
  assert.equal(isUsed(payload.nonce), false);
  markUsed(payload.nonce, payload.exp);
  assert.equal(isUsed(payload.nonce), true);
});

test("magic-link sessions preserve the current user sessionRev", () => {
  assert.equal(magicLinkSessionRevision({ sessionRev: 12 }), 12);
  assert.equal(magicLinkSessionRevision({}), 0);
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
  assert.equal(typeof (calls[0] as { operationRef?: unknown }).operationRef, "string");
  registerMagicLinkDelivery(null);
});

test("delivery ambiguity retries the same token generation with the same provider operation key", async () => {
  registerMagicLinkDelivery(null);
  const { token } = signMagicToken({
    email: "Retry@Example.test",
    clientId: "client_retry",
    agencyId: "agency_retry",
  });
  const input = {
    email: "retry@example.test",
    clientId: "client_retry",
    agencyId: "agency_retry",
    magicUrl: `https://portal.example.test/login/magic?token=${encodeURIComponent(token)}`,
  };
  const refs: string[] = [];
  let attempt = 0;
  const sendEmail: typeof import("../src/lib/server/email/transactionalEmail").sendTransactionalEmail = async sent => {
    refs.push(sent.externalRef);
    attempt += 1;
    return attempt === 1
      ? {
          delivered: false,
          via: "resend",
          reason: "provider response lost",
          code: "REMOTE_OPERATION_TIMEOUT",
          outcomeUnknown: true,
          retry: "same-operation-key",
        }
      : { delivered: true, via: "resend", externalMessageId: "msg_retry" };
  };
  const origLog = console.log;
  console.log = () => {};
  try {
    const lost = await deliverMagicLink(input, { sendEmail });
    assert.equal(lost.delivered, false);
    assert.equal(lost.outcomeUnknown, true);
    assert.equal(lost.retry, "same-operation-key");
    const retried = await deliverMagicLink(input, { sendEmail });
    assert.equal(retried.delivered, true);
    assert.equal(refs.length, 2);
    assert.equal(refs[0], refs[1]);
    assert.equal(lost.operationRef, retried.operationRef);
    assert.equal(lost.operationRef, magicLinkDeliveryOperationRef(input));
    assert.doesNotMatch(lost.operationRef, /retry@example\.test/);
    assert.ok(!lost.operationRef.includes(token), "provider key must not contain the bearer token");
  } finally {
    console.log = origLog;
  }
});

test("a subsequent genuinely new magic request receives a different provider operation key", async () => {
  registerMagicLinkDelivery(null);
  const subject = {
    email: "new-request@example.test",
    clientId: "client_new_request",
    agencyId: "agency_new_request",
  };
  const firstToken = signMagicToken(subject).token;
  const secondToken = signMagicToken(subject).token;
  assert.notEqual(firstToken, secondToken, "each request must mint a fresh nonce");
  const first = magicLinkDeliveryOperationRef({
    ...subject,
    magicUrl: `https://portal.example.test/login/magic?token=${encodeURIComponent(firstToken)}`,
  });
  const second = magicLinkDeliveryOperationRef({
    ...subject,
    magicUrl: `https://portal.example.test/login/magic?token=${encodeURIComponent(secondToken)}`,
  });
  assert.notEqual(first, second, "provider dedupe must not suppress a later legitimate link");
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
