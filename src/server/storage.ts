import "server-only";
// Server-side state for the portal — multi-backend persistence.
//
// Pattern lifted from `02 felicias aqua portal work/src/portal/server/storage.ts`:
// sync reads from in-memory cache, async debounced writes to the backend.
// Foundation ships only the file backend; KV / Postgres slots are stubbed
// so the contract is identical and future migrations are a single-file change.
//
// Reads (`getState`) stay sync — every domain module calls them as if free.
// Cold start: the first `ensureHydrated()` populates the cache from disk;
// route handlers `await ensureHydrated()` once at the top before reading.
// Writes are debounced 250 ms and flushed asynchronously.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import type { PortalState } from "./types";

const empty = (): PortalState => ({
  agencies: {},
  clients: {},
  endCustomers: {},
  users: {},
  pluginInstalls: {},
  pluginData: {},
  phases: {},
  activity: [],
  pipelines: {},
  pipelineCards: {},
});

// ─── Backend interface ────────────────────────────────────────────────────

export type BackendKind = "file" | "memory" | "kv" | "postgres";

interface Backend {
  kind: BackendKind;
  persistent: boolean;
  description: string;
  loadBlob(): Promise<string | null>;
  saveBlob(content: string): Promise<void>;
}

// ─── File backend (dev default) ───────────────────────────────────────────

const DATA_FILE = resolve(process.cwd(), ".data", "portal-state.json");

const fileBackend: Backend = {
  kind: "file",
  persistent: true,
  description: `JSON file at ${DATA_FILE}`,
  async loadBlob() {
    if (!existsSync(DATA_FILE)) return null;
    try { return readFileSync(DATA_FILE, "utf-8"); }
    catch { return null; }
  },
  async saveBlob(content) {
    const dir = dirname(DATA_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DATA_FILE, content, "utf-8");
  },
};

// ─── Memory backend (tests / read-only hosts) ─────────────────────────────

let memoryBlob: string | null = null;
const memoryBackend: Backend = {
  kind: "memory",
  persistent: false,
  description: "In-memory only — state evaporates when the process exits.",
  async loadBlob() { return memoryBlob; },
  async saveBlob(content) { memoryBlob = content; },
};

// ─── Stub (KV lands in a later round) ─────────────────────────────────────

const kvStub: Backend = {
  kind: "kv",
  persistent: false,
  description: "KV backend slot — not yet wired in foundation.",
  async loadBlob() { throw new Error("PORTAL_BACKEND=kv: not yet wired."); },
  async saveBlob() { throw new Error("PORTAL_BACKEND=kv: not yet wired."); },
};

// ─── Postgres backend (R7) ────────────────────────────────────────────────
//
// Real driver shipped in `storagePostgres.ts`. The backend wrapper
// keeps storage.ts free of the `pg` dependency at parse-time — the
// dynamic import only fires when this driver is actually selected,
// so a dev server with `PORTAL_BACKEND=file` (the default) doesn't
// pull `pg` into the bundle path.

const postgresBackend: Backend = {
  kind: "postgres",
  persistent: true,
  description: "Postgres (single-row JSONB blob in `portal_kv` keyed `__portal_state__`).",
  async loadBlob() {
    const { loadBlob } = await import("./storagePostgres");
    return loadBlob();
  },
  async saveBlob(content) {
    const { saveBlob } = await import("./storagePostgres");
    return saveBlob(content);
  },
};

function pickBackend(): Backend {
  const explicit = (process.env.PORTAL_BACKEND ?? "").toLowerCase();
  switch (explicit) {
    case "memory":   return memoryBackend;
    case "kv":       return kvStub;
    case "postgres": return postgresBackend;
    case "file":
    case "":
    default: {
      // Implicit promotion: when `DATABASE_URL` is set but PORTAL_BACKEND
      // wasn't explicitly chosen, prefer Postgres over file. This makes
      // production deploys "set DATABASE_URL and go" while keeping
      // local dev (no DATABASE_URL) on the file backend.
      if (!explicit && process.env.DATABASE_URL) return postgresBackend;
      return fileBackend;
    }
  }
}

