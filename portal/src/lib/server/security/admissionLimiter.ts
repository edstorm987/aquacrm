// ABUSE-BASE-001 — durable atomic admission limiter.
//
// The existing process-local limiters (`rateLimit.ts`, the login lockout) reset
// on every cold start and never see across serverless instances, so they can
// only SLOW an attack, never prove a bound — the queue item is explicit that
// "existing process-local maps remain only a fast extra layer and cannot count
// as production evidence."
//
// This module introduces a DURABLE, ATOMIC admission control across the four
// abuse dimensions — IP, subject digest, tenant/install and provider-budget —
// mirroring the durable nonce store's shape:
//
//   - Durable adapter: a single service-role-only Postgres RPC
//     (`public.abuse_admission_check`, fixed `search_path`) that counts within a
//     fixed window in ONE atomic statement. It is the AUTHORITY.
//   - Memory adapter: local/test only, same windowed semantics, atomic within
//     the single-threaded event loop.
//   - A small process-local pre-filter kept ONLY as a fast extra layer in FRONT
//     of the durable authority: because a per-process count is always <= the
//     global count, a local overflow proves a global overflow, so it may add an
//     early denial but can never grant what the authority would deny.
//   - Fail-closed: when the durable backend is configured but UNAVAILABLE, the
//     decision is DENY (`degraded: true`), never a silent allow.
//
// Deliberately omits `server-only` (like `nonceStore.ts`) so the memory adapter
// and the durable adapter's logic can be driven under `tsx --test`; the durable
// adapter lazy-imports the Supabase admin client and only touches a database
// when actually selected in a configured deployment (never in a test, which
// injects a fake client).

export type AdmissionDimension = "ip" | "subject" | "tenant-install" | "provider-budget";

export interface AdmissionRequest {
  /** Which abuse dimension is being metered. Keeps the key spaces disjoint. */
  dimension: AdmissionDimension;
  /** The value within the dimension: an IP, a salted subject digest, a
   *  `${tenantId}:${installId}` pair, or a provider-budget id. */
  key: string;
  /** Maximum admissions allowed within the window. */
  max: number;
  /** Fixed window length in ms. */
  windowMs: number;
  /** Injectable clock (tests). */
  now?: number;
}

export type AdmissionBackend = "memory" | "durable" | "fast-local";

export interface AdmissionDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
  /** Which layer produced this decision. */
  backend: AdmissionBackend;
  /** True when the durable authority was expected but unavailable and the
   *  request was therefore denied (fail-closed), not counted. */
  degraded: boolean;
}

export interface AdmissionStore {
  kind: "memory" | "durable";
  admit(req: AdmissionRequest): Promise<AdmissionDecision>;
  _resetForTests?(): Promise<void>;
}

// ─── Shared helpers ───────────────────────────────────────────────────────

