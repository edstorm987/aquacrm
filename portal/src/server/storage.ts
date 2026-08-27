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

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { randomUUID } from "crypto";
import { dirname, resolve } from "path";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/server/auth/sessionToken";
import {
  LIVE_DATA_REALM_ID,
  enterDataRealm,
  getActiveDataRealmId,
  hasExplicitDataRealm,
  isSandboxDataRealm,
  normaliseDataRealmId,
  runInDataRealm,
} from "@/server/dataRealm";
export {
  LIVE_DATA_REALM_ID,
  getActiveDataRealmId,
  isSandboxDataRealm,
  runInDataRealm,
} from "@/server/dataRealm";
import type { PortalState } from "./types";
import {
  applyStoragePatch,
  diffStorageValue,
  type StoragePatchOperation,
} from "./storagePatch";
import {
  applyDevTeamWorkspaceFileMutations as applyDevTeamWorkspaceMutationsToState,
  DevTeamWorkspaceConflictError,
  type DevTeamWorkspaceFileMutation,
} from "./devTeamWorkspacePersistence";

const empty = (): PortalState => ({
  // These four are declared optional on PortalState, which is why they were
  // omitted here and — far worse — from parseBlob. Anything optional that is
  // still a COLLECTION must start empty and round-trip like the rest.
  agencyMasterTagKeys: {},
  websiteSources: {},
  websiteSiteConfigs: {},
  enquiryContactDetails: {},
  agencies: {},
  tradingCompanies: {},
  clients: {},
  endCustomers: {},
  users: {},
  accessRoleTemplates: {},
  accessGrants: {},
  accessRequests: {},
  pluginInstalls: {},
  pluginData: {},
  phases: {},
  activity: [],
  clientRecordLedger: {},
  identityResolutionReviews: {},
  persons: {},
  organisations: {},
  completedActions: {},
  pipelines: {},
  pipelineCards: {},
  assistant: {},
  externalAssistantApiKeys: {},
  externalAssistantActionProposals: {},
  integrationConnections: {},
  devProjects: {},
  editorAiConfigs: {},
  editorAiConversations: {},
  devTeamWorkspaceFiles: {},
  tasks: {},
  taskTemplates: {},
  portalConnections: {},
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
  commandCalendarEventCreateOperations: {},
  sops: {},
  sopGuides: {},
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
  customKpis: {},
  operationalAlertPreferences: {},
  peopleApplications: {},
  peopleEmployees: {},
  peopleLeaveRequests: {},
  peopleShifts: {},
  peopleTrainingAssignments: {},
  peopleFreelancerJobs: {},
  peopleRecognitions: {},
  peopleFeedback: {},
  peopleProcessConfig: {},
  freelancerAccessConfig: {},
  freelancerJobOverride: {},
  peopleContracts: {},
  peopleChannels: {},
  peopleMessages: {},
  peopleChannelReads: {},
  peopleTrainingModules: {},
  staffProvisioningOperations: {},
});

export function createEmptyPortalState(): PortalState {
  return empty();
}

// ─── Backend interface ────────────────────────────────────────────────────

export type BackendKind = "file" | "memory" | "kv" | "postgres" | "supabase";

interface Backend {
  kind: BackendKind;
  persistent: boolean;
  description: string;
  loadBlob(realmId: string): Promise<string | null>;
  saveBlob(content: string, realmId: string): Promise<void>;
  applyPatch?(operations: StoragePatchOperation[], realmId: string): Promise<string>;
  applyDevTeamWorkspaceFiles?(operations: DevTeamWorkspaceFileMutation[], realmId: string): Promise<string>;
}

// ─── File backend (dev default) ───────────────────────────────────────────

// The file-backend sandbox. `PORTAL_DATA_FILE` (absolute, or relative to the
// project root) points a process at its OWN state file so two dev servers can
// run side by side without overwriting each other's sandbox — that shared
// `.data/portal-state.json` was why a second worker's `dev:verify` silently
// clobbered the first. Unset → the original path, so nothing existing changes.
const DATA_FILE = process.env.PORTAL_DATA_FILE
  ? resolve(process.cwd(), process.env.PORTAL_DATA_FILE)
  : resolve(process.cwd(), ".data", "portal-state.json");

