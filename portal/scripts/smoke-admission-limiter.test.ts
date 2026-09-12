// ABUSE-BASE — hostile local acceptance for the unwired limiter foundation.
// No database or network is contacted: durable behavior uses an injected RPC.

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  admit,
  createMemoryAdmissionStore,
  createDurableAdmissionStore,
  resolveAdmissionStore,
  MAX_ADMISSION_KEY_BYTES,
  MAX_LOCAL_ADMISSION_COUNTERS,
  _swapAdmissionStoreForTests,
  _resetAdmissionFastLocalForTests,
  type AdmissionRpcClient,
} from "../src/lib/server/security/admissionLimiter";

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const SECRET = "test-only-admission-hmac-secret-32-bytes-minimum";
const ENV_KEYS = [
  "NODE_ENV", "ABUSE_ADMISSION_BACKEND", "PORTAL_BACKEND", "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "PORTAL_SESSION_SECRET",
] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_SESSION_SECRET = SECRET;
  for (const key of [
    "ABUSE_ADMISSION_BACKEND", "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  ]) delete process.env[key];
  await _swapAdmissionStoreForTests(null);
  _resetAdmissionFastLocalForTests();
});

afterEach(async () => {
  await _swapAdmissionStoreForTests(null);
  _resetAdmissionFastLocalForTests();
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function fakeClient(
  handler: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown },
): { client: AdmissionRpcClient; calls: Array<{ fn: string; args: Record<string, unknown> }> } {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      async rpc(fn, args) {
        calls.push({ fn, args });
        return handler(fn, args);
      },
    },
  };
}

test("memory adapter counts atomically within one fixed window and resets later", async () => {
  const store = createMemoryAdmissionStore();
  const req = { dimension: "ip" as const, key: "203.0.113.5", max: 3, windowMs: 60_000, now: NOW };
  const results = await Promise.all(Array.from({ length: 5 }, () => store.admit(req)));
  assert.equal(results.filter((result) => result.allowed).length, 3);
  assert.equal(results.at(-1)?.remaining, 0);
  assert.equal((await store.admit({ ...req, now: NOW + 60_000 })).allowed, true);
});

test("dimensions, canonical keys, and policy windows remain isolated", async () => {
  const store = createMemoryAdmissionStore();
  const base = { max: 1, windowMs: 60_000, now: NOW };
  assert.equal((await store.admit({ ...base, dimension: "subject", key: "same" })).allowed, true);
  assert.equal((await store.admit({ ...base, dimension: "provider-budget", key: "same" })).allowed, true);
  assert.equal((await store.admit({ ...base, dimension: "subject", key: "same", windowMs: 3_600_000 })).allowed, true);
  assert.equal((await store.admit({ ...base, dimension: "subject", key: "same" })).allowed, false);
});

test("short-window cleanup cannot delete a still-live long-window counter", async () => {
  const store = createMemoryAdmissionStore();
  const long = { dimension: "subject" as const, key: "long-lived", max: 1, windowMs: 86_400_000, now: 0 };
  assert.equal((await store.admit(long)).allowed, true);
  for (let i = 0; i < MAX_LOCAL_ADMISSION_COUNTERS - 1; i += 1) {
    const decision = await store.admit({
      dimension: "subject",
      key: `short-${i}`,
      max: 1,
      windowMs: 60_000,
      now: 7_200_000,
    });
    assert.equal(decision.allowed, true);
  }
  const atCapacity = await store.admit({
    dimension: "subject",
    key: "short-at-capacity",
    max: 1,
    windowMs: 60_000,
    now: 7_200_000,
  });
  assert.equal(atCapacity.errorCode, "admission_limiter_capacity_exceeded");
  const secondLong = await store.admit({ ...long, now: 7_200_000 });
  assert.equal(secondLong.allowed, false, "the original 24-hour counter must survive unrelated 1-minute activity");
  assert.equal(store._entryCountForTests?.(), MAX_LOCAL_ADMISSION_COUNTERS);
});

test("a bounded sweep frees only counters whose own expiry has passed", async () => {
  const store = createMemoryAdmissionStore();
  for (let i = 0; i < MAX_LOCAL_ADMISSION_COUNTERS; i += 1) {
    await store.admit({ dimension: "subject", key: `expired-${i}`, max: 1, windowMs: 60_000, now: 0 });
  }
  const nextWindow = await store.admit({
    dimension: "subject", key: "fresh", max: 1, windowMs: 60_000, now: 60_000,
  });
  assert.equal(nextWindow.allowed, true);
  assert.equal(store._entryCountForTests?.(), 1);
});

