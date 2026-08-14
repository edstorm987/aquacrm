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

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import type { PortalState } from "./types";
import {
  applyStoragePatch,
  diffStorageValue,
  type StoragePatchOperation,
} from "./storagePatch";

const empty = (): PortalState => ({
  agencies: {},
  tradingCompanies: {},
  clients: {},
  endCustomers: {},
  users: {},
  pluginInstalls: {},
  pluginData: {},
  phases: {},
  activity: [],
  pipelines: {},
  pipelineCards: {},
  assistant: {},
  externalAssistantApiKeys: {},
  externalAssistantActionProposals: {},
  integrationConnections: {},
  tasks: {},
  notepadFolders: {},
  notepadNotes: {},
  automationFolders: {},
  automationWorkflows: {},
  automationRuns: {},
  customAIs: {},
  dashboardDayPlans: {},
  dashboardWeekPlans: {},
  dashboardWorkSessions: {},
  commandCalendarEntries: {},
  commandCalendarConnections: {},
  commandCalendarSources: {},
  commandCalendarExternalEvents: {},
  sops: {},
  agencyProducts: {},
  clientMilestones: {},
  performanceExperiments: {},
  experiencePackages: {},
  clientDelight: {},
  agencySettings: {},
  portalEditor: {},
  clientPortalTemplates: {},
  clientPortalInstances: {},
  companyProfiles: {},
  legalDocuments: {},
  contractTemplates: {},
  developmentResources: {},
  developmentWorkflows: {},
  agencyWebsites: {},
  radarMemory: {},
  radarSyntheticProbes: {},
  radarEvidence: {},
  operationalAlertPreferences: {},
  peopleApplications: {},
  peopleEmployees: {},
  peopleLeaveRequests: {},
  peopleShifts: {},
  peopleTrainingAssignments: {},
});

// ─── Backend interface ────────────────────────────────────────────────────

export type BackendKind = "file" | "memory" | "kv" | "postgres" | "supabase";