function dataFileForRealm(realmId: string): string {
  const valid = normaliseDataRealmId(realmId);
  if (valid === LIVE_DATA_REALM_ID) return DATA_FILE;
  return resolve(dirname(DATA_FILE), "realms", `${valid}.json`);
}

function saveFileBlobAtomic(content: string, realmId = getActiveDataRealmId()): void {
  const dataFile = dataFileForRealm(realmId);
  const dir = dirname(dataFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const temp = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temp, "wx", 0o600);
    writeFileSync(descriptor, content, "utf-8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    // Same-directory rename is atomic: readers see the complete previous blob
    // or the complete next blob, never a partially truncated JSON document.
    renameSync(temp, dataFile);
  } catch (error) {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* already closed */ }
    }
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* preserve original failure */ }
    throw error;
  }
}

const fileBackend: Backend = {
  kind: "file",
  persistent: true,
  description: `JSON file at ${DATA_FILE}`,
  async loadBlob(realmId) {
    const dataFile = dataFileForRealm(realmId);
    if (!existsSync(dataFile)) return null;
    return readFileSync(dataFile, "utf-8");
  },
  async saveBlob(content, realmId) {
    saveFileBlobAtomic(content, realmId);
  },
};

// ─── Memory backend (tests / ephemeral local runs) ───────────────────────

const memoryBlobs = new Map<string, string>();
const memoryBackend: Backend = {
  kind: "memory",
  persistent: false,
  description: "In-memory only — state evaporates when the process exits.",
  async loadBlob(realmId) { return memoryBlobs.get(normaliseDataRealmId(realmId)) ?? null; },
  async saveBlob(content, realmId) { memoryBlobs.set(normaliseDataRealmId(realmId), content); },
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
  async loadBlob(realmId) {
    const { loadBlob } = await import("./storagePostgres");
    return loadBlob(realmId);
  },
  async saveBlob(content, realmId) {
    const { saveBlob } = await import("./storagePostgres");
    return saveBlob(content, realmId);
  },
  async applyDevTeamWorkspaceFiles(operations, realmId) {
    const { applyDevTeamWorkspaceFiles } = await import("./storagePostgres");
    return applyDevTeamWorkspaceFiles(operations, realmId);
  },
};

const supabaseBackend: Backend = {
  kind: "supabase",
  persistent: true,
  description: "Supabase app datastore (`aquacrm-portal-state`).",
  async loadBlob(realmId) {
    const { loadBlob } = await import("./storageSupabase");
    return loadBlob({}, realmId);
  },
  async saveBlob(content, realmId) {
    const { saveBlob } = await import("./storageSupabase");
    return saveBlob(content, {}, realmId);
  },
  async applyPatch(operations, realmId) {
    const { applyPatch } = await import("./storageSupabase");
    return applyPatch(operations, {}, realmId);
  },
  async applyDevTeamWorkspaceFiles(operations, realmId) {
    const { applyDevTeamWorkspaceFiles } = await import("./storageSupabase");
    return applyDevTeamWorkspaceFiles(operations, {}, realmId);
  },
};

/**
 * A test process must never be able to reach the shared dev sandbox.
 *
 * The file backend is the DEFAULT and its default path is the one dev server's
 * `.data/portal-state.json`. Only ~a quarter of the smoke files pin
 * `PORTAL_BACKEND=memory`, so the rest inherited that default and flushed their
 * own seeded state straight over the sandbox: running the FULL suite — which
 * the contract in CLAUDE.md requires before calling any behaviour change done —
 * silently emptied Ed's workspace (0 agencies, 0 clients, 0 users). It happened
 * for real on 2026-08-20 and was restored from a worker's fork.
 *
 * So: under `node --test`, an unpinned process gets memory, never the file. A
 * test that genuinely wants a file sandbox still gets one by setting
 * `PORTAL_DATA_FILE` to its own path — which is the isolation `sandbox:fork`
 * already gives every worker. `PORTAL_BACKEND` set explicitly still wins, so
 * nothing that deliberately chose a backend changes behaviour.
 */
function inTestRunner(): boolean {
  // node:test sets this in every child process it spawns per test file.
  return Boolean(process.env.NODE_TEST_CONTEXT);
}

