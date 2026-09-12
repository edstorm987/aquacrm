import "server-only";

import { createHash } from "node:crypto";

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

export interface StorefrontRateLimitDimension {
  /** Server-generated label only. Caller-controlled values must be digested. */
  key: string;
  max: number;
}

export interface StorefrontRateLimitDimensionsInput {
  action: StorefrontRateLimitInput["action"];
  dimensions: StorefrontRateLimitDimension[];
  windowMs: number;
  now?: number;
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

export function storefrontRateLimitDimension(label: string, value: string): string {
  const safeLabel = label.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "scope";
  const digest = createHash("sha256")
    .update(`aqua-storefront-rate-limit:v1\u0000${safeLabel}\u0000${value.trim() || "anonymous"}`)
    .digest("hex");
  return `${safeLabel}:${digest}`;
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
  return takeStorefrontRateLimitDimensions(storage, {
    action: input.action,
    dimensions: [{ key: storefrontRateLimitDimension("ip", input.clientIp), max: input.max }],
    windowMs: input.windowMs,
    now: input.now,
  });
}

/**
 * Atomically spend every server-derived abuse dimension, or none of them.
 * Checkout uses this after human proof and an authoritative server quote so a
 * single address cannot fan out across IPs, a single IP cannot drain many
 * SKUs, and provider/session creation has its own install-scoped ceiling.
 */
export async function takeStorefrontRateLimitDimensions(
  storage: PluginStorage,
  input: StorefrontRateLimitDimensionsInput,
): Promise<StorefrontRateLimitResult> {
  if (!storage.runExclusive) {
    throw new Error("storefront_rate_limit_requires_exclusive_storage");
  }
  const operation = async (): Promise<StorefrontRateLimitResult> => {
    const now = input.now ?? Date.now();
    const buckets = cleanBuckets(await storage.get<unknown>(STORE_KEY), now);
    const dimensions = new Map<string, number>();
    for (const dimension of input.dimensions.slice(0, 64)) {
      const key = `${input.action}:${dimension.key.trim().slice(0, 120)}`;
      if (!dimension.key.trim() || !Number.isSafeInteger(dimension.max) || dimension.max < 1) {
        throw new Error("storefront_rate_limit_dimension_invalid");
      }
      dimensions.set(key, Math.min(dimensions.get(key) ?? dimension.max, dimension.max));
    }
    if (dimensions.size === 0 || !Number.isSafeInteger(input.windowMs) || input.windowMs < 1) {
      throw new Error("storefront_rate_limit_dimension_invalid");
    }

    const blocked = [...dimensions].flatMap(([key, max]) => {
      const bucket = buckets[key];
      return bucket && bucket.count >= max ? [{ bucket, max }] : [];
    });
    if (blocked.length > 0) {
      await storage.set(STORE_KEY, buckets);
      const retryAfterSec = Math.max(...blocked.map(({ bucket }) =>
        Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000))));
      return {
        allowed: false,
        remaining: 0,
        resetAt: Math.max(...blocked.map(({ bucket }) => bucket.resetAt), now),
        retryAfterSec,
      };
    }

    let remaining = Number.POSITIVE_INFINITY;
    let resetAt = now + input.windowMs;
    for (const [key, max] of dimensions) {
      const existing = buckets[key];
      const next = existing
        ? { ...existing, count: existing.count + 1 }
        : { count: 1, resetAt: now + input.windowMs };
      buckets[key] = next;
      remaining = Math.min(remaining, Math.max(0, max - next.count));
      resetAt = Math.max(resetAt, next.resetAt);
    }
    await storage.set(STORE_KEY, buckets);
    return {
      allowed: true,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      resetAt,
      retryAfterSec: 0,
    };
  };

  return storage.runExclusive(LOCK_KEY, operation);
}
