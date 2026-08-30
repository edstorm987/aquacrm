// The inbound call webhook — the one telephony endpoint with no session.
//
// Everything else in this feature sits behind `requireRole`. This does not:
// Twilio POSTs to it from the public internet while a phone is ringing. So the
// signature check is not a formality, it is the entire boundary. Unverified,
// anyone who learns the URL can POST a chosen `From` and make the caller screen
// introduce a stranger as a trusted client, in the two seconds before Ed says
// hello.
//
// A signature check that is never exercised is indistinguishable from one that
// always returns true, so these run the real algorithm against real vectors.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { computeTwilioSignature, verifyTwilioSignature } from "../src/lib/telephony/twilioSignature";

const TOKEN = "12345678901234567890123456789012";
const URL_ = "https://aquacrm.example.com/api/webhooks/twilio/voice";
const PARAMS = { CallSid: "CA123", From: "+447700900123", To: "+441204123456" };

function sign(token: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", token).update(Buffer.from(payload, "utf8")).digest("base64");
}

describe("the Twilio signature algorithm", () => {
  it("matches an independently computed HMAC", () => {
    // Computed here from Twilio's published rule rather than from the
    // implementation, so a bug in the implementation cannot define the answer.
    assert.equal(computeTwilioSignature(TOKEN, URL_, PARAMS), sign(TOKEN, URL_, PARAMS));
  });

  it("sorts parameters by key — insertion order must not change the result", () => {
    const reordered = { To: PARAMS.To, CallSid: PARAMS.CallSid, From: PARAMS.From };
    assert.equal(computeTwilioSignature(TOKEN, URL_, reordered), computeTwilioSignature(TOKEN, URL_, PARAMS));
  });

  it("covers the URL, so a signature cannot be replayed at another endpoint", () => {
    const elsewhere = "https://aquacrm.example.com/api/webhooks/twilio/other";
    assert.notEqual(computeTwilioSignature(TOKEN, elsewhere, PARAMS), computeTwilioSignature(TOKEN, URL_, PARAMS));
  });

  it("covers every parameter, so `From` cannot be swapped after signing", () => {
    const spoofed = { ...PARAMS, From: "+447700900999" };
    assert.notEqual(computeTwilioSignature(TOKEN, URL_, spoofed), computeTwilioSignature(TOKEN, URL_, PARAMS));
  });
});

describe("verification", () => {
  const signature = sign(TOKEN, URL_, PARAMS);

  it("accepts a genuine request", () => {
    assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: PARAMS, signature }), true);
  });

  it("rejects a forged caller number", () => {
    // The attack this exists to stop.
    const spoofed = { ...PARAMS, From: "+447700900999" };
    assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: spoofed, signature }), false);
  });

  it("rejects a signature from a different account's token", () => {
    const other = sign("99999999999999999999999999999999", URL_, PARAMS);
    assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: PARAMS, signature: other }), false);
  });

  it("rejects a missing signature rather than treating absence as valid", () => {
    for (const signature of [null, undefined, ""]) {
      assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: PARAMS, signature }), false);
    }
  });

  it("rejects when no auth token is configured", () => {
    // A connection with no token must fail closed, never open.
    assert.equal(verifyTwilioSignature({ authToken: "", url: URL_, params: PARAMS, signature }), false);
  });

  it("does not throw on a wrong-length signature", () => {
    // timingSafeEqual throws on length mismatch; that must be handled, because
    // a 500 here is a dropped call.
    assert.doesNotThrow(() => verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: PARAMS, signature: "short" }));
    assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_, params: PARAMS, signature: "short" }), false);
  });
});

describe("the webhook route", () => {
  const source = readFileSync("src/app/api/webhooks/twilio/voice/route.ts", "utf8");
  // Ordering is asserted inside the HANDLER only. Searching the whole file
  // would match the import block instead of the call sites and quietly pass
  // whatever the handler actually does.
  const handler = source.slice(source.indexOf("export async function POST"));

  it("verifies before it trusts anything in the body", () => {
    const verifyAt = handler.indexOf("verifyTwilioSignature({");
    const resolveAt = handler.indexOf("resolveCaller(");
    const logAt = handler.indexOf("logActivity(");
    assert.ok(verifyAt > 0, "the handler must verify the signature");
    assert.ok(resolveAt > 0 && verifyAt < resolveAt, "identification must not happen before verification");
    assert.ok(logAt > 0 && verifyAt < logAt, "nothing may be logged from an unverified body");
  });

  it("returns before identifying when verification fails", () => {
    // Ordering alone is not enough — a failed check must actually stop.
    const between = handler.slice(handler.indexOf("verifyTwilioSignature({"), handler.indexOf("resolveCaller("));
    assert.match(between, /if \(!verified\)[\s\S]*?return /,
      "a bad signature must return, not merely be noted");
  });

  it("rejects an unknown `To` without consulting any secret", () => {
    const matchAt = handler.indexOf("connectionForNumber(to)");
    const verifyAt = handler.indexOf("verifyTwilioSignature({");
    assert.ok(matchAt > 0, "the handler must look the number up");
    assert.ok(matchAt < verifyAt,
      "a number that is not ours must be turned away before a token is read");
  });

  it("answers a rejected signature with 401 and no TwiML", () => {
    assert.match(source, /invalid_twilio_signature/);
    assert.match(source, /status: 401/);
  });

  it("never leaks an internal error into a live call", () => {
    assert.match(source, /catch \{[\s\S]*?return say\(/,
      "an exception must become spoken words, not a stack trace or a silent line");
  });

  it("records WHICH of your numbers was rung", () => {
    // Burner sales lines and the official line are different conversations;
    // flattening them into one inbox loses the only thing that distinguishes
    // a cold callback from a client calling the number on their invoice.
    assert.match(source, /to: normalisePhone\(to\)/);
    assert.match(source, /connectionId: match\.connectionId/);
  });

  it("forwards to the handset showing the CALLER's number", () => {
    // So the phone's own screen agrees with what AquaCRM just recorded.
    assert.match(source, /callerId="\$\{escapeXml\(callerId\)\}"/);
  });
});