/**
 * The shared sandbox is OPT-IN, not opt-out.
 *
 * Guessing which processes are "safe" was the wrong shape: node:test children
 * were covered, but a plain `npx tsx scripts/whatever.ts` was not, and several
 * of those create agencies (scripts/verify-marketing-runtime.ts says in its own
 * header "run with PORTAL_BACKEND=memory" — relying on whoever runs it to
 * remember). Five fixture tenants — Golden Fixture Co, F, Marketing Runtime Co —
 * turned up in Ed's workspace on 2026-08-20 that way.
 *
 * So the ONE shared file is now reachable only by a process that says out loud
 * it is the dev server (`PORTAL_ALLOW_SHARED_STATE=1`, set by the dev:sandbox*
 * scripts). Everything else gets memory unless it names its OWN file through
 * `PORTAL_DATA_FILE` — which is exactly what `npm run sandbox:fork` does, so
 * workers are unaffected.
 */
const SHARED_STATE_PATH = resolve(process.cwd(), ".data", "portal-state.json");

function mayTouchSharedState(): boolean {
  if (process.env.PORTAL_ALLOW_SHARED_STATE === "1") return true;
  // A process that named its own file is never touching the shared one.
  if (process.env.PORTAL_DATA_FILE) {
    return resolve(process.cwd(), process.env.PORTAL_DATA_FILE) !== SHARED_STATE_PATH;
  }
  return false;
}

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
      // The file backend is the only one that can reach the shared sandbox, so
      // the guard belongs HERE — not at the top of this function, where it also
      // swallowed an explicit supabase/postgres/kv choice.
      if (!mayTouchSharedState()) return memoryBackend;
      return fileBackend;
    }
  }
}

const backend = pickBackend();

// ─── Cache + hydration + flush ────────────────────────────────────────────

interface RealmRuntime {
  cache: PortalState | null;
  writable: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  flushInFlight: Promise<void> | null;
  fileSnapshotMtimeMs: number;
  mutationVersion: number;
  persistedVersion: number;
  lastFlushError: Error | null;
  pendingPatchOperations: StoragePatchOperation[];
  hydrated: boolean;
  hydratePromise: Promise<void> | null;
  remoteRefreshPromise: Promise<void> | null;
  devTeamWorkspaceMutationQueue: Promise<void>;
}

const realmRuntimes = new Map<string, RealmRuntime>();

function realmRuntime(realmId = getActiveDataRealmId()): RealmRuntime {
  const valid = normaliseDataRealmId(realmId);
  const existing = realmRuntimes.get(valid);
  if (existing) return existing;
  const created: RealmRuntime = {
    cache: null,
    // Persistence and write capability are different properties. Memory is
    // ephemeral but deliberately writable for tests and previews.
    writable: backend.kind !== "kv",
    flushTimer: null,
    flushInFlight: null,
    fileSnapshotMtimeMs: 0,
    mutationVersion: 0,
    persistedVersion: 0,
    lastFlushError: null,
    pendingPatchOperations: [],
    hydrated: false,
    hydratePromise: null,
    remoteRefreshPromise: null,
    devTeamWorkspaceMutationQueue: Promise.resolve(),
  };
  realmRuntimes.set(valid, created);
  return created;
}

function enterSignedRequestRealm(preserveExplicitRealm: boolean): string {
  // `enterWith()` is intentionally used so synchronous domain readers after
  // `ensureHydrated()` see the selected realm. Selection must happen before
  // ensureHydrated reaches its first await; entering an AsyncLocalStorage
  // context after an await does not propagate back to the layout/route caller.
  // Next already holds the request boundary in its request-scoped store, so
  // read the incoming signed cookie there without introducing an await.
  if (preserveExplicitRealm && hasExplicitDataRealm()) return getActiveDataRealmId();

  let realmId = LIVE_DATA_REALM_ID;
  const requestStore = workUnitAsyncStorage.getStore();
  if (requestStore?.type === "request") {
    const token = requestStore.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);
    if (session?.sandbox?.realmId) realmId = normaliseDataRealmId(session.sandbox.realmId);
  } else if (hasExplicitDataRealm()) {
    // Scripts, build-time renders and isolated tests do not have a request
    // store. Preserve their explicit runInDataRealm() scope; otherwise they
    // deliberately remain on the live/default realm.
    return getActiveDataRealmId();
  }
  return enterDataRealm(realmId);
}