interface Backend {
  kind: BackendKind;
  persistent: boolean;
  description: string;
  loadBlob(): Promise<string | null>;
  saveBlob(content: string): Promise<void>;
  applyPatch?(operations: StoragePatchOperation[]): Promise<string>;
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

// ─── Memory backend (tests / ephemeral local runs) ───────────────────────

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

const supabaseBackend: Backend = {
  kind: "supabase",
  persistent: true,
  description: "Supabase app datastore (`aquacrm-portal-state`).",
  async loadBlob() {
    const { loadBlob } = await import("./storageSupabase");
    return loadBlob();
  },
  async saveBlob(content) {
    const { saveBlob } = await import("./storageSupabase");
    return saveBlob(content);
  },
  async applyPatch(operations) {
    const { applyPatch } = await import("./storageSupabase");
    return applyPatch(operations);
  },
};

function pickBackend(): Backend {
  const explicit = (process.env.PORTAL_BACKEND ?? "").toLowerCase();
  switch (explicit) {
    case "memory":   return memoryBackend;
    case "kv":       return kvStub;
    case "postgres": return postgresBackend;
    case "supabase": return supabaseBackend;
    case "file":
    case "":
    default: {
      // Implicit promotion: when `DATABASE_URL` is set but PORTAL_BACKEND
      // wasn't explicitly chosen, prefer Postgres over file. This makes
      // production deploys "set DATABASE_URL and go" while keeping
      // local dev (no DATABASE_URL) on the file backend.
      if (!explicit && process.env.DATABASE_URL) return postgresBackend;
      if (
        !explicit &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ) return supabaseBackend;
      return fileBackend;
    }
  }
}

const backend = pickBackend();

// ─── Cache + hydration + flush ────────────────────────────────────────────

let cache: PortalState | null = null;
// Persistence and write capability are different properties. The memory
// backend is deliberately ephemeral, but it must still accept writes so tests
// and local previews exercise the same mutation/flush contract as production.
let writable = backend.kind !== "kv";
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
let fileSnapshotMtimeMs = 0;
let mutationVersion = 0;
let persistedVersion = 0;
let lastFlushError: Error | null = null;
let pendingPatchOperations: StoragePatchOperation[] = [];

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let remoteRefreshPromise: Promise<void> | null = null;

export async function ensureHydrated(options?: { fresh?: boolean }): Promise<void> {
  const shouldRefreshRemote =
    options?.fresh === true &&
    (backend.kind === "supabase" || backend.kind === "postgres");

  if (shouldRefreshRemote && hydrated) {
    if (!remoteRefreshPromise) {
      remoteRefreshPromise = (async () => {
        // Never replace local changes with a remote snapshot that predates
        // them. Mutation routes explicitly flush before returning, while this
        // also protects callers during a warm server transition.
        await flushPendingWrites();
        hydrated = false;
        hydratePromise = null;
        await ensureHydrated();
      })().finally(() => {
        remoteRefreshPromise = null;
      });
    }
    await remoteRefreshPromise;
    return;
  }
  if (hydrated && backend.kind === "file" && existsSync(DATA_FILE)) {
    const currentMtimeMs = statSync(DATA_FILE).mtimeMs;
    if (currentMtimeMs > fileSnapshotMtimeMs) {
      hydrated = false;
      hydratePromise = null;
    }
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const isDeployedProduction =
        process.env.NODE_ENV === "production" &&
        Boolean(process.env.VERCEL_ENV) &&
        process.env.NEXT_PHASE !== "phase-production-build";
      if (isDeployedProduction && (backend.kind === "file" || backend.kind === "memory")) {
        throw new Error(
          `[portal] Refusing to start with ${backend.kind} storage on Vercel. Configure Supabase storage or Postgres before serving customer data.`,
        );
      }
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
        mutationVersion = 0;
        persistedVersion = 0;
        pendingPatchOperations = [];
        lastFlushError = null;
        // R025: migrate legacy single-agency user rows in place. Pure +
        // idempotent — re-running on already-migrated rows is a no-op.
        // Lazy-import to avoid pulling the migration helper into every
        // storage consumer's bundle.
        const { migrateUsersSchema } = await import("./userSchemaMigration");
        migrateUsersSchema(cache.users);
        if (backend.kind === "file" && existsSync(DATA_FILE)) {
          fileSnapshotMtimeMs = statSync(DATA_FILE).mtimeMs;
        }
      } catch (e) {
        if (process.env.NODE_ENV === "production") throw e;
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
      tradingCompanies: parsed.tradingCompanies ?? {},
      clients: parsed.clients ?? {},
      endCustomers: parsed.endCustomers ?? {},
      users: parsed.users ?? {},
      pluginInstalls: parsed.pluginInstalls ?? {},
      pluginData: parsed.pluginData ?? {},
      phases: parsed.phases ?? {},
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      pipelines: parsed.pipelines ?? {},
      pipelineCards: parsed.pipelineCards ?? {},
      assistant: parsed.assistant ?? {},
      externalAssistantApiKeys: parsed.externalAssistantApiKeys ?? {},
      externalAssistantActionProposals: parsed.externalAssistantActionProposals ?? {},
      integrationConnections: parsed.integrationConnections ?? {},
      tasks: parsed.tasks ?? {},
      notepadFolders: parsed.notepadFolders ?? {},
      notepadNotes: parsed.notepadNotes ?? {},
      automationFolders: parsed.automationFolders ?? {},
      automationWorkflows: parsed.automationWorkflows ?? {},
      automationRuns: parsed.automationRuns ?? {},
      customAIs: parsed.customAIs ?? {},
      dashboardDayPlans: parsed.dashboardDayPlans ?? {},
      dashboardWeekPlans: parsed.dashboardWeekPlans ?? {},
      dashboardWorkSessions: parsed.dashboardWorkSessions ?? {},
      commandCalendarEntries: parsed.commandCalendarEntries ?? {},
      commandCalendarConnections: parsed.commandCalendarConnections ?? {},
      commandCalendarSources: parsed.commandCalendarSources ?? {},
      commandCalendarExternalEvents: parsed.commandCalendarExternalEvents ?? {},
      sops: parsed.sops ?? {},
      agencyProducts: parsed.agencyProducts ?? {},
      clientMilestones: parsed.clientMilestones ?? {},
      performanceExperiments: parsed.performanceExperiments ?? {},
      experiencePackages: parsed.experiencePackages ?? {},
      clientDelight: parsed.clientDelight ?? {},
      agencySettings: parsed.agencySettings ?? {},
      portalEditor: parsed.portalEditor ?? {},
      clientPortalTemplates: parsed.clientPortalTemplates ?? {},
      clientPortalInstances: parsed.clientPortalInstances ?? {},
      companyProfiles: parsed.companyProfiles ?? {},
      legalDocuments: parsed.legalDocuments ?? {},
      contractTemplates: parsed.contractTemplates ?? {},
      developmentResources: parsed.developmentResources ?? {},
      developmentWorkflows: parsed.developmentWorkflows ?? {},
      agencyWebsites: parsed.agencyWebsites ?? {},
      radarMemory: parsed.radarMemory ?? {},
      radarSyntheticProbes: parsed.radarSyntheticProbes ?? {},
      radarEvidence: parsed.radarEvidence ?? {},
      operationalAlertPreferences: parsed.operationalAlertPreferences ?? {},
      peopleApplications: parsed.peopleApplications ?? {},
      peopleEmployees: parsed.peopleEmployees ?? {},
      peopleLeaveRequests: parsed.peopleLeaveRequests ?? {},
      peopleShifts: parsed.peopleShifts ?? {},
      peopleTrainingAssignments: parsed.peopleTrainingAssignments ?? {},
    };
  } catch {
    return empty();
  }
}

