// Durable HMAC nonce store (T1 R028 — chapter
// `04-durable-nonce-store.md`).
//
// Replaces the per-module in-memory Set used by magicLink.ts +
// emailVerification.ts. Multi-instance deploys lose security
// guarantees with in-memory single-process state — a magic-link
// nonce consumed on instance A could be replayed against instance B.
// This module provides a single nonceStore with two adapters:
//
//   - Postgres adapter: when `PORTAL_BACKEND === "postgres"` OR
//     `DATABASE_URL` is set. Lazily ensures the `nonces` table on
//     first call. `consumeNonce` is atomic: `INSERT … ON CONFLICT
//     DO NOTHING RETURNING token` returns a row iff this was the
//     first consumption — second call returns no row, we report
//     false ("already used").
//   - Memory adapter: dev / test default. Map<token, expiresAt>
//     with the same single-use semantics.
//
// `kind` discriminates which surface owns the nonce so an analytics
// query can split usage. Today we use `magic-link` /
// `email-verify` / `csrf` (csrf future-reserved — current CSRF tokens
// are stateless HMAC).
//
// `gcExpiredNonces()` is called from rateLimit.ts `sweepExpired()`
// (R021) so the existing diagnostic + Founder-gated /api/internal/sweep
// route picks up nonce GC for free.
//
// NOTE: deliberately omits `server-only` so the smoke can drive the
// memory adapter under tsx --test. The Postgres adapter lazy-imports
// `pg` on first call.

import "node:async_hooks"; // marker — file is server-only intent; runtime guard via storagePostgres lazy import.

export type NonceKind = "magic-link" | "email-verify" | "password-reset" | "csrf";

export interface NonceStore {
  kind: "memory" | "postgres";
  consumeNonce(token: string, kind: NonceKind, ttlMs: number): Promise<boolean>;
  gcExpiredNonces(now?: number): Promise<number>;
  // Test-only — clears every entry. Postgres adapter TRUNCATEs.
  _resetForTests?: () => Promise<void>;
}

// ─── Memory adapter ───────────────────────────────────────────────────────

interface MemoryEntry { kind: NonceKind; expiresAt: number; }

function createMemoryAdapter(): NonceStore {
  const map = new Map<string, MemoryEntry>();
  return {
    kind: "memory",
    async consumeNonce(token, kind, ttlMs) {
      const now = Date.now();
      const expiresAt = now + ttlMs;
      const existing = map.get(token);
      if (existing) return false;        // already consumed (even if expired)
      if (expiresAt <= now) return false;  // ttl 0 or negative — caller error
      map.set(token, { kind, expiresAt });
      return true;
    },
    async gcExpiredNonces(now = Date.now()) {
      let deleted = 0;
      for (const [k, v] of map) {
        if (v.expiresAt < now) {
          map.delete(k);
          deleted++;
        }
      }
      return deleted;
    },
    async _resetForTests() { map.clear(); },
  };
}

// ─── Postgres adapter ─────────────────────────────────────────────────────

const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS nonces (
  token text PRIMARY KEY,
  kind text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS nonces_expires_at_idx ON nonces (expires_at);
`;

function createPostgresAdapter(): NonceStore {
  let ensured = false;
  async function ensureTable(): Promise<void> {
    if (ensured) return;
    const { getPool } = await import("@/server/storagePostgres");
    await getPool().query(ENSURE_TABLE_SQL);
    ensured = true;
  }
  async function getQuery() {
    const { getPool } = await import("@/server/storagePostgres");
    return getPool();
  }
  return {
    kind: "postgres",
    async consumeNonce(token, kind, ttlMs) {
      const now = Date.now();
      if (ttlMs <= 0) return false;
      await ensureTable();
      const pool = await getQuery();
      const result = await pool.query(
        `INSERT INTO nonces (token, kind, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO NOTHING
         RETURNING token`,
        [token, kind, now + ttlMs],
      );
      return result.rowCount === 1;
    },
    async gcExpiredNonces(now = Date.now()) {
      await ensureTable();
      const pool = await getQuery();
      const result = await pool.query(
        "DELETE FROM nonces WHERE expires_at < $1",
        [now],
      );
      return result.rowCount ?? 0;
    },
    async _resetForTests() {
      await ensureTable();
      const pool = await getQuery();
      await pool.query("TRUNCATE nonces");
    },
  };
}

// ─── Adapter resolution ──────────────────────────────────────────────────

let cached: NonceStore | null = null;

export function getNonceStore(): NonceStore {
  if (cached) return cached;
  const explicit = (process.env.PORTAL_BACKEND ?? "").toLowerCase();
  const wantsPostgres = explicit === "postgres" || (!explicit && !!process.env.DATABASE_URL);
  cached = wantsPostgres ? createPostgresAdapter() : createMemoryAdapter();
  return cached;
}

// Test helper — purely for the smoke. Lets us swap adapters between
// tests without re-reading env. Resets the singleton + the supplied
// adapter's internal state.
export async function _swapStoreForTests(adapter: NonceStore | null): Promise<void> {
  if (cached?._resetForTests) {
    try { await cached._resetForTests(); } catch { /* best-effort */ }
  }
  cached = adapter;
}

// Public factory hooks — exported so the smoke can build clean
// adapters without going through the singleton.
export function _createMemoryAdapterForTests(): NonceStore {
  return createMemoryAdapter();
}
