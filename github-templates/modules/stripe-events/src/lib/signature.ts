// Stripe webhook signature verifier. Pure — uses Web Crypto API
// (available in Node ≥ 20 + edge runtimes). No `crypto` Node-only
// dep so the plugin runs in the same places the rest of the
// foundation runs.

export interface VerifyArgs {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  // Tolerance window in seconds. Stripe recommends 300s.
  toleranceS: number;
  // Override "now" for deterministic tests.
  nowS?: number;
}

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_signature" | "invalid_signature_format" | "missing_secret" | "signature_mismatch" | "timestamp_too_old" };

// Constant-time hex-string comparison.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export async function computeStripeHmacHex(secret: string, payload: string): Promise<string> {
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto API not available");
  const enc = new TextEncoder();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"],
  );
  const sig = await cryptoApi.subtle.sign("HMAC", key, enc.encode(payload));
  return bytesToHex(sig);
}

import { parseStripeSignature } from "./domain";

export async function verifyStripeSignature(args: VerifyArgs): Promise<VerifyResult> {
  if (!args.signatureHeader) return { ok: false, reason: "missing_signature" };
  if (!args.secret) return { ok: false, reason: "missing_secret" };
  const parsed = parseStripeSignature(args.signatureHeader);
  if (!parsed) return { ok: false, reason: "invalid_signature_format" };
  const nowS = args.nowS ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - parsed.timestamp) > args.toleranceS) {
    return { ok: false, reason: "timestamp_too_old" };
  }
  const payload = `${parsed.timestamp}.${args.rawBody}`;
  const expected = await computeStripeHmacHex(args.secret, payload);
  for (const candidate of parsed.v1) {
    if (timingSafeEqualHex(candidate, expected)) {
      return { ok: true, timestamp: parsed.timestamp };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}
