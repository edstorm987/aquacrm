import assert from "node:assert/strict";
import { test } from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes";
import { takeStorefrontRateLimit } from "../src/built-ins/modules/ecommerce/src/server/storefrontRateLimit";

function sharedStorage(): { first: PluginStorage; second: PluginStorage; data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  let tail: Promise<void> = Promise.resolve();

  function adapter(): PluginStorage {
    return {
      async get<T>(key: string) { return data.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { data.set(key, structuredClone(value)); },
      async del(key: string) { data.delete(key); },
      async list(prefix?: string) {
        return [...data.keys()].filter(key => !prefix || key.startsWith(prefix));
      },
      async runExclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      },
    };
  }

  return { first: adapter(), second: adapter(), data };
}

test("storefront limits converge through shared storage across concurrent server instances", async () => {
  const { first, second } = sharedStorage();
  const input = {
    action: "checkout" as const,
    clientIp: "203.0.113.42",
    max: 2,
    windowMs: 60_000,
    now: 10_000,
  };

  const results = await Promise.all([
    takeStorefrontRateLimit(first, input),
    takeStorefrontRateLimit(second, input),
    takeStorefrontRateLimit(first, input),
  ]);

  assert.equal(results.filter(result => result.allowed).length, 2);
  assert.equal(results.filter(result => !result.allowed).length, 1);
  assert.equal(results.find(result => !result.allowed)?.retryAfterSec, 60);
});

test("storefront limits fail closed when an adapter cannot coordinate atomically", async () => {
  const data = new Map<string, unknown>();
  const nonExclusive: PluginStorage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list() { return [...data.keys()]; },
  };

  await assert.rejects(
    takeStorefrontRateLimit(nonExclusive, {
      action: "checkout",
      clientIp: "203.0.113.50",
      max: 1,
      windowMs: 60_000,
    }),
    /requires_exclusive_storage/,
  );
  assert.equal(data.size, 0, "an unlocked limiter mutation was attempted before refusing the request");
});

test("storefront limits partition actions and client addresses", async () => {
  const { first } = sharedStorage();
  const base = { max: 1, windowMs: 60_000, now: 20_000 };

  assert.equal((await takeStorefrontRateLimit(first, {
    ...base,
    action: "quote",
    clientIp: "203.0.113.1",
  })).allowed, true);
  assert.equal((await takeStorefrontRateLimit(first, {
    ...base,
    action: "quote",
    clientIp: "203.0.113.1",
  })).allowed, false);
  assert.equal((await takeStorefrontRateLimit(first, {
    ...base,
    action: "checkout",
    clientIp: "203.0.113.1",
  })).allowed, true);
  assert.equal((await takeStorefrontRateLimit(first, {
    ...base,
    action: "quote",
    clientIp: "203.0.113.2",
  })).allowed, true);
});

test("an expired durable bucket is pruned and begins a new window", async () => {
  const { first, data } = sharedStorage();
  data.set("storefront-rate-limit:v1", {
    "quote:expired": { count: 99, resetAt: 1 },
    "quote:203.0.113.9": { count: 1, resetAt: 1_500 },
  });

  const result = await takeStorefrontRateLimit(first, {
    action: "quote",
    clientIp: "203.0.113.9",
    max: 1,
    windowMs: 500,
    now: 2_000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.resetAt, 2_500);
  const stored = data.get("storefront-rate-limit:v1") as Record<string, unknown>;
  assert.deepEqual(Object.keys(stored), ["quote:203.0.113.9"]);
});