export async function ensureHydrated(options?: {
  fresh?: boolean;
  /** Server-only escape hatch for code already wrapped in runInDataRealm(). */
  preserveExplicitRealm?: boolean;
}): Promise<void> {
  const realmId = enterSignedRequestRealm(options?.preserveExplicitRealm === true);
  const runtime = realmRuntime(realmId);
  const dataFile = dataFileForRealm(realmId);
  const shouldRefreshPersistent =
    options?.fresh === true &&
    (backend.kind === "supabase" || backend.kind === "postgres" || backend.kind === "file");

  if (shouldRefreshPersistent && runtime.hydrated) {
    if (!runtime.remoteRefreshPromise) {
      runtime.remoteRefreshPromise = (async () => {
        // Never replace local changes with a remote snapshot that predates
        // them. Mutation routes explicitly flush before returning, while this
        // also protects callers during a warm server transition.
        await flushPendingWrites();
        runtime.hydrated = false;
        runtime.hydratePromise = null;
        await ensureHydrated({ preserveExplicitRealm: options?.preserveExplicitRealm });
      })().finally(() => {
        runtime.remoteRefreshPromise = null;
      });
    }
    await runtime.remoteRefreshPromise;
    return;
  }
  if (runtime.hydrated && backend.kind === "file" && existsSync(dataFile)) {
    const currentMtimeMs = statSync(dataFile).mtimeMs;
    if (currentMtimeMs > runtime.fileSnapshotMtimeMs) {
      runtime.hydrated = false;
      runtime.hydratePromise = null;
    }
  }
  if (runtime.hydrated) return;
  if (!runtime.hydratePromise) {
    runtime.hydratePromise = (async () => {
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
        let raw = await backend.loadBlob(realmId);
        // R027 dual-read fallback. When Postgres is configured but the
        // blob row is missing (fresh DB / partial migration), read from
        // the file backend once, hydrate the cache, and stamp Postgres
        // so subsequent boots find the row natively. Logs a one-time
        // migration event so operators see the seam.
        if (!raw && backend.kind === "postgres" && realmId === LIVE_DATA_REALM_ID) {
          try {
            const fallback = await fileBackend.loadBlob(LIVE_DATA_REALM_ID);
            if (fallback) {
              raw = fallback;
              // Fire-and-forget: write the file blob into Postgres so
              // the next cold start reads natively. Errors surface in
              // the warn channel; cache is already populated either way.
              backend
                .saveBlob(fallback, realmId)
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
        runtime.cache = raw ? parseBlob(raw) : empty();
        runtime.mutationVersion = 0;
        runtime.persistedVersion = 0;
        runtime.pendingPatchOperations = [];
        runtime.lastFlushError = null;
        // R025: migrate legacy single-agency user rows in place. Pure +
        // idempotent — re-running on already-migrated rows is a no-op.
        // Lazy-import to avoid pulling the migration helper into every
        // storage consumer's bundle.
        const { migrateUsersSchema } = await import("./userSchemaMigration");
        migrateUsersSchema(runtime.cache.users);
        if (backend.kind === "file" && existsSync(dataFile)) {
          runtime.fileSnapshotMtimeMs = statSync(dataFile).mtimeMs;
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (backend.kind === "file") {
          // A missing file is a valid first run; an unreadable/corrupt existing
          // file is not an empty CRM. Keep it untouched and fail visibly until
          // an operator restores or deliberately replaces it.
          runtime.cache = null;
          runtime.writable = false;
          runtime.lastFlushError = error;
          runtime.hydrated = false;
          throw new Error(`[portal] file state could not be loaded from ${dataFile}: ${error.message}`, { cause: error });
        }
        if (process.env.NODE_ENV === "production") throw e;
        if (process.env.NODE_ENV !== "test") {
          console.warn(
            `[portal] backend "${backend.kind}" failed to load:`,
            e instanceof Error ? e.message : e,
          );
        }
        runtime.cache = empty();
      } finally {
        if (runtime.cache) runtime.hydrated = true;
      }
    })();
  }
  await runtime.hydratePromise;
}

function parseBlob(raw: string): PortalState {
  const parsed = JSON.parse(raw) as Partial<PortalState>;
  return {
      // ⚠ Every collection MUST be rebuilt here. This object is the whole of
      // state — there is no `...parsed` — so a field omitted from this list is
      // silently DESTROYED on every hydration and then written back out empty
      // on the next save. These four were missing: the Aqua Tag master site
      // keys, its website sources and per-site config, and operator-added
      // enquiry contact details never survived a restart. Proven by sentinel
      // round-trip, 2026-08-20. `smoke-state-roundtrip` now fails if a new
      // collection is added without a line here.
      agencyMasterTagKeys: parsed.agencyMasterTagKeys ?? {},
      websiteSources: parsed.websiteSources ?? {},
      websiteSiteConfigs: parsed.websiteSiteConfigs ?? {},
      enquiryContactDetails: parsed.enquiryContactDetails ?? {},
      agencies: parsed.agencies ?? {},
      tradingCompanies: parsed.tradingCompanies ?? {},
      clients: parsed.clients ?? {},
      endCustomers: parsed.endCustomers ?? {},
      users: parsed.users ?? {},
      accessRoleTemplates: parsed.accessRoleTemplates ?? {},
      accessGrants: parsed.accessGrants ?? {},
      accessRequests: parsed.accessRequests ?? {},
      pluginInstalls: parsed.pluginInstalls ?? {},
      pluginData: parsed.pluginData ?? {},
      phases: parsed.phases ?? {},
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      clientRecordLedger: parsed.clientRecordLedger ?? {},
      identityResolutionReviews: parsed.identityResolutionReviews ?? {},
      persons: parsed.persons ?? {},
      organisations: parsed.organisations ?? {},
      completedActions: parsed.completedActions ?? {},
      pipelines: parsed.pipelines ?? {},
      pipelineCards: parsed.pipelineCards ?? {},
      assistant: parsed.assistant ?? {},
      externalAssistantApiKeys: parsed.externalAssistantApiKeys ?? {},
      externalAssistantActionProposals: parsed.externalAssistantActionProposals ?? {},
      integrationConnections: parsed.integrationConnections ?? {},
      devProjects: parsed.devProjects ?? {},
      editorAiConfigs: parsed.editorAiConfigs ?? {},
      editorAiConversations: parsed.editorAiConversations ?? {},
      devTeamWorkspaceFiles: parsed.devTeamWorkspaceFiles ?? {},
      tasks: parsed.tasks ?? {},
      taskTemplates: parsed.taskTemplates ?? {},
      portalConnections: parsed.portalConnections ?? {},
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
      commandCalendarEventCreateOperations: parsed.commandCalendarEventCreateOperations ?? {},
      sops: parsed.sops ?? {},
      sopGuides: parsed.sopGuides ?? {},
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
      customKpis: parsed.customKpis ?? {},
      radarInfraHealth: parsed.radarInfraHealth,
      operationalAlertPreferences: parsed.operationalAlertPreferences ?? {},
      peopleApplications: parsed.peopleApplications ?? {},
      peopleEmployees: parsed.peopleEmployees ?? {},
      peopleLeaveRequests: parsed.peopleLeaveRequests ?? {},
      peopleShifts: parsed.peopleShifts ?? {},
      peopleTrainingAssignments: parsed.peopleTrainingAssignments ?? {},
      peopleFreelancerJobs: parsed.peopleFreelancerJobs ?? {},
      peopleRecognitions: parsed.peopleRecognitions ?? {},
      peopleFeedback: parsed.peopleFeedback ?? {},
      peopleProcessConfig: parsed.peopleProcessConfig ?? {},
      freelancerAccessConfig: parsed.freelancerAccessConfig ?? {},
      freelancerJobOverride: parsed.freelancerJobOverride ?? {},
      peopleContracts: parsed.peopleContracts ?? {},
      peopleChannels: parsed.peopleChannels ?? {},
      peopleMessages: parsed.peopleMessages ?? {},
      peopleChannelReads: parsed.peopleChannelReads ?? {},
      peopleTrainingModules: parsed.peopleTrainingModules ?? {},
      staffProvisioningOperations: parsed.staffProvisioningOperations ?? {},
  };
}

async function flushRealm(
  realmId: string,
  runtime: RealmRuntime,
  options?: { throwOnError?: boolean },
): Promise<void> {
  if (!runtime.cache) return;
  if (!runtime.writable) {
    if (options?.throwOnError) {
      throw runtime.lastFlushError ?? new Error(`[portal] backend "${backend.kind}" is not writable.`);
    }
    return;
  }
  if (runtime.flushInFlight) await runtime.flushInFlight;
  if (runtime.persistedVersion === runtime.mutationVersion) return;

  const targetVersion = runtime.mutationVersion;
  const snapshot = JSON.stringify(runtime.cache);
  const operationCount = runtime.pendingPatchOperations.length;
  const operations = runtime.pendingPatchOperations.slice(0, operationCount);
  const dataFile = dataFileForRealm(realmId);
  runtime.flushInFlight = (async () => {
    try {
      const savedBlob = backend.applyPatch && operations.length > 0
        ? await backend.applyPatch(operations, realmId)
        : (await backend.saveBlob(snapshot, realmId), null);

      if (savedBlob) {
        runtime.pendingPatchOperations.splice(0, operationCount);
        const remoteState = parseBlob(savedBlob);
        runtime.cache = runtime.pendingPatchOperations.length > 0
          ? parseBlob(JSON.stringify(applyStoragePatch(remoteState, runtime.pendingPatchOperations)))
          : remoteState;
      }
      runtime.persistedVersion = targetVersion;
      runtime.lastFlushError = null;
      if (backend.kind === "file" && existsSync(dataFile)) {
        runtime.fileSnapshotMtimeMs = statSync(dataFile).mtimeMs;
      }
    } catch (e) {
      runtime.lastFlushError = e instanceof Error ? e : new Error(String(e));
      // A remote timeout or brief outage is recoverable. Keep the pending
      // operations and allow the next mutation or explicit flush to retry.
      // Only a failed local file write indicates a process-level read-only
      // state that should remain disabled until restart.
      if (backend.kind === "file") runtime.writable = false;
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[portal] backend "${backend.kind}" save failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    } finally {
      runtime.flushInFlight = null;
    }
  })();
  await runtime.flushInFlight;
  if (options?.throwOnError && runtime.lastFlushError) throw runtime.lastFlushError;
}

function scheduleFlush(realmId: string, runtime: RealmRuntime) {
  if (runtime.flushTimer) return;
  runtime.flushTimer = setTimeout(() => {
    runtime.flushTimer = null;
    void flushRealm(realmId, runtime);
  }, 250);
}

export function getState(): PortalState {
  return realmRuntime().cache ?? empty();
}

function workspaceConflictFrom(error: unknown): DevTeamWorkspaceConflictError | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /DEV_TEAM_WORKSPACE_CONFLICT:([^\s"}]+)/.exec(message);
  return match ? new DevTeamWorkspaceConflictError(match[1]) : null;
}

async function commitDevTeamWorkspaceFilesNow(
  operations: DevTeamWorkspaceFileMutation[],
): Promise<void> {
  if (operations.length === 0) return;
  await ensureHydrated();
  await flushPendingWrites();

  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);

  if (!backend.applyDevTeamWorkspaceFiles) {
    // Memory/file fallback used by isolated tests. Production serverless
    // backends always take the row-locked database path above.
    mutate(state => applyDevTeamWorkspaceMutationsToState(state, operations));
    await flushPendingWrites();
    return;
  }

  try {
    const savedBlob = await backend.applyDevTeamWorkspaceFiles(operations, realmId);
    const remoteState = parseBlob(savedBlob);
    // A normal domain mutation may have landed while the database RPC was in
    // flight. Reapply those still-pending patches over the returned snapshot;
    // their own flush remains responsible for persistence.
    runtime.cache = runtime.pendingPatchOperations.length > 0
      ? parseBlob(JSON.stringify(applyStoragePatch(remoteState, runtime.pendingPatchOperations)))
      : remoteState;
    runtime.hydrated = true;
  } catch (error) {
    throw workspaceConflictFrom(error) ?? error;
  }
}

/**
 * Atomically compare-and-swap one or more production Dev Team workspace files.
 * Batches are validated before any file is changed by the database function.
 */
export function commitDevTeamWorkspaceFiles(
  operations: DevTeamWorkspaceFileMutation[],
): Promise<void> {
  const runtime = realmRuntime();
  const run = runtime.devTeamWorkspaceMutationQueue.then(() => commitDevTeamWorkspaceFilesNow(operations));
  runtime.devTeamWorkspaceMutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

export function mutate(fn: (state: PortalState) => void): void {
  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);
  if (!runtime.cache) runtime.cache = empty();
  const before = backend.applyPatch ? structuredClone(runtime.cache) : null;
  fn(runtime.cache);
  if (before) {
    const operations = diffStorageValue(before, runtime.cache);
    if (operations.length === 0) return;
    runtime.pendingPatchOperations.push(...operations);
  }
  runtime.mutationVersion += 1;
  if (backend.kind === "file" && runtime.writable) {
    try {
      const dataFile = dataFileForRealm(realmId);
      saveFileBlobAtomic(JSON.stringify(runtime.cache), realmId);
      runtime.persistedVersion = runtime.mutationVersion;
      runtime.lastFlushError = null;
      if (existsSync(dataFile)) {
        runtime.fileSnapshotMtimeMs = statSync(dataFile).mtimeMs;
      }
      return;
    } catch (e) {
      runtime.lastFlushError = e instanceof Error ? e : new Error(String(e));
      runtime.writable = false;
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[portal] backend "${backend.kind}" save failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  scheduleFlush(realmId, runtime);
}

/**
 * Persist every mutation made during the current request before a successful
 * response is returned. This is required for remote/serverless backends where
 * the next request may execute in a different process with a different cache.
 */
export async function flushPendingWrites(): Promise<void> {
  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);
  if (runtime.flushTimer) {
    clearTimeout(runtime.flushTimer);
    runtime.flushTimer = null;
  }
  await flushRealm(realmId, runtime, { throwOnError: true });
}

export async function reset(): Promise<void> {
  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);
  runtime.cache = empty();
  runtime.pendingPatchOperations = [];
  runtime.hydrated = true;
  runtime.mutationVersion += 1;
  await flushRealm(realmId, runtime, { throwOnError: true });
}

export function isPersistent(): boolean {
  return backend.persistent && realmRuntime().writable;
}

export interface BackendInfo {
  kind: BackendKind;
  persistent: boolean;
  description: string;
  hydrated: boolean;
  writable: boolean;
  realmId: string;
}

export function getBackendInfo(): BackendInfo {
  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);
  return {
    kind: backend.kind,
    persistent: backend.persistent,
    description: backend.description,
    hydrated: runtime.hydrated,
    writable: runtime.writable,
    realmId,
  };
}

/** The selected file backend's state path, for filesystem-visible coordinators. */
export function getFileBackendDataPath(): string | null {
  return backend.kind === "file" ? dataFileForRealm(getActiveDataRealmId()) : null;
}

/** Replace one isolated realm without changing the caller's active realm. */
export async function replaceDataRealmState(realmId: string, state: PortalState): Promise<void> {
  await runInDataRealm(realmId, async () => {
    const valid = getActiveDataRealmId();
    const runtime = realmRuntime(valid);
    if (runtime.flushTimer) clearTimeout(runtime.flushTimer);
    runtime.flushTimer = null;
    runtime.cache = parseBlob(JSON.stringify(state));
    runtime.pendingPatchOperations = [];
    runtime.hydrated = true;
    runtime.writable = backend.kind !== "kv";
    runtime.mutationVersion += 1;
    runtime.persistedVersion = runtime.mutationVersion - 1;
    runtime.lastFlushError = null;
    await flushRealm(valid, runtime, { throwOnError: true });
  });
}

/** Clone the complete current realm into an isolated target realm. */
export async function cloneCurrentDataRealm(targetRealmId: string): Promise<void> {
  await ensureHydrated({ fresh: true });
  await flushPendingWrites();
  await replaceDataRealmState(targetRealmId, structuredClone(getState()));
}