function windowStartMs(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function decide(
  hits: number,
  max: number,
  resetAt: number,
  now: number,
  backend: AdmissionBackend,
): AdmissionDecision {
  const allowed = hits <= max;
  return {
    allowed,
    remaining: Math.max(0, max - hits),
    resetAt,
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
    backend,
    degraded: false,
  };
}

function denyFailClosed(resetAt: number, now: number): AdmissionDecision {
  return {
    allowed: false,
    remaining: 0,
    resetAt,
    retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    backend: "durable",
    degraded: true,
  };
}

interface WindowCounter { windowStart: number; hits: number; }

function bumpWindowed(
  counters: Map<string, WindowCounter>,
  id: string,
  now: number,
  windowMs: number,
): { hits: number; resetAt: number } {
  const ws = windowStartMs(now, windowMs);
  const existing = counters.get(id);
  let hits: number;
  if (!existing || existing.windowStart !== ws) {
    counters.set(id, { windowStart: ws, hits: 1 });
    hits = 1;
  } else {
    existing.hits += 1;
    hits = existing.hits;
  }
  // Opportunistic bound so a flood of distinct keys cannot grow the map without
  // limit — expired windows are dropped once the map is large.
  if (counters.size > 5000) {
    for (const [k, c] of counters) {
      if (c.windowStart + windowMs < now) counters.delete(k);
    }
  }
  return { hits, resetAt: ws + windowMs };
}

// ─── Memory adapter (local/test only) ─────────────────────────────────────

export function createMemoryAdmissionStore(): AdmissionStore {
  const counters = new Map<string, WindowCounter>();
  return {
    kind: "memory",
    async admit(req) {
      const now = req.now ?? Date.now();
      // Read-modify-write with no `await` between: atomic on the single-threaded
      // event loop, so concurrent admits cannot lose an update.
      const { hits, resetAt } = bumpWindowed(counters, `${req.dimension}:${req.key}`, now, req.windowMs);
      return decide(hits, req.max, resetAt, now, "memory");
    },
    async _resetForTests() { counters.clear(); },
  };
}

// ─── Durable adapter (service-role RPC; the authority) ────────────────────

/** The minimal surface the durable adapter needs — satisfied by the Supabase
 *  service-role client and by a fake in tests. */
export interface AdmissionRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

interface AbuseAdmissionRow {
  allowed?: unknown;
  hits?: unknown;
  reset_at?: unknown;
}

async function defaultRpcClient(): Promise<AdmissionRpcClient> {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  return createSupabaseAdminClient() as unknown as AdmissionRpcClient;
}

export function createDurableAdmissionStore(
  clientFactory: () => Promise<AdmissionRpcClient> = defaultRpcClient,
): AdmissionStore {
  return {
    kind: "durable",
    async admit(req) {
      const now = req.now ?? Date.now();
      const resetAt = windowStartMs(now, req.windowMs) + req.windowMs;
      let client: AdmissionRpcClient;
      try {
        client = await clientFactory();
      } catch {
        return denyFailClosed(resetAt, now);
      }
      try {
        const { data, error } = await client.rpc("abuse_admission_check", {
          p_dimension: req.dimension,
          p_key: req.key,
          p_max: req.max,
          p_window_ms: req.windowMs,
          p_now_ms: now,
        });
        if (error || data == null) return denyFailClosed(resetAt, now);
        const row = (Array.isArray(data) ? data[0] : data) as AbuseAdmissionRow | undefined;
        const hits = Number(row?.hits);
        if (!Number.isFinite(hits)) return denyFailClosed(resetAt, now);
        const rAt = Number(row?.reset_at);
        const boundedReset = Number.isFinite(rAt) && rAt > 0 ? rAt : resetAt;
        const allowed = row?.allowed === true && hits <= req.max;
        return {
          allowed,
          remaining: Math.max(0, req.max - hits),
          resetAt: boundedReset,
          retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((boundedReset - now) / 1000)),
          backend: "durable",
          degraded: false,
        };
      } catch {
        return denyFailClosed(resetAt, now);
      }
    },
  };
}

// ─── Backend resolution ───────────────────────────────────────────────────

function durableConfigured(): boolean {
  const explicit = (process.env.ABUSE_ADMISSION_BACKEND ?? "").toLowerCase();
  if (explicit === "durable" || explicit === "postgres") return true;
  if (explicit === "memory") return false;
  // Default: durable whenever a Postgres/Supabase backend is configured.
  return (process.env.PORTAL_BACKEND ?? "").toLowerCase() === "postgres" || Boolean(process.env.DATABASE_URL);
}

let cachedStore: AdmissionStore | null = null;

export function resolveAdmissionStore(): AdmissionStore {
  if (cachedStore) return cachedStore;
  cachedStore = durableConfigured() ? createDurableAdmissionStore() : createMemoryAdmissionStore();
  return cachedStore;
}

// ─── Fast process-local pre-filter (in front of the durable authority) ────

const fastLocal = new Map<string, WindowCounter>();

/**
 * The top-level admission check. When the authority is durable, a per-process
 * pre-filter runs first: a local overflow proves a global overflow, so it denies
 * early without a remote round-trip. It never grants — a request the pre-filter
 * lets through is still decided by the durable authority. When the authority is
 * the memory adapter (local/test), the pre-filter is skipped so there is exactly
 * one counter.
 */
export async function admit(req: AdmissionRequest): Promise<AdmissionDecision> {
  const now = req.now ?? Date.now();
  const store = resolveAdmissionStore();
  if (store.kind === "durable") {
    const { hits, resetAt } = bumpWindowed(fastLocal, `${req.dimension}:${req.key}`, now, req.windowMs);
    if (hits > req.max) return decide(hits, req.max, resetAt, now, "fast-local");
  }
  return store.admit({ ...req, now });
}

// ─── Test-only surface ────────────────────────────────────────────────────

export async function _swapAdmissionStoreForTests(store: AdmissionStore | null): Promise<void> {
  if (cachedStore?._resetForTests) {
    try { await cachedStore._resetForTests(); } catch { /* best-effort */ }
  }
  cachedStore = store;
}

export function _resetAdmissionFastLocalForTests(): void {
  fastLocal.clear();
}
