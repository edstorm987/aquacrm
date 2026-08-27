import "server-only";
// Postgres backend for the portal storage abstraction.
//
// Single-row blob layout — the entire `PortalState` JSON lives in one
// row of `portal_kv` keyed `__portal_state__`. This keeps the existing
// snapshot+debounced-flush model intact: every consumer reads
// synchronously from the in-memory cache, and writes flush the whole
// state once per debounce window. The schema's `key/value/updated_at`
// shape is intentionally future-compatible — we can later split state
// into per-key rows without changing the table.
//
// Connection: a process-wide `pg.Pool` constructed from `DATABASE_URL`.
// The pool is lazy — created on the first hydrate, reused for every
// flush. SSL is enabled when `DATABASE_URL` requests it (Neon /
// Supabase / Vercel Postgres all do via `?sslmode=require`).
//
// `loadBlob` and `saveBlob` are the only exports the storage layer
// needs. Errors propagate up to the caller; `storage.ts` already
// catches and falls back gracefully (cache stays in memory; flushing
// is retried on next mutation).

import { Pool, type PoolConfig } from "pg";
import type { PortalState } from "./types";
import {
  applyDevTeamWorkspaceFileMutations,
  type DevTeamWorkspaceFileMutation,
} from "./devTeamWorkspacePersistence";

export const STATE_KEY = "__portal_state__";

export function stateKeyForRealm(realmId = "live"): string {
  const clean = realmId.trim().toLowerCase();
  return clean === "live" ? STATE_KEY : `${STATE_KEY}:realm:${clean}`;
}

let pool: Pool | null = null;

function buildPool(connectionString: string): Pool {
  // Cloud Postgres providers (Neon / Supabase / Vercel Postgres) all
  // require TLS. Honour the URL's sslmode if present; fall back to
  // requiring TLS for any non-localhost host. Self-signed certs accepted
  // — `DATABASE_URL` is a private secret pinned to a known provider.
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const wantsTls =
    (sslmode && sslmode !== "disable") || (!sslmode && !isLocal);
  const config: PoolConfig = {
    connectionString,
    // Pool defaults: 10 idle connections, 30s idleTimeout. Overridable
    // via env if a deployment needs different sizing.
    max: parseInt(process.env.PORTAL_PG_POOL_MAX ?? "10", 10),
    idleTimeoutMillis: parseInt(process.env.PORTAL_PG_IDLE_MS ?? "30000", 10),
    connectionTimeoutMillis: parseInt(process.env.PORTAL_PG_CONNECT_MS ?? "10000", 10),
    ssl: wantsTls ? { rejectUnauthorized: false } : undefined,
  };
  return new Pool(config);
}

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[postgres] DATABASE_URL is unset; Postgres backend is unavailable. " +
        "Either set DATABASE_URL or unset PORTAL_BACKEND so the file backend takes over.",
    );
  }
  pool = buildPool(url);
  return pool;
}

