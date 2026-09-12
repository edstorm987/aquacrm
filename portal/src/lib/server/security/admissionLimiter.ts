// ABUSE-BASE — bounded durable atomic admission limiter foundation.
//
// This module is intentionally UNWIRED. Public/auth/provider callers are added
// only in separately reviewed lanes. The durable authority is the Supabase
// service-role RPC in `20260912190000_abuse_admission_limiter.sql`; process-local
// state is only a bounded fast-denial layer in front of it.
//
// Security invariants:
// - production never grants from process memory;
// - only canonical Supabase URL + privileged key configuration selects the RPC;
// - PostgreSQL configuration reports an exact unavailable-adapter denial rather
//   than silently trying to use the Supabase client;
// - raw IPs/identifiers never reach durable storage: bounded canonical input is
//   HMAC-SHA256 pseudonymised with the server session secret first;
// - every malformed/error authority response and invalid request fails closed;
// - local counter cardinality and cleanup work are hard-bounded; cache
//   saturation is neutral for untracked keys when durable authority exists; and
// - counters carry their own expiry, so one policy window cannot expire another.
//
// Deliberately omits `server-only` so the pure adapters can be driven by the
// local smoke. The default durable client is imported lazily.

import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";

import { resolveSupabaseSecretKey, resolveSupabaseUrl } from "@/lib/supabase/keys";

export type AdmissionDimension = "ip" | "subject" | "tenant-install" | "provider-budget";

export interface AdmissionRequest {
  dimension: AdmissionDimension;
  /** Raw, server-derived dimension value. It is validated and one-way hashed
   * before it becomes either a local map key or a durable database key. */
  key: string;
  max: number;
  windowMs: number;
  /** Injectable clock for deterministic tests; ordinary callers omit it. */
  now?: number;
}

export type AdmissionBackend = "memory" | "durable" | "fast-local" | "unavailable";

export type AdmissionErrorCode =
  | "admission_limiter_request_invalid"
  | "admission_limiter_key_invalid"
  | "admission_limiter_hash_secret_required"
  | "admission_limiter_authority_unavailable"
  | "admission_limiter_authority_response_invalid"
  | "admission_limiter_capacity_exceeded"
  | "admission_limiter_durable_authority_required"
  | "admission_limiter_memory_forbidden_in_production"
  | "admission_limiter_postgres_adapter_unavailable"
  | "admission_limiter_supabase_authority_required"
  | "admission_limiter_backend_invalid";

export interface AdmissionDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
  backend: AdmissionBackend;
  degraded: boolean;
  /** Stable internal diagnostic only. Callers must keep public responses generic. */
  errorCode?: AdmissionErrorCode;
}

export interface AdmissionStore {
  kind: "memory" | "durable" | "unavailable";
  configurationError?: AdmissionErrorCode;
  admit(req: AdmissionRequest): Promise<AdmissionDecision>;
  _resetForTests?(): Promise<void>;
  _entryCountForTests?(): number;
}

export const MAX_ADMISSION_KEY_BYTES = 256;
export const MAX_ADMISSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const MAX_LOCAL_ADMISSION_COUNTERS = 5_000;
const MIN_ADMISSION_WINDOW_MS = 1_000;
const MAX_ADMISSIONS_PER_WINDOW = 1_000_000;
const LOCAL_SWEEP_INTERVAL_MS = 1_000;
const LOCAL_HASH_DOMAIN = "aqua-admission-local-key-v1";
const DURABLE_HASH_DOMAIN = "aqua-admission-durable-key-v1";
const DIMENSIONS = new Set<AdmissionDimension>(["ip", "subject", "tenant-install", "provider-budget"]);

interface PreparedAdmission {
  now: number;
  resetAt: number;
  keyHash: string;
}

interface PreparationFailure {
  now: number;
  resetAt: number;
  errorCode: AdmissionErrorCode;
}

