import "server-only";

import type {
  RadarInfraBackend,
  RadarInfraDatabaseHealth,
  RadarInfraHealthSnapshot,
  RadarInfraProbeStatus,
  RadarInfraStorageHealth,
} from "@/lib/businessRadar";

/**
 * Database & storage health probe (radar upgrade Stage 4 — the first new signal
 * on the sweep structure).
 *
 * Promotes `healthz/full`'s private `probeDb()` into a reusable
 * `databaseStorageHealth()` that reports, for the primary backend: which backend
 * is in use, `connected | down | untested`, round-trip latency, and best-effort
 * row counts of key tables. It additionally probes a registry of **external**
 * database targets (Ed's personal-site DBs) for reachability + latency.
 *
 * Secret-safe: external targets are declared as `{ id, label, urlEnvVar }` in the
 * `RADAR_EXTERNAL_DB_TARGETS` env (JSON). The connection string itself lives in
 * the referenced env var — never in the target list, never in PortalState.
 *
 * Honest limits: total Supabase Storage bytes is not available from the
 * service-role client, so storage is reported as "not available in-app" rather
 * than faked (plan Part D §4). Runs only on the Infra sweep — never in the Pulse.
 */

const PRIMARY_ROW_COUNT_TABLES = ["app_datastores", "portal_kv", "brand_enquiries"] as const;
const EXTERNAL_PROBE_TIMEOUT_MS = 8_000;

interface ExternalTargetSpec {
  id: string;
  label: string;
  urlEnvVar: string;
}

function detectPrimaryBackend(): RadarInfraBackend {
  const explicit = (process.env.PORTAL_BACKEND ?? "").toLowerCase();
  if (explicit === "postgres") return "postgres";
  if (explicit === "supabase") return "supabase";
  if (explicit === "file") return "file";
  if (explicit === "memory") return "memory";
  if (process.env.DATABASE_URL) return "postgres";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  return "file";
}

async function probePrimary(now: number): Promise<RadarInfraDatabaseHealth> {
  const backend = detectPrimaryBackend();
  const base = { id: "primary", label: "AquaCRM database", backend, external: false };
  // File / memory backends have no external database to reach — untested is the
  // honest terminal state (matching probeDb), not a failure and not a fake pass.
  if (backend === "file" || backend === "memory" || backend === "unknown") {
    return { ...base, status: "untested", latencyMs: null };
  }
  const startedAt = Date.now();
  try {
    if (backend === "postgres") {
      const { getPool } = await import("@/server/storagePostgres");
      const pool = getPool();
      await pool.query("SELECT 1");
      const latencyMs = Date.now() - startedAt;
      return { ...base, status: "connected", latencyMs, rowCounts: await postgresRowCounts(pool) };
    }
    // supabase
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const client = createSupabaseAdminClient();
    const { error } = await client.from("app_datastores").select("app_key").limit(1);
    if (error) throw error;
    const latencyMs = Date.now() - startedAt;
    return { ...base, status: "connected", latencyMs, rowCounts: await supabaseRowCounts(client) };
  } catch (error) {
    return { ...base, status: "down", latencyMs: Date.now() - startedAt, error: errorMessage(error) };
  }
}

async function postgresRowCounts(pool: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<Record<string, number> | undefined> {
  const counts: Record<string, number> = {};
  for (const table of PRIMARY_ROW_COUNT_TABLES) {
    try {
      // Table name is from a fixed allow-list constant, never user input.
      const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
      const value = result.rows[0]?.count;
      if (typeof value === "number" && Number.isFinite(value)) counts[table] = value;
    } catch {
      // Missing table on this deployment — omit it rather than fake a zero.
    }
  }
  return Object.keys(counts).length ? counts : undefined;
}

async function supabaseRowCounts(client: ReturnType<typeof import("@/lib/supabase/admin")["createSupabaseAdminClient"]>): Promise<Record<string, number> | undefined> {
  const counts: Record<string, number> = {};
  for (const table of PRIMARY_ROW_COUNT_TABLES) {
    try {
      const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
      if (!error && typeof count === "number") counts[table] = count;
    } catch {
      // Missing table — omit rather than fake.
    }
  }
  return Object.keys(counts).length ? counts : undefined;
}

function readExternalTargets(): ExternalTargetSpec[] {
  const raw = process.env.RADAR_EXTERNAL_DB_TARGETS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const spec = entry as Record<string, unknown>;
      if (typeof spec.id !== "string" || typeof spec.urlEnvVar !== "string") return [];
      return [{ id: spec.id, label: typeof spec.label === "string" ? spec.label : spec.id, urlEnvVar: spec.urlEnvVar }];
    });
  } catch {
    return [];
  }
}

async function probeExternalTarget(spec: ExternalTargetSpec): Promise<RadarInfraDatabaseHealth> {
  const base = { id: spec.id, label: spec.label, backend: "postgres" as RadarInfraBackend, external: true };
  const connectionString = process.env[spec.urlEnvVar]?.trim();
  // No connection string wired yet → untested (honest: registered but not reachable to check).
  if (!connectionString) {
    return { ...base, status: "untested", latencyMs: null, error: `Set ${spec.urlEnvVar} to probe this database.` };
  }
  const startedAt = Date.now();
  const { Pool } = await import("pg");
  let pool: InstanceType<typeof Pool> | null = null;
  try {
    pool = new Pool({ connectionString, ...externalSsl(connectionString), max: 1, connectionTimeoutMillis: EXTERNAL_PROBE_TIMEOUT_MS });
    await pool.query("SELECT 1");
    return { ...base, status: "connected", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ...base, status: "down", latencyMs: Date.now() - startedAt, error: errorMessage(error) };
  } finally {
    await pool?.end().catch(() => {});
  }
}

function externalSsl(connectionString: string): { ssl?: { rejectUnauthorized: boolean } } {
  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get("sslmode");
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const wantsTls = (sslmode && sslmode !== "disable") || (!sslmode && !isLocal);
    return wantsTls ? { ssl: { rejectUnauthorized: false } } : {};
  } catch {
    return {};
  }
}

function storageHealth(backend: RadarInfraBackend): RadarInfraStorageHealth {
  return {
    backend,
    bucketBytes: null,
    measurable: false,
    note: "Total storage bytes are not available from the service-role client (Supabase management API required). Reachability, latency and row counts are real.",
  };
}

/** Probe primary + external databases and storage. Called by the Infra sweep only. */
export async function databaseStorageHealth(now = Date.now()): Promise<RadarInfraHealthSnapshot> {
  const primary = await probePrimary(now);
  const external = await Promise.all(readExternalTargets().map(probeExternalTarget));
  return { checkedAt: now, primary, external, storage: storageHealth(primary.backend) };
}

/** Compact single-line health for `healthz/full` (backwards-compatible with probeDb's shape). */
export function primaryDbProbeStatus(snapshot: RadarInfraHealthSnapshot): { ok: boolean; db: RadarInfraProbeStatus; error?: string } {
  return { ok: snapshot.primary.status !== "down", db: snapshot.primary.status, error: snapshot.primary.error };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
