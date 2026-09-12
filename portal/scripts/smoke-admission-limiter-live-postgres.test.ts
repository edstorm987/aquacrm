// ABUSE-BASE durable SQL acceptance on a REAL disposable local PostgreSQL.
//
// Skips unless both are explicitly set:
//   ABUSE_ADMISSION_DISPOSABLE_DATABASE_URL=postgres://...@127.0.0.1/...
//   ABUSE_ADMISSION_DISPOSABLE_DATABASE_ACK="this local database may be modified and dropped"
//
// The guard refuses the portal DATABASE_URL, every non-loopback host, standard
// databases, or a database where the admission objects already exist. It never
// targets Supabase and is intentionally not part of an ordinary smoke run.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

const url = process.env.ABUSE_ADMISSION_DISPOSABLE_DATABASE_URL?.trim() ?? "";
const ack = process.env.ABUSE_ADMISSION_DISPOSABLE_DATABASE_ACK?.trim() ?? "";
const REQUIRED_ACK = "this local database may be modified and dropped";
const enabled = Boolean(url) && ack === REQUIRED_ACK;
const skipReason = !url
  ? "ABUSE_ADMISSION_DISPOSABLE_DATABASE_URL is unset — real SQL acceptance not run"
  : ack !== REQUIRED_ACK
    ? `ABUSE_ADMISSION_DISPOSABLE_DATABASE_ACK must be exactly "${REQUIRED_ACK}"`
    : undefined;

const migrationUrl = new URL("../../supabase/migrations/20260912190000_abuse_admission_limiter.sql", import.meta.url);
const MIGRATION = readFileSync(migrationUrl, "utf8");
const WINDOW_MS = 60_000;
const MAX = 10;

type Pg = typeof import("pg");
let pg: Pg;
let pool: import("pg").Pool;
const createdRoles: string[] = [];
let migrationApplied = false;

function digest(): string {
  return randomBytes(32).toString("hex");
}