function windowStartMs(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function safeFallbackNow(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : Date.now();
}

function fallbackResetAt(now: number, windowMs: unknown): number {
  const safeWindow = Number.isSafeInteger(windowMs)
    && (windowMs as number) >= MIN_ADMISSION_WINDOW_MS
    && (windowMs as number) <= MAX_ADMISSION_WINDOW_MS
    ? windowMs as number
    : 60_000;
  return windowStartMs(now, safeWindow) + safeWindow;
}

function canonicalIp(value: string): string | null {
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

function canonicalAdmissionKey(dimension: AdmissionDimension, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.normalize("NFKC").trim();
  if (!normalized || Buffer.byteLength(normalized, "utf8") > MAX_ADMISSION_KEY_BYTES) return null;
  if (/\p{Cc}/u.test(normalized)) return null;
  if (dimension === "ip") {
    if (Buffer.byteLength(normalized, "utf8") > 45) return null;
    return canonicalIp(normalized);
  }
  return normalized;
}

function persistentHashSecret(): string | null {
  const value = process.env.PORTAL_SESSION_SECRET?.trim();
  return value && Buffer.byteLength(value, "utf8") >= 32 ? value : null;
}

function prepareAdmission(req: AdmissionRequest, persistent: boolean): PreparedAdmission | PreparationFailure {
  const now = safeFallbackNow(req?.now);
  const resetAt = fallbackResetAt(now, req?.windowMs);
  if (!req || !DIMENSIONS.has(req.dimension)
    || !Number.isSafeInteger(req.max) || req.max < 0 || req.max > MAX_ADMISSIONS_PER_WINDOW
    || !Number.isSafeInteger(req.windowMs)
    || req.windowMs < MIN_ADMISSION_WINDOW_MS || req.windowMs > MAX_ADMISSION_WINDOW_MS
    || (req.now !== undefined && (!Number.isSafeInteger(req.now) || req.now < 0))) {
    return { now, resetAt, errorCode: "admission_limiter_request_invalid" };
  }
  const canonical = canonicalAdmissionKey(req.dimension, req.key);
  if (!canonical) return { now, resetAt, errorCode: "admission_limiter_key_invalid" };
  const payload = `${req.dimension}\0${canonical}`;
  if (persistent) {
    const secret = persistentHashSecret();
    if (!secret) return { now, resetAt, errorCode: "admission_limiter_hash_secret_required" };
    return {
      now,
      resetAt,
      keyHash: createHmac("sha256", secret).update(DURABLE_HASH_DOMAIN).update("\0").update(payload).digest("hex"),
    };
  }
  return {
    now,
    resetAt,
    keyHash: createHash("sha256").update(LOCAL_HASH_DOMAIN).update("\0").update(payload).digest("hex"),
  };
}

function isPreparationFailure(value: PreparedAdmission | PreparationFailure): value is PreparationFailure {
  return "errorCode" in value;
}

function decide(hits: number, max: number, resetAt: number, now: number, backend: AdmissionBackend): AdmissionDecision {
  const allowed = hits <= max;
  return {
    allowed,
    remaining: Math.max(0, max - hits),
    resetAt,
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1_000)),
    backend,
    degraded: false,
  };
}

function denyFailClosed(
  resetAt: number,
  now: number,
  backend: AdmissionBackend,
  errorCode: AdmissionErrorCode,
): AdmissionDecision {
  return {
    allowed: false,
    remaining: 0,
    resetAt,
    retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
    backend,
    degraded: true,
    errorCode,
  };
}

interface WindowCounter { windowStart: number; expiresAt: number; hits: number; }
interface CounterPool { counters: Map<string, WindowCounter>; nextSweepAt: number; }

function createCounterPool(): CounterPool {
  return { counters: new Map(), nextSweepAt: 0 };
}