async function flush(options?: { throwOnError?: boolean }): Promise<void> {
  if (!cache) return;
  if (!writable) {
    if (options?.throwOnError) {
      throw lastFlushError ?? new Error(`[portal] backend "${backend.kind}" is not writable.`);
    }
    return;
  }
  if (flushInFlight) await flushInFlight;
  if (persistedVersion === mutationVersion) return;

  const targetVersion = mutationVersion;
  const snapshot = JSON.stringify(cache);
  const operationCount = pendingPatchOperations.length;
  const operations = pendingPatchOperations.slice(0, operationCount);
  flushInFlight = (async () => {
    try {
      const savedBlob = backend.applyPatch && operations.length > 0
        ? await backend.applyPatch(operations)
        : (await backend.saveBlob(snapshot), null);

      if (savedBlob) {
        pendingPatchOperations.splice(0, operationCount);
        const remoteState = parseBlob(savedBlob);
        cache = pendingPatchOperations.length > 0
          ? parseBlob(JSON.stringify(applyStoragePatch(remoteState, pendingPatchOperations)))
          : remoteState;
      }
      persistedVersion = targetVersion;
      lastFlushError = null;
      if (backend.kind === "file" && existsSync(DATA_FILE)) {
        fileSnapshotMtimeMs = statSync(DATA_FILE).mtimeMs;
      }
    } catch (e) {
      lastFlushError = e instanceof Error ? e : new Error(String(e));
      // A remote timeout or brief outage is recoverable. Keep the pending
      // operations and allow the next mutation or explicit flush to retry.
      // Only a failed local file write indicates a process-level read-only
      // state that should remain disabled until restart.
      if (backend.kind === "file") writable = false;
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
  if (options?.throwOnError && lastFlushError) throw lastFlushError;
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
  const before = backend.applyPatch ? structuredClone(cache) : null;
  fn(cache);
  if (before) {
    const operations = diffStorageValue(before, cache);
    if (operations.length === 0) return;
    pendingPatchOperations.push(...operations);
  }
  mutationVersion += 1;
  if (backend.kind === "file" && writable) {
    try {
      fileBackend.saveBlob(JSON.stringify(cache));
      persistedVersion = mutationVersion;
      lastFlushError = null;
      if (existsSync(DATA_FILE)) {
        fileSnapshotMtimeMs = statSync(DATA_FILE).mtimeMs;
      }
      return;
    } catch (e) {
      writable = false;
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[portal] backend "${backend.kind}" save failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  scheduleFlush();
}

/**
 * Persist every mutation made during the current request before a successful
 * response is returned. This is required for remote/serverless backends where
 * the next request may execute in a different process with a different cache.
 */
export async function flushPendingWrites(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush({ throwOnError: true });
}

export async function reset(): Promise<void> {
  cache = empty();
  pendingPatchOperations = [];
  hydrated = true;
  mutationVersion += 1;
  await flush({ throwOnError: true });
}

export function isPersistent(): boolean {
  return backend.persistent && writable;
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