function refuseProtectedTarget(): void {
  if (process.env.DATABASE_URL?.trim() === url) {
    throw new Error("Refusing: disposable URL equals the portal DATABASE_URL.");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Refusing: disposable URL is invalid."); }
  const host = parsed.hostname.toLowerCase();
  if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(host)) {
    throw new Error("Refusing: ABUSE-BASE SQL acceptance requires a loopback PostgreSQL host.");
  }
  const database = parsed.pathname.replace(/^\//, "").toLowerCase();
  if (!database || new Set(["postgres", "template0", "template1"]).has(database)) {
    throw new Error("Refusing: use a named throwaway database, not a standard PostgreSQL database.");
  }
}

async function admission(keyHash: string, now: number | null, max = MAX) {
  const { rows } = await pool.query(
    "select * from public.abuse_admission_check($1, $2, $3, $4, $5)",
    ["subject", keyHash, max, WINDOW_MS, now],
  );
  assert.equal(rows.length, 1);
  return rows[0] as { allowed: boolean; hits: number; reset_at: string | number; observed_at: string | number };
}

describe("ABUSE-BASE migration on a disposable local PostgreSQL", { skip: skipReason }, () => {
  before(async () => {
    refuseProtectedTarget();
    pg = await import("pg");
    pool = new pg.Pool({ connectionString: url, max: 12 });

    const existing = await pool.query(`select
      to_regclass('public.abuse_admission_counters') as counters,
      to_regclass('public.abuse_admission_capacity') as capacity,
      to_regprocedure('public.abuse_admission_check(text,text,integer,bigint,bigint)') as admission`);
    if (existing.rows[0]?.counters || existing.rows[0]?.capacity || existing.rows[0]?.admission) {
      throw new Error("Refusing: admission objects already exist; use a fresh throwaway database.");
    }

    for (const role of ["anon", "authenticated", "service_role"]) {
      const found = await pool.query("select 1 from pg_roles where rolname = $1", [role]);
      if (!found.rowCount) {
        await pool.query(`create role ${role} nologin`);
        createdRoles.push(role);
      }
    }
    await pool.query(MIGRATION);
    migrationApplied = true;
  });

  after(async () => {
    if (!pool) return;
    if (migrationApplied) {
      await pool.query("drop function if exists public.gc_abuse_admission_counters(bigint)");
      await pool.query("drop function if exists public.abuse_admission_check(text,text,integer,bigint,bigint)");
      await pool.query("drop table if exists public.abuse_admission_counters");
      await pool.query("drop table if exists public.abuse_admission_capacity");
    }
    for (const role of createdRoles.reverse()) await pool.query(`drop role if exists ${role}`);
    await pool.end();
  });

  it("uses one database observation for the ordinary production window", async () => {
    const before = Date.now();
    const row = await admission(digest(), null);
    const afterNow = Date.now();
    const observedAt = Number(row.observed_at);
    assert.ok(observedAt >= before && observedAt <= afterNow);
    assert.equal(Number(row.reset_at), Math.floor(observedAt / WINDOW_MS) * WINDOW_MS + WINDOW_MS);
    assert.equal(row.allowed, true);
    assert.equal(row.hits, 1);
  });

  it("never rewinds or double-counts when captured old-window calls complete after and between newer calls", async () => {
    const keyHash = digest();
    const max = 100;
    const before = await pool.query(`select
      (select count(*)::integer from public.abuse_admission_counters) as rows,
      (select active_counters from public.abuse_admission_capacity where singleton = true) as active`);

    // Model two application processes: the first captures a time just before
    // the boundary but its database dispatch is delayed; the second captures
    // just after the boundary and completes first on another pool connection.
    let releaseOldDispatch!: () => void;
    const oldDispatchGate = new Promise<void>((resolve) => { releaseOldDispatch = resolve; });
    const delayedOldProcess = (async () => {
      await oldDispatchGate;
      return admission(keyHash, 119_999, max);
    })();
    const newer = await admission(keyHash, 120_001, max);
    releaseOldDispatch();
    const lateOlder = await delayedOldProcess;

    assert.equal(newer.allowed, true);
    assert.equal(newer.hits, 1);
    assert.equal(lateOlder.allowed, false, "the late stale call must fail closed");
    assert.equal(lateOlder.hits, max + 1);

    // Repeated modest negative/positive skew around the same boundary must
    // never rewind the row or forget any already-admitted current-window hit.
    const alternations = 25;
    let current;
    for (let index = 0; index < alternations; index += 1) {
      const stale = await admission(keyHash, 119_999 - index, max);
      current = await admission(keyHash, 120_002 + index, max);
      assert.equal(stale.allowed, false);
      assert.equal(stale.hits, max + 1);
      assert.equal(current.hits, index + 2);
    }
    assert.equal(current?.allowed, true);

    const stored = await pool.query(
      `select window_start, expires_at, hits from public.abuse_admission_counters
       where dimension = $1 and bucket_key_hash = $2 and window_ms = $3`,
      ["subject", keyHash, WINDOW_MS],
    );
    assert.deepEqual(stored.rows, [{ window_start: "120000", expires_at: "180000", hits: alternations + 1 }]);

    const afterState = await pool.query(`select
      (select count(*)::integer from public.abuse_admission_counters) as rows,
      (select active_counters from public.abuse_admission_capacity where singleton = true) as active`);
    assert.equal(afterState.rows[0].rows - before.rows[0].rows, 1);
    assert.equal(afterState.rows[0].active - before.rows[0].active, 1,
      "one inserted row must add exactly one ledger entry despite repeated stale conflicts");
    assert.equal(afterState.rows[0].rows, afterState.rows[0].active);
  });

  it("serializes concurrent distinct-key allocation and preserves the ledger invariant", async () => {
    const before = await pool.query(`select
      (select count(*)::integer from public.abuse_admission_counters) as rows,
      (select active_counters from public.abuse_admission_capacity where singleton = true) as active`);
    const results = await Promise.all(Array.from({ length: 200 }, () => admission(digest(), 240_001)));
    assert.equal(results.filter(row => row.allowed).length, 200);
    const afterState = await pool.query(`select
      (select count(*)::integer from public.abuse_admission_counters) as rows,
      (select active_counters from public.abuse_admission_capacity where singleton = true) as active`);
    assert.equal(afterState.rows[0].rows - before.rows[0].rows, 200);
    assert.equal(afterState.rows[0].active - before.rows[0].active, 200);
    assert.equal(afterState.rows[0].rows, afterState.rows[0].active);
  });
});
