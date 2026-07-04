import "server-only";
// Lightweight in-memory rate limiter — protects login + future plugin
// public ingest endpoints from trivial brute-force.
//
// Process-local: resets on cold starts and isn't shared across serverless
// instances. Good enough to slow simple attacks; production-grade
// distributed rate limiting will switch to a KV/Redis-backed counter
// when the storage layer adds the kv backend.

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();

function gc(now: number) {
  if (buckets.size < 1000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export interface RateLimitOpts { key: string; max: number; windowMs: number }

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export function rateLimit({ key, max, windowMs }: RateLimitOpts): RateLimitResult {
  const now = Date.now();
  gc(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    const next: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: max - 1, resetAt: next.resetAt, retryAfterSec: 0 };
  }
  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt, retryAfterSec: 0 };
}

// ─── Login lockout — R021 ───────────────────────────────────────────────
//
// 10 failed attempts on the same {ip, email} pair within 5 minutes →
// 5-minute lockout extension. Distinct from the per-call rateLimit because
// it tracks FAILURES not all attempts (good signins reset the counter).

const LOGIN_FAIL_THRESHOLD = 10;
const LOGIN_FAIL_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

interface LoginFailRecord {
  count: number;
  windowResetAt: number;
  lockedUntil: number;
}

const loginFails = new Map<string, LoginFailRecord>();

function loginFailKey(ip: string, email: string): string {
  return `loginfail:${ip}|${email.trim().toLowerCase()}`;
}

export function isLoginLocked(input: { ip: string; email: string }): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const rec = loginFails.get(loginFailKey(input.ip, input.email));
  if (!rec || rec.lockedUntil < now) return { locked: false, retryAfterSec: 0 };
  return { locked: true, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
}

export function recordLoginFailure(input: { ip: string; email: string }): { lockedNow: boolean } {
  const now = Date.now();
  const key = loginFailKey(input.ip, input.email);
  const existing = loginFails.get(key);
  if (!existing || existing.windowResetAt < now) {
    loginFails.set(key, { count: 1, windowResetAt: now + LOGIN_FAIL_WINDOW_MS, lockedUntil: 0 });
    return { lockedNow: false };
  }
  existing.count += 1;
  if (existing.count >= LOGIN_FAIL_THRESHOLD) {
    existing.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return { lockedNow: true };
  }
  return { lockedNow: false };
}

export function recordLoginSuccess(input: { ip: string; email: string }): void {
  loginFails.delete(loginFailKey(input.ip, input.email));
}

// ─── Sweep — R021 ────────────────────────────────────────────────────────
// Lazy expiry sweep over both stores. Sessions are stateless HMAC tokens —
// they auto-expire on verify so no session-list pruning is needed (chapter
// #68 honesty). Buckets + login-fail records are explicitly pruned here.
export interface SweepStats {
  rateLimitBuckets: { before: number; after: number };
  loginFails: { before: number; after: number };
  // R028: durable nonce GC. `deleted` is the count `gcExpiredNonces`
  // pruned from the active adapter (memory or Postgres).
  nonces: { deleted: number };
  ranAt: number;
}

export async function sweepExpired(): Promise<SweepStats> {
  const now = Date.now();
  const rlBefore = buckets.size;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
  const lfBefore = loginFails.size;
  for (const [k, r] of loginFails) {
    if (r.lockedUntil < now && r.windowResetAt < now) loginFails.delete(k);
  }
  // R028: nonce GC via the durable store. Lazy-imported so rateLimit
  // stays small + tsx --test smokes that don't touch nonces aren't
  // forced to load the adapter.
  let nonceDeleted = 0;
  try {
    const { getNonceStore } = await import("./nonceStore");
    nonceDeleted = await getNonceStore().gcExpiredNonces(now);
  } catch (e) {
    // GC is best-effort — surface failures via the warn channel.
    if (process.env.NODE_ENV !== "test") {
      console.warn("[sweep] nonce GC failed:", e instanceof Error ? e.message : e);
    }
  }
  return {
    rateLimitBuckets: { before: rlBefore, after: buckets.size },
    loginFails: { before: lfBefore, after: loginFails.size },
    nonces: { deleted: nonceDeleted },
    ranAt: now,
  };
}

export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "anonymous";
}
