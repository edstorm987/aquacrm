import "server-only";

import type { PluginStorage } from "../lib/aquaPluginTypes";

const STORE_KEY = "storefront-rate-limit:v1";
const LOCK_KEY = "storefront-rate-limit";

interface StoredBucket {
  count: number;
  resetAt: number;
}

type StoredBuckets = Record<string, StoredBucket>;

export interface StorefrontRateLimitInput {
  action: "catalogue" | "quote" | "checkout" | "order";
  clientIp: string;
  max: number;
  windowMs: number;
  now?: number;
}

export interface StorefrontRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

function cleanBucket(value: unknown): StoredBucket | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const count = Number(row.count);
  const resetAt = Number(row.resetAt);
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(resetAt) || resetAt < 0) return null;
  return { count, resetAt };
}

function cleanBuckets(value: unknown, now: number): StoredBuckets {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cleaned: StoredBuckets = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const bucket = cleanBucket(raw);
    if (bucket && bucket.resetAt > now) cleaned[key] = bucket;
  }
  return cleaned;
}

function bucketKey(input: Pick<StorefrontRateLimitInput, "action" | "clientIp">): string {
  // The provider-normalised address remains private inside the install's
  // server-side storage. Length is bounded so a hostile header cannot turn
  // the limiter record into an unbounded key.
  return `${input.action}:${input.clientIp.trim().slice(0, 200) || "anonymous"}`;
}

/**
 * Take one rate-limit token from shared, durable per-install storage.
 *
 * `makePluginStorage().runExclusive` refreshes, locks and flushes this record
 * across application processes. There is deliberately no unlocked fallback:
 * silently degrading this public security control to a racy read-modify-write
 * would let concurrent instances exceed the configured limit.
 */
export async function takeStorefrontRateLimit(
  storage: PluginStorage,
  input: StorefrontRateLimitInput,
): Promise<StorefrontRateLimitResult> {
  if (!storage.runExclusive) {
    throw new Error("storefront_rate_limit_requires_exclusive_storage");
  }
  const operation = async (): Promise<StorefrontRateLimitResult> => {
    const now = input.now ?? Date.now();
    const buckets = cleanBuckets(await storage.get<unknown>(STORE_KEY), now);
    const key = bucketKey(input);
    const existing = buckets[key];

    if (!existing) {
      const next = { count: 1, resetAt: now + input.windowMs };
      buckets[key] = next;
      await storage.set(STORE_KEY, buckets);
      return {
        allowed: true,
        remaining: Math.max(0, input.max - 1),
        resetAt: next.resetAt,
        retryAfterSec: 0,
      };
    }

    if (existing.count >= input.max) {
      // Persist the pruned map even on refusal so expired identities do not
      // accumulate forever under a busy install.
      await storage.set(STORE_KEY, buckets);
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      };
    }

    const next = { ...existing, count: existing.count + 1 };
    buckets[key] = next;
    await storage.set(STORE_KEY, buckets);
    return {
      allowed: true,
      remaining: Math.max(0, input.max - next.count),
      resetAt: next.resetAt,
      retryAfterSec: 0,
    };
  };

  return storage.runExclusive(LOCK_KEY, operation);
}