const backend = pickBackend();

// ─── Cache + hydration + flush ────────────────────────────────────────────

let cache: PortalState | null = null;
let writable = backend.persistent;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;

let hydrated = false;
let hydratePromise: Promise<void> | null = null;

export async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        let raw = await backend.loadBlob();
        // R027 dual-read fallback. When Postgres is configured but the
        // blob row is missing (fresh DB / partial migration), read from
        // the file backend once, hydrate the cache, and stamp Postgres
        // so subsequent boots find the row natively. Logs a one-time
        // migration event so operators see the seam.
        if (!raw && backend.kind === "postgres") {
          try {
            const fallback = await fileBackend.loadBlob();
            if (fallback) {
              raw = fallback;
              // Fire-and-forget: write the file blob into Postgres so
              // the next cold start reads natively. Errors surface in
              // the warn channel; cache is already populated either way.
              backend
                .saveBlob(fallback)
                .then(() => {
                  if (process.env.NODE_ENV !== "test") {
                    console.warn("[portal] dual-read fallback: hydrated cache from file backend + wrote to Postgres.");
                  }
                })
                .catch(err => {
                  console.warn(
                    "[portal] dual-read fallback: file→postgres write failed:",
                    err instanceof Error ? err.message : err,
                  );
                });
            }
          } catch (fallbackErr) {
            // File-backend read failure is non-fatal — cache stays empty.
            if (process.env.NODE_ENV !== "test") {
              console.warn(
                "[portal] dual-read fallback: file backend unavailable:",
                fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
              );
            }
          }
        }
        cache = raw ? parseBlob(raw) : empty();
        // R025: migrate legacy single-agency user rows in place. Pure +
        // idempotent — re-running on already-migrated rows is a no-op.
        // Lazy-import to avoid pulling the migration helper into every
        // storage consumer's bundle.
        const { migrateUsersSchema } = await import("./userSchemaMigration");
        migrateUsersSchema(cache.users);
      } catch (e) {
        if (process.env.NODE_ENV !== "test") {
          console.warn(
            `[portal] backend "${backend.kind}" failed to load:`,
            e instanceof Error ? e.message : e,
          );
        }
        cache = empty();
      } finally {
        hydrated = true;
      }
    })();
  }
  await hydratePromise;
}

function parseBlob(raw: string): PortalState {
  try {
    const parsed = JSON.parse(raw) as Partial<PortalState>;
    return {
      agencies: parsed.agencies ?? {},
      clients: parsed.clients ?? {},
      endCustomers: parsed.endCustomers ?? {},
      users: parsed.users ?? {},
      pluginInstalls: parsed.pluginInstalls ?? {},
      pluginData: parsed.pluginData ?? {},
      phases: parsed.phases ?? {},
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      pipelines: parsed.pipelines ?? {},
      pipelineCards: parsed.pipelineCards ?? {},
    };
  } catch {
    return empty();
  }
}

async function flush(): Promise<void> {
  if (!cache || !writable) return;
  if (flushInFlight) await flushInFlight;
  flushInFlight = (async () => {
    try {
      await backend.saveBlob(JSON.stringify(cache));
    } catch (e) {
      writable = false;
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[portal] backend "${backend.kind}" save failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    } finally {
      flushInFlight = null;
    }
  })();
  await flushInFlight;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 250);
}

export function getState(): PortalState {
  return cache ?? empty();
}

export function mutate(fn: (state: PortalState) => void): void {
  if (!cache) cache = empty();
  fn(cache);
  scheduleFlush();
}

export async function reset(): Promise<void> {
  cache = empty();
  hydrated = true;
  await flush();
}

export function isPersistent(): boolean {
  return writable;
}

export interface BackendInfo {
  kind: BackendKind;
  persistent: boolean;
  description: string;
  hydrated: boolean;
  writable: boolean;
}

export function getBackendInfo(): BackendInfo {
  return {
    kind: backend.kind,
    persistent: backend.persistent,
    description: backend.description,
    hydrated,
    writable,
  };
}