function bumpWindowed(
  pool: CounterPool,
  id: string,
  now: number,
  windowMs: number,
): { hits: number; resetAt: number; capacityExceeded: boolean } {
  const ws = windowStartMs(now, windowMs);
  const resetAt = ws + windowMs;
  let existing = pool.counters.get(id);
  if (existing && existing.expiresAt <= now) {
    pool.counters.delete(id);
    existing = undefined;
  }
  if (existing && existing.windowStart === ws) {
    existing.hits += 1;
    return { hits: existing.hits, resetAt, capacityExceeded: false };
  }
  if (!existing && pool.counters.size >= MAX_LOCAL_ADMISSION_COUNTERS) {
    // At most one full, fixed-size sweep per second. Once the hard cap remains
    // full, distinct-key floods are O(1) denials instead of repeated O(n) scans.
    if (now >= pool.nextSweepAt) {
      for (const [key, counter] of pool.counters) {
        if (counter.expiresAt <= now) pool.counters.delete(key);
      }
      pool.nextSweepAt = now + LOCAL_SWEEP_INTERVAL_MS;
    }
    if (pool.counters.size >= MAX_LOCAL_ADMISSION_COUNTERS) {
      return { hits: 0, resetAt, capacityExceeded: true };
    }
  }
  pool.counters.set(id, { windowStart: ws, expiresAt: resetAt, hits: 1 });
  return { hits: 1, resetAt, capacityExceeded: false };
}

export function createMemoryAdmissionStore(): AdmissionStore {
  const pool = createCounterPool();
  return {
    kind: "memory",
    async admit(req) {
      const prepared = prepareAdmission(req, false);
      if (isPreparationFailure(prepared)) {
        return denyFailClosed(prepared.resetAt, prepared.now, "memory", prepared.errorCode);
      }
      const id = `${req.dimension}:${req.windowMs}:${prepared.keyHash}`;
      const result = bumpWindowed(pool, id, prepared.now, req.windowMs);
      if (result.capacityExceeded) {
        return denyFailClosed(result.resetAt, prepared.now, "memory", "admission_limiter_capacity_exceeded");
      }
      return decide(result.hits, req.max, result.resetAt, prepared.now, "memory");
    },
    async _resetForTests() {
      pool.counters.clear();
      pool.nextSweepAt = 0;
    },
    _entryCountForTests() { return pool.counters.size; },
  };
}

export interface AdmissionRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

async function defaultRpcClient(): Promise<AdmissionRpcClient> {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  return createSupabaseAdminClient() as unknown as AdmissionRpcClient;
}

function malformedAuthority(prepared: PreparedAdmission): AdmissionDecision {
  return denyFailClosed(
    prepared.resetAt,
    prepared.now,
    "durable",
    "admission_limiter_authority_response_invalid",
  );
}

export function createDurableAdmissionStore(
  clientFactory: () => Promise<AdmissionRpcClient> = defaultRpcClient,
): AdmissionStore {
  return {
    kind: "durable",
    async admit(req) {
      const prepared = prepareAdmission(req, true);
      if (isPreparationFailure(prepared)) {
        return denyFailClosed(prepared.resetAt, prepared.now, "durable", prepared.errorCode);
      }
      let client: AdmissionRpcClient;
      try {
        client = await clientFactory();
      } catch {
        return denyFailClosed(
          prepared.resetAt,
          prepared.now,
          "durable",
          "admission_limiter_authority_unavailable",
        );
      }
      try {
        const { data, error } = await client.rpc("abuse_admission_check", {
          p_dimension: req.dimension,
          p_key_hash: prepared.keyHash,
          p_max: req.max,
          p_window_ms: req.windowMs,
          p_now_ms: prepared.now,
        });
        if (error || !Array.isArray(data) || data.length !== 1) return malformedAuthority(prepared);
        const row = data[0];
        if (!row || typeof row !== "object" || Array.isArray(row)) return malformedAuthority(prepared);
        const allowed = Reflect.get(row, "allowed");
        const hits = Reflect.get(row, "hits");
        const resetAt = Reflect.get(row, "reset_at");
        if (typeof allowed !== "boolean"
          || !Number.isSafeInteger(hits) || (hits as number) < 1
          || !Number.isSafeInteger(resetAt) || resetAt !== prepared.resetAt
          || allowed !== ((hits as number) <= req.max)) {
          return malformedAuthority(prepared);
        }
        return decide(hits as number, req.max, resetAt as number, prepared.now, "durable");
      } catch {
        return denyFailClosed(
          prepared.resetAt,
          prepared.now,
          "durable",
          "admission_limiter_authority_unavailable",
        );
      }
    },
  };
}