test("distinct-key floods hit a hard local cap and remain linear at 100,000 attempts", async () => {
  const store = createMemoryAdmissionStore();
  for (let i = 0; i < MAX_LOCAL_ADMISSION_COUNTERS; i += 1) {
    assert.equal((await store.admit({
      dimension: "subject", key: `fill-${i}`, max: 1, windowMs: 86_400_000, now: NOW,
    })).allowed, true);
  }
  const started = performance.now();
  let last;
  for (let i = 0; i < 100_000; i += 1) {
    last = await store.admit({
      dimension: "subject", key: `overflow-${i}`, max: 1, windowMs: 86_400_000, now: NOW,
    });
  }
  const elapsed = performance.now() - started;
  assert.equal(last?.allowed, false);
  assert.equal(last?.errorCode, "admission_limiter_capacity_exceeded");
  assert.equal(store._entryCountForTests?.(), MAX_LOCAL_ADMISSION_COUNTERS);
  assert.ok(elapsed < 5_000, `100,000 capped attempts must stay bounded/linear; took ${elapsed.toFixed(1)}ms`);
});

test("durable adapter HMACs canonical keys and never sends raw IP or identifiers", async () => {
  const { client, calls } = fakeClient((_fn, args) => ({
    data: [{ allowed: true, hits: 1, reset_at: NOW + 60_000 }],
    error: null,
  }));
  const store = createDurableAdmissionStore(async () => client);
  const first = await store.admit({ dimension: "ip", key: "2001:0db8:0:0:0:0:0:1", max: 5, windowMs: 60_000, now: NOW });
  const second = await store.admit({ dimension: "ip", key: "2001:db8::1", max: 5, windowMs: 60_000, now: NOW });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(calls.length, 2);
  const firstHash = calls[0]?.args.p_key_hash;
  assert.match(String(firstHash), /^[0-9a-f]{64}$/);
  assert.equal(firstHash, calls[1]?.args.p_key_hash, "equivalent IPv6 forms must share one canonical bucket");
  assert.notEqual(firstHash, "2001:db8::1");
  assert.equal("p_key" in calls[0].args, false);
});

test("durable adapter rejects every malformed or coercible authority row", async () => {
  const req = { dimension: "subject" as const, key: "subject-a", max: 5, windowMs: 60_000, now: NOW };
  const malformed: unknown[] = [
    null,
    {},
    { allowed: true, hits: null, reset_at: NOW + 60_000 },
    { allowed: true, hits: "1", reset_at: NOW + 60_000 },
    { allowed: true, hits: -1, reset_at: NOW + 60_000 },
    { allowed: true, hits: 1.5, reset_at: NOW + 60_000 },
    { allowed: "true", hits: 1, reset_at: NOW + 60_000 },
    { allowed: false, hits: 1, reset_at: NOW + 60_000 },
    { allowed: true, hits: 1, reset_at: String(NOW + 60_000) },
    { allowed: true, hits: 1, reset_at: NOW + 120_000 },
  ];
  const responseShapes: unknown[] = [
    ...malformed.map((row) => [row]),
    { allowed: true, hits: 1, reset_at: NOW + 60_000 },
    [],
    [
      { allowed: true, hits: 1, reset_at: NOW + 60_000 },
      { allowed: true, hits: 1, reset_at: NOW + 60_000 },
    ],
  ];
  for (const data of responseShapes) {
    const store = createDurableAdmissionStore(async () => fakeClient(() => ({ data, error: null })).client);
    const decision = await store.admit(req);
    assert.equal(decision.allowed, false, `malformed authority shape must deny: ${JSON.stringify(data)}`);
    assert.equal(decision.degraded, true);
    assert.equal(decision.errorCode, "admission_limiter_authority_response_invalid");
  }
});

test("durable adapter fails closed on missing authority, RPC errors, and exceptions", async () => {
  const req = { dimension: "subject" as const, key: "subject-a", max: 5, windowMs: 60_000, now: NOW };
  const throwingFactory = createDurableAdmissionStore(async () => { throw new Error("no db"); });
  assert.equal((await throwingFactory.admit(req)).allowed, false);
  const errorRow = createDurableAdmissionStore(async () => fakeClient(() => ({ data: null, error: { code: "x" } })).client);
  assert.equal((await errorRow.admit(req)).allowed, false);
  const throwingRpc = createDurableAdmissionStore(async () => ({ async rpc() { throw new Error("down"); } }));
  assert.equal((await throwingRpc.admit(req)).allowed, false);
});

