// Durable HMAC nonce store (T1 R028 — chapter
// `04-durable-nonce-store.md`).
//
// Replaces the per-module in-memory Set used by magicLink.ts +
// emailVerification.ts. Multi-instance deploys lose security
// guarantees with in-memory single-process state — a magic-link
// nonce consumed on instance A could be replayed against instance B.
// This module provides a single nonceStore with three adapters:
//
//   - Postgres adapter: when `PORTAL_BACKEND === "postgres"` OR
//     `DATABASE_URL` is set. Lazily ensures the `nonces` table on
//     first call. `consumeNonce` is atomic: `INSERT … ON CONFLICT
//     DO NOTHING RETURNING token` returns a row iff this was the
//     first consumption — second call returns no row, we report
//     false ("already used").
//   - Supabase adapter: service-role-only atomic RPCs backed by the
//     `aqua_auth_nonces` table. This is the normal production adapter when
//     `PORTAL_BACKEND=supabase`; it does not require DATABASE_URL.
//   - Memory adapter: dev / test default. Map<token, expiresAt>
//     with the same single-use semantics.
//
// `kind` discriminates which surface owns the nonce so an analytics
// query can split usage. Today we use `magic-link` / `client-portal-invite` /
// `email-verify` / `password-reset` / `aqua-embed` / `csrf` (csrf future-reserved — current CSRF tokens
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

import crypto from "node:crypto";
import { resolveSupabaseSecretKey, resolveSupabaseUrl } from "@/lib/supabase/keys";

export type NonceKind = "magic-link" | "client-portal-invite" | "email-verify" | "password-reset" | "aqua-embed" | "csrf";

export interface NonceStore {
  kind: "memory" | "postgres" | "supabase";
  consumeNonce(token: string, kind: NonceKind, ttlMs: number): Promise<boolean>;
  /**
   * Undo one consume, for exactly one situation: the caller consumed the nonce
   * and then the side effect it was protecting FAILED before completing (a
   * provider outage mid password-reset, say). Without this, single-use +
   * consume-first means a transient failure burns the person's only link.
   * Release only a nonce THIS request consumed — never as a retry mechanism.
   */
  releaseNonce(token: string, kind: NonceKind): Promise<void>;
  gcExpiredNonces(now?: number): Promise<number>;
  // Test-only — clears every entry. Postgres adapter TRUNCATEs.
  _resetForTests?: () => Promise<void>;
}

function tokenDigest(token: string): string {
  return crypto.createHash("sha256")
    .update("aqua-auth-nonce-v1")
    .update("\0")
    .update(token)
    .digest("hex");
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
    async releaseNonce(token, kind) {
      const entry = map.get(token);
      if (entry && entry.kind === kind) map.delete(token);
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
    async releaseNonce(token, kind) {
      await ensureTable();
      const pool = await getQuery();
      await pool.query("DELETE FROM nonces WHERE token = $1 AND kind = $2", [token, kind]);
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

// ─── Supabase adapter ─────────────────────────────────────────────────────

interface SupabaseRpcResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

type SupabaseFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<SupabaseRpcResponse>;

function createSupabaseAdapter(fetchImpl: SupabaseFetch = fetch): NonceStore {
  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = resolveSupabaseUrl()?.replace(/\/$/, "");
    const secret = resolveSupabaseSecretKey();
    if (!baseUrl || !secret) {
      throw new Error("durable_nonce_store_unavailable");
    }
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: secret,
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    if (!response.ok) {
      // Never copy a provider body into an auth error: PostgREST may include
      // schema/configuration detail. Callers fail closed on this stable code.
      throw new Error(`durable_nonce_store_rpc_failed_${response.status}`);
    }
    try {
      return JSON.parse(raw || "null") as T;
    } catch {
      throw new Error("durable_nonce_store_response_invalid");
    }
  }

  return {
    kind: "supabase",
    async consumeNonce(token, kind, ttlMs) {
      if (ttlMs <= 0) return false;
      return rpc<boolean>("consume_aqua_auth_nonce", {
        p_token_hash: tokenDigest(token),
        p_kind: kind,
        p_expires_at: Date.now() + ttlMs,
      });
    },
    async releaseNonce(token, kind) {
      await rpc<boolean>("release_aqua_auth_nonce", {
        p_token_hash: tokenDigest(token),
        p_kind: kind,
      });
    },
    async gcExpiredNonces(now = Date.now()) {
      const deleted = await rpc<number>("gc_aqua_auth_nonces", { p_now: now });
      return Number.isSafeInteger(deleted) && deleted >= 0 ? deleted : 0;
    },
  };
}

// ─── Adapter resolution ──────────────────────────────────────────────────

let cached: NonceStore | null = null;

export function getNonceStore(): NonceStore {
  if (cached) {
    if (process.env.NODE_ENV === "production" && cached.kind === "memory") {
      throw new Error("durable_nonce_store_required");
    }
    return cached;
  }
  const explicit = (process.env.PORTAL_BACKEND ?? "").toLowerCase();
  const wantsPostgres = explicit === "postgres" || (!explicit && !!process.env.DATABASE_URL);
  const wantsSupabase = explicit === "supabase" || (
    !explicit
    && !process.env.DATABASE_URL
    && !!resolveSupabaseUrl()
    && !!resolveSupabaseSecretKey()
  );
  if (wantsPostgres) cached = createPostgresAdapter();
  else if (wantsSupabase) cached = createSupabaseAdapter();
  else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("durable_nonce_store_required");
    }
    cached = createMemoryAdapter();
  }
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

export function _createSupabaseAdapterForTests(fetchImpl: SupabaseFetch): NonceStore {
  return createSupabaseAdapter(fetchImpl);
}
