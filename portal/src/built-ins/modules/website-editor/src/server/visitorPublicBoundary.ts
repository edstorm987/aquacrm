import "server-only";

import type { PluginStorage } from "../lib/aquaPluginTypes";

const LOCK_KEY = "website-editor:visitor-public-boundary";
const RATE_KEY = "website-editor:visitor-rate-limit:v1";

interface StoredBucket {
  count: number;
  resetAt: number;
}

type StoredBuckets = Record<string, StoredBucket>;

export interface VisitorRateLimitInput {
  action:
    | "contact-ip" | "contact-install"
    | "newsletter-ip" | "newsletter-install"
    | "blog" | "blog-install";
  identity: string;
  max: number;
  windowMs: number;
  now?: number;
}

export interface VisitorRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

function cleanBuckets(value: unknown, now: number): StoredBuckets {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: StoredBuckets = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const count = Number(row.count);
    const resetAt = Number(row.resetAt);
    if (Number.isSafeInteger(count) && count >= 0 && Number.isFinite(resetAt) && resetAt > now) {
      out[key] = { count, resetAt };
    }
  }
  return out;
}

/**
 * Persist only one-way digests for anonymous abuse-control identifiers and
 * replay fingerprints. IP addresses and contact payloads must not acquire a
 * second plaintext copy merely because the public boundary needs a stable key.
 */
export async function visitorBoundaryDigest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function bucketKey(input: VisitorRateLimitInput): Promise<string> {
  const identity = input.identity.trim().slice(0, 200) || "anonymous";
  return `${input.action}:${await visitorBoundaryDigest(`${input.action}\u0000${identity}`)}`;
}

/**
 * Mutate one or more visitor buckets while the caller holds the shared lock.
 * A group is atomic: either all requested tokens are taken or none are.
 */
export async function takeVisitorRateLimitsLocked(
  storage: PluginStorage,
  inputs: readonly VisitorRateLimitInput[],
): Promise<VisitorRateLimitResult> {
  const now = inputs[0]?.now ?? Date.now();
  const buckets = cleanBuckets(await storage.get<unknown>(RATE_KEY), now);
  const keyedInputs = await Promise.all(inputs.map(async input => ({
    input,
    key: await bucketKey(input),
  })));
  let retryAfterSec = 0;

  for (const { input, key } of keyedInputs) {
    const existing = buckets[key];
    if (existing && existing.count >= input.max) {
      retryAfterSec = Math.max(retryAfterSec, Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)));
    }
  }
  if (retryAfterSec > 0) {
    await storage.set(RATE_KEY, buckets);
    return { allowed: false, retryAfterSec };
  }

  for (const { input, key } of keyedInputs) {
    const existing = buckets[key];
    buckets[key] = existing
      ? { ...existing, count: existing.count + 1 }
      : { count: 1, resetAt: now + input.windowMs };
  }
  await storage.set(RATE_KEY, buckets);
  return { allowed: true, retryAfterSec: 0 };
}

/** No unlocked/in-memory fallback is permitted on an anonymous write path. */
export async function withVisitorPublicBoundary<T>(
  storage: PluginStorage,
  operation: () => Promise<T>,
): Promise<T> {
  if (!storage.runExclusive) {
    throw new Error("website_editor_visitor_boundary_requires_exclusive_storage");
  }
  return storage.runExclusive(LOCK_KEY, operation);
}