test("invalid, oversized, and secretless inputs deny before any RPC", async () => {
  let calls = 0;
  const store = createDurableAdmissionStore(async () => ({
    async rpc() {
      calls += 1;
      return { data: [{ allowed: true, hits: 1, reset_at: NOW + 60_000 }], error: null };
    },
  }));
  const cases = [
    { dimension: "ip", key: "not-an-ip", max: 1, windowMs: 60_000, now: NOW },
    { dimension: "subject", key: "x".repeat(MAX_ADMISSION_KEY_BYTES + 1), max: 1, windowMs: 60_000, now: NOW },
    { dimension: "subject", key: "control\u0000key", max: 1, windowMs: 60_000, now: NOW },
    { dimension: "subject", key: "subject", max: -1, windowMs: 60_000, now: NOW },
    { dimension: "subject", key: "subject", max: 1.5, windowMs: 60_000, now: NOW },
    { dimension: "subject", key: "subject", max: 1, windowMs: 999, now: NOW },
  ];
  for (const req of cases) {
    const decision = await store.admit(req as Parameters<typeof store.admit>[0]);
    assert.equal(decision.allowed, false);
    assert.equal(decision.degraded, true);
  }
  delete process.env.PORTAL_SESSION_SECRET;
  const secretless = await store.admit({ dimension: "subject", key: "subject", max: 1, windowMs: 60_000, now: NOW });
  assert.equal(secretless.errorCode, "admission_limiter_hash_secret_required");
  assert.equal(calls, 0);
});

test("fast pre-filter can deny but never grant around the durable authority", async () => {
  const { client, calls } = fakeClient(() => ({
    data: [{ allowed: true, hits: 1, reset_at: NOW + 60_000 }], error: null,
  }));
  await _swapAdmissionStoreForTests(createDurableAdmissionStore(async () => client));
  for (let i = 0; i < 7; i += 1) {
    await admit({ dimension: "subject", key: "flood", max: 4, windowMs: 60_000, now: NOW });
  }
  assert.equal(calls.length, 4);
});

test("a saturated fast pre-filter defers untracked dimensions to durable authority", async () => {
  const { client, calls } = fakeClient((_fn, args) => {
    const now = Number(args.p_now_ms);
    const windowMs = Number(args.p_window_ms);
    return {
      data: [{
        allowed: true,
        hits: 1,
        reset_at: Math.floor(now / windowMs) * windowMs + windowMs,
      }],
      error: null,
    };
  });
  await _swapAdmissionStoreForTests(createDurableAdmissionStore(async () => client));

  for (let i = 0; i < MAX_LOCAL_ADMISSION_COUNTERS; i += 1) {
    const decision = await admit({
      dimension: "subject",
      key: `fill-${i}`,
      max: 1,
      windowMs: 86_400_000,
      now: NOW,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.backend, "durable");
  }
  assert.equal(calls.length, MAX_LOCAL_ADMISSION_COUNTERS);

  const tracked = await admit({
    dimension: "subject",
    key: "fill-0",
    max: 1,
    windowMs: 86_400_000,
    now: NOW,
  });
  assert.equal(tracked.allowed, false, "an already-tracked over-limit key must still be denied locally");
  assert.equal(tracked.backend, "fast-local");
  assert.equal(calls.length, MAX_LOCAL_ADMISSION_COUNTERS, "local denial must not spend a durable call");

  const unrelated = await admit({
    dimension: "provider-budget",
    key: "unrelated-provider",
    max: 1,
    windowMs: 86_400_000,
    now: NOW,
  });
  assert.equal(unrelated.allowed, true);
  assert.equal(unrelated.backend, "durable");
  assert.equal(unrelated.degraded, false);
  assert.equal(unrelated.errorCode, undefined);
  assert.equal(calls.length, MAX_LOCAL_ADMISSION_COUNTERS + 1, "durable authority must decide an untracked key");
});

test("backend resolution is exact, observable, and production-memory-safe", async () => {
  assert.equal(resolveAdmissionStore().kind, "memory");

  await _swapAdmissionStoreForTests(null);
  process.env.PORTAL_BACKEND = "supabase";
  assert.equal(resolveAdmissionStore().kind, "unavailable");
  assert.equal(resolveAdmissionStore().configurationError, "admission_limiter_supabase_authority_required");

  await _swapAdmissionStoreForTests(null);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  assert.equal(resolveAdmissionStore().kind, "durable");

  await _swapAdmissionStoreForTests(null);
  process.env.PORTAL_BACKEND = "postgres";
  delete process.env.ABUSE_ADMISSION_BACKEND;
  assert.equal(resolveAdmissionStore().kind, "unavailable");
  assert.equal(resolveAdmissionStore().configurationError, "admission_limiter_postgres_adapter_unavailable");

  await _swapAdmissionStoreForTests(null);
  delete process.env.PORTAL_BACKEND;
  process.env.DATABASE_URL = "postgresql://fixture.invalid/db";
  assert.equal(resolveAdmissionStore().configurationError, "admission_limiter_postgres_adapter_unavailable");

  await _swapAdmissionStoreForTests(null);
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";
  process.env.ABUSE_ADMISSION_BACKEND = "memory";
  assert.equal(resolveAdmissionStore().kind, "unavailable");
  const productionMemory = await admit({ dimension: "ip", key: "203.0.113.77", max: 1, windowMs: 60_000, now: NOW });
  assert.equal(productionMemory.allowed, false);
  assert.equal(productionMemory.errorCode, "admission_limiter_memory_forbidden_in_production");

  await _swapAdmissionStoreForTests(null);
  delete process.env.ABUSE_ADMISSION_BACKEND;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.PORTAL_BACKEND = "memory";
  assert.equal(resolveAdmissionStore().configurationError, "admission_limiter_durable_authority_required");
  const missingAuthority = await admit({ dimension: "ip", key: "203.0.113.78", max: 1, windowMs: 60_000, now: NOW });
  assert.equal(missingAuthority.allowed, false);
  assert.equal(missingAuthority.errorCode, "admission_limiter_durable_authority_required");
});

test("environment guidance names the exact supported durable authority", () => {
  const envSource = readFileSync("src/lib/server/env.ts", "utf8");
  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envSource, /"ABUSE_ADMISSION_BACKEND"/);
  assert.match(envExample, /ABUSE_ADMISSION_BACKEND=supabase/);
  assert.match(envExample, /PostgreSQL has no admission-limiter/);
  assert.match(envExample, /adapter yet and fails closed/);
  assert.match(envExample, /Production never uses process-local memory/);
});

