// Shared idempotency for the finance money-CREATE surface.
//
// The problem: every create path (payments, income, plans, invoices, payroll,
// close-deal) minted a fresh `makeId(...)` on every call, so a double-click or
// a network retry recorded a SECOND record → money silently double-counted.
//
// The mechanism — one, reused everywhere: a caller supplies a one-time
// idempotency key per *intent*, and the record's id is DERIVED from that key
// instead of random. Same key → same id → the second write lands on the same
// storage slot and overwrites, so it can never become a duplicate row — even if
// two submits race in parallel (a plain "have I seen this key?" check races
// between its read and its write; a deterministic id does not). This reuses the
// exact "stable reference" idea the Stripe path already relies on
// (`findByExternalRef` dedupes a redelivered webhook on the PaymentIntent; the
// delight wire dedupes on `reference: delight:<id>`) — generalised to the whole
// create-surface, not a parallel scheme.
//
// The nuance it MUST preserve: recording *multiple* payments against one invoice
// is legitimate (partial payments). A genuine second payment is a new intent →
// a new key → a new id → recorded normally. Dedup only ever collapses a resubmit
// of the SAME key. No time window, no (invoice, amount) guessing — so two honest
// identical instalments are never wrongly merged.

import { makeId } from "./ids";

// cyrb128 — a small, fast, deterministic 128-bit string hash. This is NOT a
// security primitive (it authenticates nothing); it only turns an arbitrary
// idempotency key into a stable, collision-resistant, fixed-width id suffix.
// 128 bits is far more than enough to keep distinct keys on distinct ids.
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// Bound + normalise a client-supplied key so a stray value can't blow up the id
// space. Empty/whitespace → treated as absent (no dedup).
export function normaliseIdempotencyKey(key: string | undefined | null): string | undefined {
  if (typeof key !== "string") return undefined;
  const trimmed = key.trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : undefined;
}

// The one shared id factory. With a key, the id is deterministic (`<prefix>_<32
// hex>`) so a resubmit collapses onto the same record; without one, it's a fresh
// random id — identical behaviour to the old `makeId(prefix)` call it replaces,
// so callers that don't (yet) pass a key are unchanged.
export function deriveRecordId(prefix: string, idempotencyKey?: string | null): string {
  const key = normaliseIdempotencyKey(idempotencyKey);
  if (!key) return makeId(prefix);
  // Namespace the hash by prefix so the same key on two different record kinds
  // (e.g. a close-deal contract vs its invoice) never collides.
  const hex = cyrb128(`${prefix}:${key}`)
    .map(n => n.toString(16).padStart(8, "0"))
    .join("");
  return `${prefix}_${hex}`;
}