function createUnavailableAdmissionStore(errorCode: AdmissionErrorCode): AdmissionStore {
  return {
    kind: "unavailable",
    configurationError: errorCode,
    async admit(req) {
      const now = safeFallbackNow(req?.now);
      return denyFailClosed(fallbackResetAt(now, req?.windowMs), now, "unavailable", errorCode);
    },
  };
}

function hasCanonicalSupabaseAuthority(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseSecretKey());
}

function resolveConfiguredStore(): AdmissionStore {
  const production = process.env.NODE_ENV === "production";
  const explicit = (process.env.ABUSE_ADMISSION_BACKEND ?? "").trim().toLowerCase();
  const portalBackend = (process.env.PORTAL_BACKEND ?? "").trim().toLowerCase();
  const hasSupabase = hasCanonicalSupabaseAuthority();

  if (explicit) {
    if (explicit === "memory") {
      return production
        ? createUnavailableAdmissionStore("admission_limiter_memory_forbidden_in_production")
        : createMemoryAdmissionStore();
    }
    if (explicit === "supabase" || explicit === "durable") {
      return hasSupabase
        ? createDurableAdmissionStore()
        : createUnavailableAdmissionStore("admission_limiter_supabase_authority_required");
    }
    if (explicit === "postgres") {
      return createUnavailableAdmissionStore("admission_limiter_postgres_adapter_unavailable");
    }
    return createUnavailableAdmissionStore("admission_limiter_backend_invalid");
  }

  // The repository has a real PostgreSQL state/nonce adapter, but this limiter's
  // migration and atomic function exist only in the Supabase migration chain.
  // Do not mislabel a Supabase RPC client as a PostgreSQL implementation.
  if (portalBackend === "postgres" || (!portalBackend && process.env.DATABASE_URL)) {
    return createUnavailableAdmissionStore("admission_limiter_postgres_adapter_unavailable");
  }
  if (portalBackend === "supabase") {
    return hasSupabase
      ? createDurableAdmissionStore()
      : createUnavailableAdmissionStore("admission_limiter_supabase_authority_required");
  }
  if (hasSupabase) return createDurableAdmissionStore();
  if (production) return createUnavailableAdmissionStore("admission_limiter_durable_authority_required");
  return createMemoryAdmissionStore();
}

let cachedStore: AdmissionStore | null = null;

export function resolveAdmissionStore(): AdmissionStore {
  if (!cachedStore) cachedStore = resolveConfiguredStore();
  return cachedStore;
}

const fastLocal = createCounterPool();

export async function admit(req: AdmissionRequest): Promise<AdmissionDecision> {
  const prepared = prepareAdmission(req, false);
  if (isPreparationFailure(prepared)) {
    return denyFailClosed(prepared.resetAt, prepared.now, "unavailable", prepared.errorCode);
  }
  const store = resolveAdmissionStore();
  if (store.kind === "durable") {
    const id = `${req.dimension}:${req.windowMs}:${prepared.keyHash}`;
    const result = bumpWindowed(fastLocal, id, prepared.now, req.windowMs);
    if (result.capacityExceeded) {
      // The optional prefilter has no authority over a key it could not track.
      // Keep its hard memory bound and defer the decision to the durable store.
      return store.admit(req);
    }
    if (result.hits > req.max) return decide(result.hits, req.max, result.resetAt, prepared.now, "fast-local");
  }
  return store.admit(req);
}

export async function _swapAdmissionStoreForTests(store: AdmissionStore | null): Promise<void> {
  if (cachedStore?._resetForTests) {
    try { await cachedStore._resetForTests(); } catch { /* best-effort */ }
  }
  cachedStore = store;
}

export function _resetAdmissionFastLocalForTests(): void {
  fastLocal.counters.clear();
  fastLocal.nextSweepAt = 0;
}
