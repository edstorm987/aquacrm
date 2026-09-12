// ABUSE-BASE-001 — durable atomic admission limiter.
//
// Drives the real module. The memory adapter and the fast pre-filter run in
// process; the durable adapter is exercised with an INJECTED fake RPC client so
// no database is contacted (per the local-only boundary). Covers: windowed
// counting + reset, dimension isolation, loopback concurrency atomicity, the
// durable adapter's happy path and its FAIL-CLOSED behaviour on every failure
// shape, the fast pre-filter short-circuit, backend resolution, and the
// migration's service-role-only shape.
//
// Run: node --import tsx --test scripts/smoke-admission-limiter.test.ts

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";

import {
  admit,
  createMemoryAdmissionStore,
  createDurableAdmissionStore,
  resolveAdmissionStore,
  _swapAdmissionStoreForTests,
  _resetAdmissionFastLocalForTests,
  type AdmissionRpcClient,
} from "../src/lib/server/security/admissionLimiter";

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.ABUSE_ADMISSION_BACKEND;
  delete process.env.DATABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.PORTAL_BACKEND = "memory";
  await _swapAdmissionStoreForTests(null);
  _resetAdmissionFastLocalForTests();
});

test("memory adapter counts within a fixed window and denies past max", async () => {
  const store = createMemoryAdmissionStore();
  const req = { dimension: "ip" as const, key: "203.0.113.5", max: 3, windowMs: 60_000, now: NOW };
  const d1 = await store.admit(req);
  assert.equal(d1.allowed, true);
  assert.equal(d1.remaining, 2);
  assert.equal(d1.resetAt, NOW + 60_000);
  await store.admit(req);
  const d3 = await store.admit(req);
  assert.equal(d3.allowed, true);
  assert.equal(d3.remaining, 0);
  const d4 = await store.admit(req);
  assert.equal(d4.allowed, false);
  assert.ok(d4.retryAfterSec > 0);
});

test("the window resets — a later window admits again", async () => {
  const store = createMemoryAdmissionStore();
  const base = { dimension: "ip" as const, key: "198.51.100.9", max: 1, windowMs: 60_000 };
  assert.equal((await store.admit({ ...base, now: NOW })).allowed, true);
  assert.equal((await store.admit({ ...base, now: NOW + 10 })).allowed, false);
  // Next window.
  assert.equal((await store.admit({ ...base, now: NOW + 60_000 })).allowed, true);
});

test("dimensions and keys are isolated", async () => {
  const store = createMemoryAdmissionStore();
  const now = NOW;
  await store.admit({ dimension: "ip", key: "k", max: 1, windowMs: 60_000, now });
  // Same key, different dimension → separate counter.
  const other = await store.admit({ dimension: "subject", key: "k", max: 1, windowMs: 60_000, now });
  assert.equal(other.allowed, true);
  // Same dimension, different key → separate counter.
  const otherKey = await store.admit({ dimension: "ip", key: "k2", max: 1, windowMs: 60_000, now });
  assert.equal(otherKey.allowed, true);
});

test("loopback concurrency: N concurrent admits admit exactly `max`, no lost updates", async () => {
  const store = createMemoryAdmissionStore();
  const max = 10;
  const attempts = 50;
  const req = { dimension: "tenant-install" as const, key: "agency:install", max, windowMs: 60_000, now: NOW };
  const results = await Promise.all(Array.from({ length: attempts }, () => store.admit(req)));
  const allowed = results.filter((r) => r.allowed).length;
  assert.equal(allowed, max, `expected exactly ${max} admitted under concurrency, got ${allowed}`);
});

// ─── Durable adapter (injected fake client; no database) ──────────────────

function fakeClient(handler: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }): { client: AdmissionRpcClient; calls: Array<{ fn: string; args: Record<string, unknown> }> } {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: AdmissionRpcClient = {
    async rpc(fn, args) { calls.push({ fn, args }); return handler(fn, args); },
  };
  return { client, calls };
}

test("durable adapter passes the RPC's decision through and binds the dimension/key", async () => {
  const { client, calls } = fakeClient(() => ({ data: [{ allowed: true, hits: 2, reset_at: NOW + 60_000 }], error: null }));
  const store = createDurableAdmissionStore(async () => client);
  const d = await store.admit({ dimension: "provider-budget", key: "stripe", max: 5, windowMs: 60_000, now: NOW });
  assert.equal(d.allowed, true);
  assert.equal(d.backend, "durable");
  assert.equal(d.degraded, false);
  assert.equal(d.remaining, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "abuse_admission_check");
  assert.deepEqual(calls[0].args, { p_dimension: "provider-budget", p_key: "stripe", p_max: 5, p_window_ms: 60_000, p_now_ms: NOW });
});