test("migration enforces hashed bounded keys, per-row expiry, atomic capacity, RLS, and grants", () => {
  const migrationName = "20260912190000_abuse_admission_limiter.sql";
  const migrationDir = "../supabase/migrations";
  const sql = readFileSync(join(migrationDir, migrationName), "utf8");
  const migrationNames = readdirSync(migrationDir).filter((name) => /^\d{14}_.+\.sql$/.test(name));
  const versions = migrationNames.map((name) => name.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length);
  assert.ok(migrationNames.includes(migrationName));
  assert.match(sql, /bucket_key_hash char\(64\)/);
  assert.match(sql, /CHECK \(bucket_key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /expires_at\s+bigint/);
  assert.match(sql, /active_counters BETWEEN 0 AND 100000/);
  assert.match(sql, /FOR UPDATE;/);
  assert.match(sql, /ON CONFLICT \(singleton\) DO NOTHING/);
  assert.match(sql, /ON CONFLICT \(dimension, bucket_key_hash, window_ms\)[\s\S]*?DO UPDATE SET/);
  assert.match(sql, /DELETE FROM public\.abuse_admission_counters WHERE expires_at <= v_now/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.gc_abuse_admission_counters/);
  assert.doesNotMatch(sql, /window_start < v_now - GREATEST/);
  assert.doesNotMatch(sql, /bucket_key\s+text/);
  assert.match(sql, /SECURITY DEFINER SET search_path = public/);
  for (const table of ["abuse_admission_counters", "abuse_admission_capacity"]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM public, anon, authenticated`));
    assert.match(sql, new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`));
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.abuse_admission_check[\s\S]*?FROM public, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.abuse_admission_check[\s\S]*?TO service_role/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.gc_abuse_admission_counters[\s\S]*?FROM public, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.gc_abuse_admission_counters[\s\S]*?TO service_role/);
});

test("foundation remains infrastructure-only with zero production callers", () => {
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? visit(join(directory, entry.name))
      : /\.(?:ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []);
  const callers = visit("src")
    .filter((path) => !path.endsWith("src/lib/server/security/admissionLimiter.ts"))
    .filter((path) => /(?:security\/admissionLimiter|\badmissionLimiter\b)/.test(readFileSync(path, "utf8")));
  assert.deepEqual(callers, []);
});
