// Proving an inbound call webhook really came from Twilio.
//
// This is the only endpoint in the telephony feature that is reachable without
// a session, so it is the only one an attacker can reach at all. Without this
// check, anyone who learns the URL can POST a fabricated `From` number and make
// the caller screen say whatever they like — including making an unknown number
// present itself as a trusted client mid-call.
//
// ── The algorithm, as Twilio defines it ───────────────────────────────────
//
// Take the full request URL exactly as Twilio called it, append every POST
// parameter as `key + value` in lexicographic key order with no separators,
// HMAC-SHA1 that string with the account's auth token, and base64 the result.
// Twilio sends the same thing in `X-Twilio-Signature`.
//
// Kept pure and separate from the route so the comparison can be driven by a
// test with a known-good vector — a signature check that is never exercised is
// indistinguishable from one that always returns true.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signature Twilio should have sent for this request.
 *
 * `url` must be the URL Twilio actually requested, including protocol, host,
 * path and any query string. A proxy that rewrites the host will break this,
 * which is why the route reads the forwarded host rather than assuming.
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulated, key) => accumulated + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(payload, "utf8")).digest("base64");
}

/**
 * Is the supplied signature valid for this request?
 *
 * Compared in constant time. A plain `===` on a signature leaks, through
 * response timing, how many leading bytes were right — which is enough to
 * forge one a byte at a time.
 */
export function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null | undefined;
}): boolean {
  if (!input.signature || !input.authToken) return false;
  const expected = computeTwilioSignature(input.authToken, input.url, input.params);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(input.signature, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // timing signal — so length is checked first and both paths return false.
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}