test("durable adapter FAILS CLOSED on every failure shape", async () => {
  const req = { dimension: "ip" as const, key: "x", max: 5, windowMs: 60_000, now: NOW };
  // client factory throws (backend unavailable)
  const throwing = createDurableAdmissionStore(async () => { throw new Error("no db"); });
  const d1 = await throwing.admit(req);
  assert.equal(d1.allowed, false);
  assert.equal(d1.degraded, true);
  // rpc returns an error
  const errStore = createDurableAdmissionStore(async () => fakeClient(() => ({ data: null, error: { message: "boom" } })).client);
  const d2 = await errStore.admit(req);
  assert.equal(d2.allowed, false);
  assert.equal(d2.degraded, true);
  // rpc throws
  const rpcThrow = createDurableAdmissionStore(async () => ({ async rpc() { throw new Error("rpc down"); } }));
  const d3 = await rpcThrow.admit(req);
  assert.equal(d3.allowed, false);
  assert.equal(d3.degraded, true);
  // rpc returns a malformed row (non-numeric hits)
  const bad = createDurableAdmissionStore(async () => fakeClient(() => ({ data: [{ allowed: true, hits: "nope" }], error: null })).client);
  const d4 = await bad.admit(req);
  assert.equal(d4.allowed, false);
  assert.equal(d4.degraded, true);
});

test("fast pre-filter denies a single-process flood without a remote round-trip", async () => {
  const { client, calls } = fakeClient(() => ({ data: [{ allowed: true, hits: 1, reset_at: NOW + 60_000 }], error: null }));
  await _swapAdmissionStoreForTests(createDurableAdmissionStore(async () => client));
  _resetAdmissionFastLocalForTests();
  const max = 4;
  const req = { dimension: "ip" as const, key: "flood", max, windowMs: 60_000, now: NOW };
  let last;
  for (let i = 0; i < max + 3; i += 1) last = await admit(req);
  // Calls 1..max pass the local pre-filter and reach the durable authority;
  // once local exceeds max the pre-filter denies without calling the RPC.
  assert.equal(calls.length, max, `durable authority should be spared the flood; saw ${calls.length} calls`);
  assert.equal(last?.allowed, false);
  assert.equal(last?.backend, "fast-local");
});

test("backend resolution defaults to memory only in local/test and recognises explicit durable backends", async () => {
  assert.equal(resolveAdmissionStore().kind, "memory");
  await _swapAdmissionStoreForTests(null);
  process.env.ABUSE_ADMISSION_BACKEND = "durable";
  assert.equal(resolveAdmissionStore().kind, "durable");
  await _swapAdmissionStoreForTests(null);
  delete process.env.ABUSE_ADMISSION_BACKEND;
  process.env.PORTAL_BACKEND = "postgres";
  assert.equal(resolveAdmissionStore().kind, "durable");
});

test("canonical Supabase configuration selects the durable authority", async () => {
  await _swapAdmissionStoreForTests(null);
  process.env.PORTAL_BACKEND = "supabase";
  assert.equal(resolveAdmissionStore().kind, "durable");

  await _swapAdmissionStoreForTests(null);
  delete process.env.PORTAL_BACKEND;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
  assert.equal(resolveAdmissionStore().kind, "durable");
});

test("production can never silently resolve process-local memory", async () => {
  await _swapAdmissionStoreForTests(null);
  process.env.NODE_ENV = "production";
  process.env.PORTAL_BACKEND = "memory";
  process.env.ABUSE_ADMISSION_BACKEND = "memory";
  assert.equal(resolveAdmissionStore().kind, "durable");
  const decision = await admit({
    dimension: "ip",
    key: "203.0.113.77",
    max: 1,
    windowMs: 60_000,
    now: NOW,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.backend, "durable");
  assert.equal(decision.degraded, true, "missing production authority fails closed");
});

test("the optional adapter override is recognised and documented as production fail-closed", () => {
  const envSource = readFileSync("src/lib/server/env.ts", "utf8");
  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envSource, /"ABUSE_ADMISSION_BACKEND"/);
  assert.match(envExample, /# ABUSE_ADMISSION_BACKEND=durable/);
  assert.match(envExample, /Production always refuses the[\s\S]*?process-local memory adapter/);
});

test("the migration is additive, service-role-only, and fixed-search-path", () => {
  const migrationName = "20260912190000_abuse_admission_limiter.sql";
  const migrationDir = "../supabase/migrations";
  const sql = readFileSync(join(migrationDir, migrationName), "utf8");
  const migrationNames = readdirSync(migrationDir).filter(name => /^\d{14}_.+\.sql$/.test(name));
  const versions = migrationNames.map(name => name.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, "every combined-tree migration version is unique");
  assert.ok(migrationNames.includes(migrationName), "ABUSE-BASE owns the reserved 20260912190000 slot");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.abuse_admission_check/);
  assert.match(sql, /SECURITY DEFINER SET search_path = public/);
  assert.match(sql, /ON CONFLICT \(dimension, bucket_key, window_start\)\s*\n\s*DO UPDATE SET hits = public\.abuse_admission_counters\.hits \+ 1/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.abuse_admission_check[\s\S]*?FROM public, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.abuse_admission_check[\s\S]*?TO service_role;/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DROP\s+TABLE|ALTER\s+TABLE\s+(?!public\.abuse_admission_counters)/i);
});

test("the accepted foundation remains infrastructure-only with zero live callers", () => {
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory()
      ? visit(join(directory, entry.name))
      : /\.(?:ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []);
  const callers = visit("src")
    .filter(path => !path.endsWith("src/lib/server/security/admissionLimiter.ts"))
    .filter(path => /(?:security\/admissionLimiter|\badmissionLimiter\b)/.test(readFileSync(path, "utf8")));
  assert.deepEqual(callers, [], "ABUSE-BASE must stay unwired until a separately reviewed caller lane");
});