// Test/dev helper: drop the pool so a fresh process can rebuild one.
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function loadBlob(realmId = "live"): Promise<string | null> {
  const p = getPool();
  const stateKey = stateKeyForRealm(realmId);
  // SELECT … LIMIT 1 — JSONB returns as a parsed object via node-pg's
  // type coercion. Stringify to match the file backend's `string`
  // contract; storage.ts then re-parses through `parseBlob`.
  const result = await p.query<{ value: unknown }>(
    "SELECT value FROM portal_kv WHERE key = $1 LIMIT 1",
    [stateKey],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  if (row.value === null || row.value === undefined) return null;
  return typeof row.value === "string" ? row.value : JSON.stringify(row.value);
}

export async function saveBlob(content: string, realmId = "live"): Promise<void> {
  const p = getPool();
  const stateKey = stateKeyForRealm(realmId);
  // The blob is opaque-to-postgres but typed JSONB so JSON-aware tooling
  // (psql, BI dashboards) sees structure. We cast string → jsonb in the
  // statement so `pg` doesn't quote the JSON as a string literal.
  await p.query(
    `INSERT INTO portal_kv (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = EXCLUDED.updated_at`,
    [stateKey, content],
  );
}

export async function applyDevTeamWorkspaceFiles(
  operations: DevTeamWorkspaceFileMutation[],
  realmId = "live",
): Promise<string> {
  const stateKey = stateKeyForRealm(realmId);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO portal_kv (key, value, updated_at)
       VALUES ($1, '{}'::jsonb, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [stateKey],
    );
    const result = await client.query<{ value: unknown }>(
      "SELECT value FROM portal_kv WHERE key = $1 FOR UPDATE",
      [stateKey],
    );
    const raw = result.rows[0]?.value;
    const state = (typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw ?? {})) as PortalState;
    applyDevTeamWorkspaceFileMutations(state, operations);
    const content = JSON.stringify(state);
    await client.query(
      "UPDATE portal_kv SET value = $2::jsonb, updated_at = NOW() WHERE key = $1",
      [stateKey, content],
    );
    await client.query("COMMIT");
    return content;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function claimEditorAiReply(claimKey: string, holderId: string, leaseMs: number, realmId = "live"): Promise<unknown> {
  const stateKey = stateKeyForRealm(realmId);
  const result = await getPool().query<{ result: unknown }>(
    "SELECT public.claim_editor_ai_reply($1, $2, $3, $4)::jsonb AS result",
    [stateKey, claimKey, holderId, Math.max(1_000, Math.floor(leaseMs))],
  );
  return result.rows[0]?.result;
}

export async function completeEditorAiReply(claimKey: string, holderId: string, realmId = "live"): Promise<void> {
  await getPool().query(
    "SELECT public.complete_editor_ai_reply($1, $2, $3)",
    [stateKeyForRealm(realmId), claimKey, holderId],
  );
}

export async function releaseEditorAiReply(claimKey: string, holderId: string, realmId = "live"): Promise<void> {
  await getPool().query(
    "SELECT public.release_editor_ai_reply($1, $2, $3)",
    [stateKeyForRealm(realmId), claimKey, holderId],
  );
}

export async function claimLeadConversion(
  claimKey: string,
  requestHash: string,
  holderId: string,
  leaseMs: number,
  realmId = "live",
): Promise<unknown> {
  const result = await getPool().query<{ result: unknown }>(
    "SELECT public.claim_lead_conversion($1, $2, $3, $4, $5)::jsonb AS result",
    [stateKeyForRealm(realmId), claimKey, requestHash, holderId, Math.max(1_000, Math.floor(leaseMs))],
  );
  return result.rows[0]?.result;
}

export async function completeLeadConversion(
  claimKey: string,
  requestHash: string,
  holderId: string,
  result: unknown,
  realmId = "live",
): Promise<void> {
  await getPool().query(
    "SELECT public.complete_lead_conversion($1, $2, $3, $4, $5::jsonb)",
    [stateKeyForRealm(realmId), claimKey, requestHash, holderId, JSON.stringify(result)],
  );
}

export async function failLeadConversion(
  claimKey: string,
  requestHash: string,
  holderId: string,
  error: string,
  realmId = "live",
): Promise<void> {
  await getPool().query(
    "SELECT public.fail_lead_conversion($1, $2, $3, $4, $5)",
    [stateKeyForRealm(realmId), claimKey, requestHash, holderId, error.slice(0, 1_000)],
  );
}

export async function claimProductWorkspaceLease(
  workspaceKey: string,
  holderId: string,
  leaseMs: number,
  realmId = "live",
): Promise<unknown> {
  const result = await getPool().query<{ result: unknown }>(
    "SELECT public.claim_product_workspace_lease($1, $2, $3, $4)::jsonb AS result",
    [stateKeyForRealm(realmId), workspaceKey, holderId, Math.max(1_000, Math.floor(leaseMs))],
  );
  return result.rows[0]?.result;
}

export async function releaseProductWorkspaceLease(
  workspaceKey: string,
  holderId: string,
  realmId = "live",
): Promise<void> {
  await getPool().query(
    "SELECT public.release_product_workspace_lease($1, $2, $3)",
    [stateKeyForRealm(realmId), workspaceKey, holderId],
  );
}

// Diagnostics — inspectable from a /api/dev/storage-info route.
export interface PostgresInfo {
  ready: boolean;
  pool: { max: number; idle: number; total: number; waiting: number } | null;
  connectionHost?: string;
  ssl?: boolean;
}

export function describePostgres(): PostgresInfo {
  if (!pool) return { ready: false, pool: null };
  const url = process.env.DATABASE_URL;
  let host: string | undefined;
  let ssl: boolean | undefined;
  if (url) {
    try {
      const u = new URL(url);
      host = u.hostname;
      const sslmode = u.searchParams.get("sslmode");
      ssl = (sslmode !== null && sslmode !== "disable") || (host !== "localhost" && host !== "127.0.0.1");
    } catch { /* ignore */ }
  }
  return {
    ready: true,
    pool: {
      max: pool.options?.max ?? 10,
      idle: pool.idleCount,
      total: pool.totalCount,
      waiting: pool.waitingCount,
    },
    connectionHost: host,
    ssl,
  };
}
