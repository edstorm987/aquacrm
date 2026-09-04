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
import { AsyncLocalStorage } from "node:async_hooks";
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
import { isRemoteOperationError } from "@/lib/server/remoteOperation";
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
  personalMetricDays: {},
  clientRecordLedger: {},
  identityResolutionReviews: {},
  persons: {},
  organisations: {},
  completedActions: {},
  actionMutationReceipts: {},
  pipelines: {},
  pipelineCards: {},
  assistant: {},
  externalAssistantApiKeys: {},
  externalAssistantActionProposals: {},
  integrationConnections: {},
  clientFormNotices: {},
  subjectRequests: {},
  websiteDemoSignups: {},
  breachIncidents: {},
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
  privateObjectLifecycles: {},
  contractTemplates: {},
  developmentResources: {},
  developmentWorkflows: {},
  agencyWebsites: {},
  radarMemory: {},
  radarSyntheticProbes: {},
  radarEvidence: {},
  customKpis: {},
  operationalAlertSourceEpisodes: {},
  operationalAlertPreferences: {},
  userChromeLayouts: {},
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
  clientProjectOperations: {},
  outbox: {},
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
  loadBlobWithSidecars?(
    sidecars: Array<{ slug: string; key: string }>,
    realmId: string,
  ): Promise<{ mainBlob: string; sidecarBlobs: Record<string, string> }>;
  saveBlob(content: string, realmId: string): Promise<void>;
  applyPatch?(operations: StoragePatchOperation[], operationId: string, realmId: string): Promise<string>;
  applyPatchWithSidecars?(
    operations: StoragePatchOperation[],
    sidecars: Array<{ slug: string; key: string; operations: StoragePatchOperation[] }>,
    operationId: string,
    realmId: string,
  ): Promise<{ mainBlob: string; sidecarBlobs: Record<string, string> }>;
  /**
   * Load the Dev Team workspace files from their own datastore row.
   *
   * Its PRESENCE is what tells the rest of this file that the sidecar is real.
   * Backends without it (memory, local file) keep the files inside the main
   * document exactly as before — which is why the exclusions below are all
   * conditional. Stripping unconditionally would delete a founder's workspace
   * on every backend that has nowhere else to put it.
   */
  loadSidecarBlob?(slug: string, realmId: string): Promise<string | null>;
  /** Write one sidecar row. Also used to seed it from the main document. */
  saveSidecarBlob?(slug: string, content: string, realmId: string): Promise<void>;
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
  async loadBlobWithSidecars(sidecars, realmId) {
    const { loadBlobWithSidecars } = await import("./storageSupabase");
    return loadBlobWithSidecars(sidecars, {}, realmId);
  },
  async saveBlob(content, realmId) {
    const { saveBlob } = await import("./storageSupabase");
    return saveBlob(content, {}, realmId);
  },
  async applyPatch(operations, operationId, realmId) {
    const { applyPatch } = await import("./storageSupabase");
    return applyPatch(operations, { operationId }, realmId);
  },
  async applyPatchWithSidecars(operations, sidecars, operationId, realmId) {
    const { applyPatchWithSidecars } = await import("./storageSupabase");
    return applyPatchWithSidecars(operations, sidecars, { operationId }, realmId);
  },
  async loadSidecarBlob(slug, realmId) {
    const { loadSidecarBlob } = await import("./storageSupabase");
    return loadSidecarBlob(slug, {}, realmId);
  },
  async saveSidecarBlob(slug, content, realmId) {
    const { saveSidecarBlob } = await import("./storageSupabase");
    return saveSidecarBlob(slug, content, {}, realmId);
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
        (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
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

/**
 * Collections that live in their OWN datastore row rather than in the portal
 * document.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 *
 * Measured on the live project 2026-08-29: the document was **3.25 MB across 59
 * collections**, of which the actual business data (`clients`) was 181 KB —
 * 5.4%. PostgreSQL applies each `jsonb_set` against the COMPLETE value and the
 * patch RPC returns the whole saved document to be re-parsed, so marking one
 * enquiry as seen paid for every megabyte of machinery twice over.
 *
 * ── What a sidecar does and does not fix ─────────────────────────────────
 *
 * It fixes SIZE — write amplification and payload. It does **not** give
 * row-level security: the collection is still one JSON value and no policy can
 * address anything inside it. That needs real rows, which is a different and
 * much larger move. See `docs/development/plans/storage-and-remaining-build.md`.
 *
 * ── The two traps, both hit while building the first one ─────────────────
 *
 *  1. **Excluding new writes is not removing the old copy.** A document written
 *     before the split keeps its copy for ever unless something clears it — the
 *     bytes the split exists to remove, plus a second answer to the same
 *     question. Hence the explicit clear on every patched flush.
 *  2. **Clearing before the sidecar holds anything deletes the data.** Hydrate
 *     falls back to the main copy, so the first ordinary write would clear a
 *     collection that had nowhere else to be. Hence `sidecarPopulated`: the
 *     main copy is only ever cleared once the sidecar is CONFIRMED to hold it.
 *
 * Everything here is conditional on `backend.loadSidecarBlob` existing. Memory
 * and file backends have nowhere else to put these, and an unconditional strip
 * would delete a founder's workspace or a client's portal templates.
 */
interface SidecarCollection {
  /** The `PortalState` key that moves out. */
  key: "devTeamWorkspaceFiles" | "clientPortalTemplates" | "radarMemory" | "radarEvidence";
  /** Suffix of the row's `app_key`. */
  slug: string;
  /**
   * True when the collection already has its own atomic write path and this
   * file must not write the row itself. `devTeamWorkspaceFiles` is committed by
   * a row-locking RPC; writing it from the flush as well would race that lock.
   */
  dedicatedWriter: boolean;
  /**
   * When true the collection is NOT loaded on an ordinary hydrate — only when a
   * caller opts in via `ensureHydrated({ include: [key] })`. This is the read
   * fix for serverless: the biggest collections (each read by only a few pages)
   * stay out of the common per-request load, so a typical page reads a small
   * fraction of the old ~3.25MB blob instead of the whole thing. A caller that
   * reads a lazy collection MUST include it (directly, or via a service that
   * always calls `ensureHydrated({ include })` before touching it).
   */
  lazy?: boolean;
}

const SIDECAR_COLLECTIONS: readonly SidecarCollection[] = [
  // Lazy: 967 KB / ~29% of the live document, read by ONLY the Dev Team
  // workspace pages. It stays out of the common per-request hydrate, so a normal
  // page reads the small main blob instead of dragging this along. Safe to lazy
  // BECAUSE it is a dedicated writer (the flush never writes its row, so a page
  // that loaded without it cannot wipe it) and its sole reader — the async
  // `devWorkspaceFiles` service — always calls `ensureHydrated({ include })`
  // before touching it. Pre-migration the data is still in the main blob and is
  // loaded there regardless; only the post-migration sidecar overlay is deferred.
  { key: "devTeamWorkspaceFiles", slug: "dev-workspace-files", dedicatedWriter: true, lazy: true },
  // 615 KB, 18.5% of the live document, and no personal data — the reason it is
  // second. Written through ordinary `mutate()`, so the flush owns its row.
  { key: "clientPortalTemplates", slug: "client-portal-templates", dedicatedWriter: false },
  // Radar memory + evidence: ~1.08 MB of the live blob combined (663 KB + 418 KB)
  // and growing unbounded; agency-internal (no per-tenant/RLS implication). Both are
  // written only through ordinary `mutate()` (radarMemory.ts, radarEvidenceVault.ts),
  // so the flush owns their rows — non-dedicated, exactly like client-portal-templates.
  // Peeling them out shrinks the main blob that every serverless request reads and
  // rewrites, which is the fix for the write convoy. No SQL migration is needed: the
  // compare-and-swap seeds each sidecar from the LOCKED main row on the first write and
  // clears main in the same transaction, and until then the load path falls back to
  // main (sidecar-wins-else-main, guarded by `__aquaSidecarAuthoritative` + sidecarPopulated).
  { key: "radarMemory", slug: "radar-memory", dedicatedWriter: false },
  { key: "radarEvidence", slug: "radar-evidence", dedicatedWriter: false },
];

interface RealmRuntime {
  cache: PortalState | null;
  writable: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  flushInFlight: Promise<void> | null;
  fileSnapshotMtimeMs: number;
  mutationVersion: number;
  persistedVersion: number;
  lastFlushError: Error | null;
  /** Durable main/sidecar outcome must be reloaded before another write. */
  reconciliationRequired: Error | null;
  /** Exact operations required to make an unknown durable outcome definite. */
  reconciliationPlan: RealmReconciliationPlan | null;
  pendingPatchOperations: StoragePatchOperation[];
  activeAtomicCommit: PortalStateCommitCapture | null;
  atomicCommitTail: Promise<void>;
  hydrated: boolean;
  hydratePromise: Promise<void> | null;
  remoteRefreshPromise: Promise<void> | null;
  devTeamWorkspaceMutationQueue: Promise<void>;
  /**
   * Has the Dev Team workspace sidecar row been seen holding files?
   *
   * This gates clearing the copy in the main document, and it exists because
   * the first version of this split lost data. The sequence was: hydrate finds
   * no sidecar and falls back to the main copy (correct), then the very next
   * ordinary write clears the main copy (as designed) — while the sidecar row
   * still does not exist. The files were gone, and the next commit would have
   * written only the file it was given, not the ones it never saw.
   *
   * So the main copy is only ever cleared once the sidecar is CONFIRMED to
   * hold something. Until then the two coexist, which costs 967 KB and loses
   * nothing — the right way round for a migration.
   */
  /** Sidecar slugs confirmed to hold their collection. See `SIDECAR_COLLECTIONS`. */
  sidecarPopulated: Set<string>;
  /**
   * Sidecar slugs whose row this hydration has already tried to read (whether or
   * not it was authoritative). Distinct from `sidecarPopulated`: this gates the
   * supplementary load of a `lazy` collection so a later `ensureHydrated({
   * include })` fetches its row at most once per hydration. Cleared and rebuilt
   * on every full hydrate, exactly alongside `sidecarPopulated`.
   */
  sidecarLoaded: Set<string>;
}

interface RealmReconciliationPlan {
  /** The durable receipt makes replay return without reapplying over successors. */
  mainPatch: {
    operations: StoragePatchOperation[];
    sidecars: Array<{ slug: string; key: string; operations: StoragePatchOperation[] }>;
    operationId: string;
    /** Exact in-memory operations covered by this receipt; identity is intentional. */
    capturedPendingOperations: StoragePatchOperation[];
  } | null;
}

interface PortalStateCommitCapture {
  recording: boolean;
  committed: PortalState;
  operations: StoragePatchOperation[];
}

interface PortalStateMutationTransaction {
  active: boolean;
  realmId: string;
  base: PortalState;
  working: PortalState;
  beforeCommit?: () => void | Promise<void>;
}

// Coordinated operations build against an isolated state snapshot. Until the
// operation succeeds, ordinary readers keep seeing the last committed cache
// and the file backend keeps serving the last committed JSON document. This is
// deliberately request-scoped: nested domain calls share the same working
// tree, while unrelated requests cannot observe half-written row/index sets.
const portalStateMutationTransactions = new AsyncLocalStorage<PortalStateMutationTransaction>();

const realmRuntimes = new Map<string, RealmRuntime>();

/**
 * How many realms a single process keeps parsed at once.
 *
 * This Map was insert-only: nothing ever removed an entry, so every realm a
 * warm instance touched kept a fully parsed `PortalState` alive for the life of
 * the process. With one live realm and a handful of sandboxes that was free.
 * With a realm PER DEMO VISITOR it is a memory leak with a queue of visitors
 * feeding it — a ~250 KB document parses to roughly 1–3 MB of heap, so a warm
 * lambda would fall over somewhere in the low hundreds.
 *
 * 25 is generous: a request touches exactly one realm, so this only has to
 * cover the working set of a warm instance, not the number of live demos.
 */
const MAX_REALM_RUNTIMES = 25;

/**
 * Never evict a realm that still owes a write.
 *
 * Dropping a dirty runtime silently loses everything it was holding — this is
 * the one thing an eviction policy here can get catastrophically wrong, so it
 * is checked explicitly rather than inferred from a timer being unset.
 */
function realmRuntimeIsEvictable(runtime: RealmRuntime): boolean {
  return runtime.flushTimer === null
    && runtime.flushInFlight === null
    && runtime.activeAtomicCommit === null
    && runtime.reconciliationRequired === null
    && runtime.pendingPatchOperations.length === 0
    && runtime.mutationVersion === runtime.persistedVersion;
}

/**
 * Drop the least-recently-used CLEAN realms until the map is back under the
 * cap. Map preserves insertion order and `realmRuntime` re-inserts on every
 * touch, so iteration order is LRU-first.
 *
 * The live realm and the realm currently being served are never candidates:
 * evicting the one in flight would re-hydrate it mid-request.
 */
function evictColdRealmRuntimes(keepRealmId: string): void {
  if (realmRuntimes.size <= MAX_REALM_RUNTIMES) return;
  for (const [realmId, runtime] of realmRuntimes) {
    if (realmRuntimes.size <= MAX_REALM_RUNTIMES) return;
    if (realmId === keepRealmId || realmId === LIVE_DATA_REALM_ID) continue;
    if (!realmRuntimeIsEvictable(runtime)) continue;
    realmRuntimes.delete(realmId);
  }
  // Deliberately no fallback that force-drops a dirty runtime. If every realm
  // over the cap owes a write, the right outcome is to hold the memory and let
  // the flushes finish — losing a visitor's data to save heap is not a trade
  // this code gets to make.
}

function realmRuntime(realmId = getActiveDataRealmId()): RealmRuntime {
  const valid = normaliseDataRealmId(realmId);
  const existing = realmRuntimes.get(valid);
  if (existing) {
    // Re-insert so Map iteration order stays least-recently-used first.
    realmRuntimes.delete(valid);
    realmRuntimes.set(valid, existing);
    return existing;
  }
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
    reconciliationRequired: null,
    reconciliationPlan: null,
    pendingPatchOperations: [],
    activeAtomicCommit: null,
    atomicCommitTail: Promise.resolve(),
    hydrated: false,
    hydratePromise: null,
    remoteRefreshPromise: null,
    devTeamWorkspaceMutationQueue: Promise.resolve(),
    sidecarPopulated: new Set<string>(),
    sidecarLoaded: new Set<string>(),
  };
  realmRuntimes.set(valid, created);
  evictColdRealmRuntimes(valid);
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

/**
 * Make every ambiguous durable operation definite before the cache is
 * reloaded and the realm becomes writable again.
 *
 * An unknown patch is retried with the same durable operation receipt. The
 * database either completes the original main+sidecar transaction or returns
 * current authoritative rows without reapplying over a successor.
 */
async function reconcileRealm(runtime: RealmRuntime, realmId: string): Promise<void> {
  const plan = runtime.reconciliationPlan;
  if (!plan) return;

  if (plan.mainPatch) {
    if (plan.mainPatch.sidecars.length > 0) {
      if (!backend.applyPatchWithSidecars) {
        throw new Error("[portal] cannot reconcile an unknown atomic sidecar patch on this storage backend.");
      }
      await backend.applyPatchWithSidecars(
        plan.mainPatch.operations,
        plan.mainPatch.sidecars,
        plan.mainPatch.operationId,
        realmId,
      );
    } else {
      if (!backend.applyPatch) {
        throw new Error("[portal] cannot reconcile an unknown main patch on this storage backend.");
      }
      await backend.applyPatch(plan.mainPatch.operations, plan.mainPatch.operationId, realmId);
    }
    // The receipt has now confirmed these exact operations durable. Remove
    // only their original queue objects; operations appended by another
    // request while the write was in flight must survive hydration and flush.
    const confirmed = new Set(plan.mainPatch.capturedPendingOperations);
    runtime.pendingPatchOperations = runtime.pendingPatchOperations.filter(operation => !confirmed.has(operation));
  }
}

/**
 * Fetch the rows of any `lazy` sidecar collections named in `include` that this
 * hydration has not already read, and overlay them onto the resident cache. This
 * is the second half of the read fix: a page's layout hydrates the small common
 * blob first (no `include`), then a nested service that actually reads a big
 * collection calls `ensureHydrated({ include: [...] })`, and this brings just
 * that collection in — at most one extra row read, once per hydration.
 *
 * Idempotent and safe to call on every `ensureHydrated` exit: it does nothing
 * for a non-lazy or already-fetched collection, and a row that cannot be read
 * leaves the caller with whatever the main document holds rather than throwing.
 */
async function loadRequestedLazySidecars(
  runtime: RealmRuntime,
  realmId: string,
  include: readonly SidecarCollection["key"][] | undefined,
): Promise<void> {
  if (!include || include.length === 0) return;
  if (!backend.loadSidecarBlob || !runtime.cache) return;
  for (const key of include) {
    const entry = SIDECAR_COLLECTIONS.find(candidate => candidate.key === key && candidate.lazy);
    // Not lazy (already loaded eagerly) or unknown — nothing to do.
    if (!entry) continue;
    // Its row was already read in this hydration (eagerly or by an earlier
    // include). Re-reading would only cost a round-trip.
    if (runtime.sidecarLoaded.has(entry.slug)) continue;
    try {
      const sidecar = await backend.loadSidecarBlob(entry.slug, realmId);
      // Mark it attempted regardless of the outcome so an empty/absent row is
      // not re-fetched on every read within this hydration.
      runtime.sidecarLoaded.add(entry.slug);
      if (!sidecar) continue;
      const parsed = JSON.parse(sidecar) as Record<string, unknown>;
      const held = parsed[entry.key];
      const authoritative = parsed.__aquaSidecarAuthoritative === true
        || Boolean(held && typeof held === "object" && !Array.isArray(held) && Object.keys(held).length > 0);
      if (held && typeof held === "object" && !Array.isArray(held) && authoritative) {
        // Same sidecar-wins-else-main rule as the eager loop: overlay the one
        // collection, never touch the rest of the cache.
        (runtime.cache as unknown as Record<string, unknown>)[entry.key] = held;
        runtime.sidecarPopulated.add(entry.slug);
      }
    } catch (error) {
      // A lazy sidecar that cannot be read must not crash the request. The
      // caller sees the main document's copy (empty once the collection has been
      // migrated out), never a thrown error on a read path.
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[portal] lazy sidecar "${entry.slug}" was unreadable; using the main document:`, error);
      }
    }
  }
}

// ── Per-request dedup of `fresh:true` full-state reloads ────────────────────
// A single serverless request often asks for a fresh reload of the same realm
// several times — e.g. `requireCurrentAccessActor` reloads the active realm and
// then the LIVE realm, which for a non-sandbox owner are the SAME row. On
// serverless each such reload is a ~1.3-1.6s round-trip for the whole ~3.25MB
// document, so three back-to-back loads per navigation was the dominant cost.
// Within ONE request nothing external mutates the row between those calls, so the
// second+ fresh read cannot observe anything the first did not — reload each realm
// under `fresh:true` at most once per request. Keyed on the Next request store so
// it is a no-op outside a request (scripts/tests reload every time, unchanged) and
// a WARM serverless instance still performs exactly one fresh reload per request —
// so a grant/revocation that lands between requests still takes effect on the next
// navigation. Cross-request freshness and the per-request auth boundary are
// untouched. Use `forceFreshReload` where a caller must always see the very latest
// row within the same request (the product-workspace lease before it locks).
const freshlyLoadedRealmsByRequest = new WeakMap<object, Set<string>>();
function currentRequestKey(): object | null {
  const store = workUnitAsyncStorage.getStore();
  return store?.type === "request" ? store : null;
}
function realmLoadedFreshThisRequest(realmId: string): boolean {
  const key = currentRequestKey();
  return key ? (freshlyLoadedRealmsByRequest.get(key)?.has(realmId) ?? false) : false;
}
function markRealmLoadedFreshThisRequest(realmId: string): void {
  const key = currentRequestKey();
  if (!key) return;
  let set = freshlyLoadedRealmsByRequest.get(key);
  if (!set) {
    set = new Set<string>();
    freshlyLoadedRealmsByRequest.set(key, set);
  }
  set.add(realmId);
}

// On a single long-lived instance (a persistent server, PORTAL_SINGLE_INSTANCE=true)
// the in-memory cache IS authoritative: this process is the only writer of the
// state row, every write updates the cache and persists through to the backend,
// and there is no sibling instance whose write a fresh reload would need to see.
// So `fresh:true` reloads — which exist purely for serverless multi-instance
// coherence — are pure per-request cost here, and dropping them is what makes a
// persistent deployment as instant as localhost. The initial cold load and
// post-failure reconciliation still run; only the redundant re-read-every-request
// is skipped. Off by default, so serverless keeps re-reading for coherence.
function trustsInMemoryState(): boolean {
  return process.env.PORTAL_SINGLE_INSTANCE === "true";
}

export async function ensureHydrated(options?: {
  fresh?: boolean;
  /**
   * Force a `fresh:true` reload even if this realm was already reloaded fresh
   * earlier in the same request. Reserved for the few callers that must read the
   * very latest row before a write/lock (e.g. the product-workspace lease).
   */
  forceFreshReload?: boolean;
  /** Server-only escape hatch for code already wrapped in runInDataRealm(). */
  preserveExplicitRealm?: boolean;
  /**
   * Collection keys that MUST be resident before this call returns — the read
   * fix for `lazy` sidecars (e.g. `["devTeamWorkspaceFiles"]`). A caller that
   * reads a lazy collection passes it here; every other request omits it and
   * never fetches that collection's row. Naming a non-lazy (already-eager)
   * collection is harmless. When the realm is already hydrated, only the named
   * lazy sidecars not yet fetched this hydration are loaded — nothing else is
   * re-read.
   */
  include?: readonly SidecarCollection["key"][];
}): Promise<void> {
  const realmId = enterSignedRequestRealm(options?.preserveExplicitRealm === true);
  const runtime = realmRuntime(realmId);
  const dataFile = dataFileForRealm(realmId);
  const needsReconciliation = runtime.reconciliationRequired !== null;
  const shouldRefreshPersistent =
    options?.fresh === true &&
    // On a single persistent instance the in-memory cache is authoritative, so
    // fresh reloads (a serverless multi-instance-coherence device) are skipped —
    // this is what makes a persistent deployment localhost-fast.
    !trustsInMemoryState() &&
    // Skip a duplicate fresh reload of a realm this request already reloaded
    // fresh (unless the caller forces it). See freshlyLoadedRealmsByRequest.
    (options?.forceFreshReload === true || !realmLoadedFreshThisRequest(realmId)) &&
    (backend.kind === "supabase" || backend.kind === "postgres" || backend.kind === "file");

  if ((shouldRefreshPersistent || needsReconciliation) && runtime.hydrated) {
    if (!runtime.remoteRefreshPromise) {
      runtime.remoteRefreshPromise = (async () => {
        if (needsReconciliation) {
          // Wait until the failed atomic lane has restored its committed cache
          // view, then complete the exact durable reconciliation plan. No
          // mutation can be flushed while the realm is fenced.
          await runtime.atomicCommitTail.catch(() => undefined);
          await reconcileRealm(runtime, realmId);
        } else {
          // Never replace local changes with a remote snapshot that predates
          // them. Mutation routes explicitly flush before returning, while this
          // also protects callers during a warm server transition.
          await flushPendingWrites();
        }
        runtime.hydrated = false;
        runtime.hydratePromise = null;
        await ensureHydrated({ preserveExplicitRealm: options?.preserveExplicitRealm });
        // Mutations from unrelated requests may have arrived while the failed
        // atomic write was in flight. Hydration reapplies those retained
        // patches; persist them before the reconciliation fence is considered
        // fully cleared, even if the request that triggered recovery is read-only.
        if (needsReconciliation && runtime.pendingPatchOperations.length > 0) {
          await flushPendingWrites();
        }
      })().finally(() => {
        runtime.remoteRefreshPromise = null;
      });
    }
    await runtime.remoteRefreshPromise;
    await loadRequestedLazySidecars(runtime, realmId, options?.include);
    return;
  }
  if (runtime.hydrated && backend.kind === "file" && existsSync(dataFile)) {
    const currentMtimeMs = statSync(dataFile).mtimeMs;
    if (currentMtimeMs > runtime.fileSnapshotMtimeMs) {
      runtime.hydrated = false;
      runtime.hydratePromise = null;
    }
  }
  if (runtime.hydrated) {
    // Already hydrated: bring in any lazy collection this caller needs that an
    // earlier (include-less) hydrate left out. No-op when nothing is requested.
    await loadRequestedLazySidecars(runtime, realmId, options?.include);
    return;
  }
  if (!runtime.hydratePromise) {
    runtime.hydratePromise = (async () => {
      const reconciliationAtStart = runtime.reconciliationRequired;
      const cacheBeforeReconciliation = reconciliationAtStart ? runtime.cache : null;
      const sidecarsBeforeReconciliation = reconciliationAtStart
        ? new Set(runtime.sidecarPopulated)
        : null;
      const sidecarsLoadedBeforeReconciliation = reconciliationAtStart
        ? new Set(runtime.sidecarLoaded)
        : null;
      const pendingBeforeReconciliation = reconciliationAtStart
        ? structuredClone(runtime.pendingPatchOperations)
        : null;
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
        const ownedSidecarSpecs = SIDECAR_COLLECTIONS
          .filter(entry => !entry.dedicatedWriter)
          // A lazy collection is not fetched by the common request; the coherent
          // snapshot skips its row unless this call explicitly includes it.
          .filter(entry => !entry.lazy || options?.include?.includes(entry.key))
          .map(entry => ({ slug: entry.slug, key: entry.key }));
        const coherentSnapshot = backend.loadBlobWithSidecars
          ? await backend.loadBlobWithSidecars(ownedSidecarSpecs, realmId)
          : null;
        let raw = coherentSnapshot?.mainBlob ?? await backend.loadBlob(realmId);
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
        runtime.sidecarPopulated.clear();
        runtime.sidecarLoaded.clear();
        // The Dev Team workspace files live in their own row on backends that
        // support it — 967 KB of a 3.25 MB document when this was measured.
        //
        // The sidecar WINS where it exists, and the main document is the
        // fallback where it does not. That ordering is what makes the move
        // safe on a project that has not been migrated yet: the files are
        // still read from wherever they actually are, and the first commit
        // writes them to the sidecar. A missing sidecar row is the normal
        // state before the first commit, never an error.
        if (backend.loadSidecarBlob && runtime.cache) {
          try {
            for (const sidecarCollection of SIDECAR_COLLECTIONS) {
              // A lazy collection is fetched only when this call includes it;
              // otherwise it is left to the supplementary load, so the common
              // request never reads its row. Pre-migration data still lives in
              // the main blob (loaded by parseBlob), so skipping the overlay here
              // is safe — only the post-migration sidecar copy is deferred.
              if (sidecarCollection.lazy && !options?.include?.includes(sidecarCollection.key)) continue;
              const sidecar = sidecarCollection.dedicatedWriter || !coherentSnapshot
                ? await backend.loadSidecarBlob(sidecarCollection.slug, realmId)
                : coherentSnapshot.sidecarBlobs[sidecarCollection.slug];
              runtime.sidecarLoaded.add(sidecarCollection.slug);
              if (!sidecar) continue;
              const parsed = JSON.parse(sidecar) as Record<string, unknown>;
              const held = parsed[sidecarCollection.key];
              const authoritative = parsed.__aquaSidecarAuthoritative === true
                || Boolean(held && typeof held === "object" && !Array.isArray(held) && Object.keys(held).length > 0);
              if (held && typeof held === "object" && !Array.isArray(held) && authoritative) {
                // The sidecar WINS where it exists; the main document is the
                // fallback where it does not. That ordering is what makes the
                // move safe on a project that has not been migrated: the data
                // is read from wherever it actually is.
                (runtime.cache as unknown as Record<string, unknown>)[sidecarCollection.key] = held;
                runtime.sidecarPopulated.add(sidecarCollection.slug);
              }
            }
          } catch (error) {
            if (reconciliationAtStart) throw error;
            // A sidecar that cannot be read must not stop the portal booting:
            // the main document still carries the files until they are moved,
            // and every other collection is unaffected either way.
            if (process.env.NODE_ENV !== "test") {
              console.warn("[portal] a sidecar row was unreadable; using the main document:", error);
            }
          }
        }
        if (pendingBeforeReconciliation && pendingBeforeReconciliation.length > 0) {
          runtime.cache = parseBlob(JSON.stringify(
            applyStoragePatch(runtime.cache, pendingBeforeReconciliation),
          ));
        }
        runtime.mutationVersion = pendingBeforeReconciliation?.length ? 1 : 0;
        runtime.persistedVersion = 0;
        runtime.pendingPatchOperations = pendingBeforeReconciliation ?? [];
        runtime.lastFlushError = null;
        runtime.reconciliationRequired = null;
        runtime.reconciliationPlan = null;
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
        if (reconciliationAtStart) {
          runtime.cache = cacheBeforeReconciliation;
          runtime.sidecarPopulated.clear();
          for (const slug of sidecarsBeforeReconciliation ?? []) runtime.sidecarPopulated.add(slug);
          runtime.sidecarLoaded.clear();
          for (const slug of sidecarsLoadedBeforeReconciliation ?? []) runtime.sidecarLoaded.add(slug);
          runtime.hydrated = runtime.cache !== null;
          runtime.lastFlushError = new Error(
            `[portal] storage reconciliation failed: ${error.message}`,
            { cause: error },
          );
          throw runtime.lastFlushError;
        }
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
  // A real backend load just completed for this realm — record it so any further
  // fresh:true reloads of the same realm within this request are deduped.
  markRealmLoadedFreshThisRequest(realmId);
  // The hydrate above may have been started by a concurrent include-less caller,
  // so honour this call's own include once the shared hydrate has settled.
  await loadRequestedLazySidecars(runtime, realmId, options?.include);
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
      personalMetricDays: parsed.personalMetricDays ?? {},
      clientRecordLedger: parsed.clientRecordLedger ?? {},
      identityResolutionReviews: parsed.identityResolutionReviews ?? {},
      persons: parsed.persons ?? {},
      organisations: parsed.organisations ?? {},
      completedActions: parsed.completedActions ?? {},
      actionMutationReceipts: parsed.actionMutationReceipts ?? {},
      pipelines: parsed.pipelines ?? {},
      pipelineCards: parsed.pipelineCards ?? {},
      assistant: parsed.assistant ?? {},
      externalAssistantApiKeys: parsed.externalAssistantApiKeys ?? {},
      externalAssistantActionProposals: parsed.externalAssistantActionProposals ?? {},
      integrationConnections: parsed.integrationConnections ?? {},
      clientFormNotices: parsed.clientFormNotices ?? {},
      subjectRequests: parsed.subjectRequests ?? {},
      websiteDemoSignups: parsed.websiteDemoSignups ?? {},
      breachIncidents: parsed.breachIncidents ?? {},
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
      privateObjectLifecycles: parsed.privateObjectLifecycles ?? {},
      contractTemplates: parsed.contractTemplates ?? {},
      developmentResources: parsed.developmentResources ?? {},
      developmentWorkflows: parsed.developmentWorkflows ?? {},
      agencyWebsites: parsed.agencyWebsites ?? {},
      radarMemory: parsed.radarMemory ?? {},
      radarSyntheticProbes: parsed.radarSyntheticProbes ?? {},
      radarEvidence: parsed.radarEvidence ?? {},
      customKpis: parsed.customKpis ?? {},
      radarInfraHealth: parsed.radarInfraHealth,
      operationalAlertSourceEpisodes: parsed.operationalAlertSourceEpisodes ?? {},
      operationalAlertPreferences: parsed.operationalAlertPreferences ?? {},
      userChromeLayouts: parsed.userChromeLayouts ?? {},
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
      clientProjectOperations: parsed.clientProjectOperations ?? {},
      outbox: parsed.outbox ?? {},
  };
}

async function flushRealm(
  realmId: string,
  runtime: RealmRuntime,
  options?: { throwOnError?: boolean },
): Promise<void> {
  if (!runtime.cache) return;
  if (runtime.reconciliationRequired) {
    if (options?.throwOnError) throw runtime.reconciliationRequired;
    return;
  }
  if (!runtime.writable) {
    if (options?.throwOnError) {
      throw runtime.lastFlushError ?? new Error(`[portal] backend "${backend.kind}" is not writable.`);
    }
    return;
  }
  if (runtime.flushInFlight) await runtime.flushInFlight;
  if (runtime.reconciliationRequired) {
    if (options?.throwOnError) throw runtime.reconciliationRequired;
    return;
  }
  if (runtime.persistedVersion === runtime.mutationVersion) return;

  const targetVersion = runtime.mutationVersion;
  const operationCount = runtime.pendingPatchOperations.length;
  const capturedOperations = runtime.pendingPatchOperations.slice(0, operationCount);
  const ownedSidecarPatches = backend.applyPatchWithSidecars
    ? SIDECAR_COLLECTIONS
      .filter(entry => !entry.dedicatedWriter)
      .flatMap(entry => {
        // A lazy collection NOT loaded on this request holds only its
        // post-migration empty main copy in the cache. It must never be seeded
        // or split from here — doing so would write {} over the authoritative
        // sidecar row (data loss). A page that legitimately writes the
        // collection loaded it first (via ensureHydrated include), so it is in
        // sidecarLoaded and passes.
        if (entry.lazy && !runtime.sidecarLoaded.has(entry.slug)) return [];
        const collectionOperations = capturedOperations.filter(operation => operation.path[0] === entry.key);
        const held = (runtime.cache as unknown as Record<string, unknown>)[entry.key] ?? {};
        const seeding = !runtime.sidecarPopulated.has(entry.slug) && Object.keys(held as object).length > 0;
        return collectionOperations.length > 0 || seeding
          ? [{ slug: entry.slug, key: entry.key, operations: collectionOperations }]
          : [];
      })
    : [];
  // A sidecar being created in THIS transaction is cleared from main in that
  // same database transaction. Computing this before the commit used to leave
  // the first seed duplicated in main and allowed an empty sidecar to revive it.
  const splitOut = backend.loadSidecarBlob
    ? SIDECAR_COLLECTIONS.filter(entry =>
        runtime.sidecarPopulated.has(entry.slug)
        || ownedSidecarPatches.some(sidecar => sidecar.slug === entry.slug))
    : [];
  const snapshot = JSON.stringify(
    splitOut.length > 0
      ? { ...runtime.cache, ...Object.fromEntries(splitOut.map(entry => [entry.key, {}])) }
      : runtime.cache,
  );
  const operations = capturedOperations
    .filter(operation => !splitOut.some(entry => entry.key === operation.path[0]));
  // Excluding NEW operations is not enough on its own: a document written
  // before the split still holds its own copy of the files, and nothing would
  // ever remove it. It would sit there for ever — the 967 KB the split exists
  // to remove, plus a second answer to "what is in this file" that drifts the
  // moment anyone commits.
  //
  // So the clear is asserted on every patched flush rather than done once. It
  // is idempotent, it costs one tiny operation, and it needs no migration step
  // that somebody has to remember to run. The sidecar row is a different row,
  // so this can never race a commit in flight against it.
  if (capturedOperations.length > 0 || ownedSidecarPatches.length > 0) {
    for (const entry of splitOut) {
      operations.push({ op: "set", path: [entry.key], value: {} });
    }
  }
  const operationId = randomUUID();
  const dataFile = dataFileForRealm(realmId);
  runtime.flushInFlight = (async () => {
    let mainWriteUnresolved = false;
    let requiresReconciliation = false;
    let durableResponseReceived = false;
    try {
      const writeMain = async (): Promise<{ mainBlob: string | null; sidecarBlobs: Record<string, string> }> => {
        if (ownedSidecarPatches.length > 0 && backend.applyPatchWithSidecars) {
          const saved = await backend.applyPatchWithSidecars(operations, ownedSidecarPatches, operationId, realmId);
          return saved;
        }
        if (backend.applyPatch) {
          if (operations.length === 0) return { mainBlob: null, sidecarBlobs: {} };
          return { mainBlob: await backend.applyPatch(operations, operationId, realmId), sidecarBlobs: {} };
        }
        await backend.saveBlob(snapshot, realmId);
        return { mainBlob: null, sidecarBlobs: {} };
      };
      let saved: { mainBlob: string | null; sidecarBlobs: Record<string, string> };
      try {
        saved = await writeMain();
      } catch (firstMainError) {
        if (
          backend.applyPatch
          && (operations.length > 0 || ownedSidecarPatches.length > 0)
          && isRemoteOperationError(firstMainError)
          && firstMainError.outcomeUnknown
        ) {
          // The durable operation receipt makes this an exact replay, not
          // f(f(x)): if the first transaction committed, the database returns
          // current rows without applying these operations over successors.
          try {
            saved = await writeMain();
          } catch (retryError) {
            mainWriteUnresolved = true;
            requiresReconciliation = true;
            throw new Error(
              `${firstMainError.message} Exact main-patch reconciliation retry also failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
              { cause: new AggregateError([firstMainError, retryError]) },
            );
          }
        } else {
          if (isRemoteOperationError(firstMainError) && firstMainError.outcomeUnknown) {
            mainWriteUnresolved = true;
            requiresReconciliation = true;
          }
          throw firstMainError;
        }
      }
      durableResponseReceived = true;
      let nextCache: PortalState | null = null;
      const populatedSidecars: string[] = [];
      if (saved.mainBlob) {
        const remoteState = parseBlob(saved.mainBlob);
        for (const sidecar of ownedSidecarPatches) {
          const sidecarBlob = saved.sidecarBlobs[sidecar.slug];
          if (!sidecarBlob) throw new Error(`[portal] atomic sidecar response omitted "${sidecar.slug}".`);
          const parsed = JSON.parse(sidecarBlob) as Record<string, unknown>;
          (remoteState as unknown as Record<string, unknown>)[sidecar.key] = parsed[sidecar.key] ?? {};
          populatedSidecars.push(sidecar.slug);
        }
        for (const entry of splitOut) {
          if (ownedSidecarPatches.some(sidecar => sidecar.slug === entry.slug)) continue;
          (remoteState as unknown as Record<string, unknown>)[entry.key] =
            (runtime.cache as unknown as Record<string, unknown>)[entry.key] ?? {};
        }
        const remainingOperations = runtime.pendingPatchOperations.slice(operationCount);
        nextCache = remainingOperations.length > 0
          ? parseBlob(JSON.stringify(applyStoragePatch(remoteState, remainingOperations)))
          : remoteState;
      }
      runtime.pendingPatchOperations.splice(0, operationCount);
      for (const slug of populatedSidecars) runtime.sidecarPopulated.add(slug);
      if (nextCache) runtime.cache = nextCache;
      runtime.persistedVersion = targetVersion;
      runtime.lastFlushError = null;
      if (backend.kind === "file" && existsSync(dataFile)) {
        runtime.fileSnapshotMtimeMs = statSync(dataFile).mtimeMs;
      }
    } catch (e) {
      const primaryError = e instanceof Error ? e : new Error(String(e));
      runtime.lastFlushError = primaryError;
      // A transport-successful commit whose authoritative state cannot be
      // decoded locally is still durable. Keep the exact receipt and fence the
      // realm; treating this as an ordinary rollback would drop retry state.
      if (durableResponseReceived) {
        mainWriteUnresolved = true;
        requiresReconciliation = true;
      }
      if (requiresReconciliation) {
        runtime.reconciliationRequired = runtime.lastFlushError;
        runtime.reconciliationPlan = {
          mainPatch:
            mainWriteUnresolved
              && (operations.length > 0 || ownedSidecarPatches.length > 0)
              && (backend.applyPatch || backend.applyPatchWithSidecars)
              ? {
                  operations: structuredClone(operations),
                  sidecars: structuredClone(ownedSidecarPatches),
                  operationId,
                  capturedPendingOperations: capturedOperations.slice(),
                }
              : null,
        };
      }
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

// ── Dev/test guard against reading an undeclared lazy collection ────────────
// A lazy collection returns its (post-migration empty) main copy when a request
// did not load it — silent wrong/empty data, the worst failure mode of scoped
// loading. In development and tests, on a sidecar-splitting backend, THROW the
// instant such a collection is read so an under-declared `ensureHydrated({
// include })` is caught by the every-route crawl, never by a user. Off in
// production (there the safe empty-fallback stands) and a no-op on backends
// without sidecars (memory/file keep every collection in the main document).
const LAZY_SIDECAR_KEY_TO_SLUG: ReadonlyMap<string, string> = new Map(
  SIDECAR_COLLECTIONS.filter(entry => entry.lazy).map(entry => [entry.key, entry.slug] as const),
);
function isEmptyCollection(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}
function guardLazyCollectionAccess(state: PortalState, runtime: RealmRuntime): PortalState {
  if (process.env.NODE_ENV === "production") return state;
  if (LAZY_SIDECAR_KEY_TO_SLUG.size === 0 || !backend.loadSidecarBlob) return state;
  return new Proxy(state, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string") {
        const slug = LAZY_SIDECAR_KEY_TO_SLUG.get(prop);
        // Throw only for the real failure: a lazy collection this request did not
        // load AND which comes back empty. Pre-migration the data is still in the
        // main document (non-empty) so a read there is fine; post-migration an
        // undeclared read is empty — the silent-data bug — and is caught here.
        if (slug && !runtime.sidecarLoaded.has(slug) && isEmptyCollection(value)) {
          throw new Error(
            `[portal] getState().${prop} was read but "${prop}" is a lazy collection this request never loaded, `
            + `so it came back empty. Declare it on the route: ensureHydrated({ include: [${JSON.stringify(prop)}] }). `
            + `(Dev/test guard — disabled in production.)`,
          );
        }
      }
      return value;
    },
  });
}

export function getState(): PortalState {
  const realmId = getActiveDataRealmId();
  const transaction = portalStateMutationTransactions.getStore();
  if (transaction?.active && transaction.realmId === realmId) return transaction.working;
  const runtime = realmRuntime(realmId);
  // The backend write for an atomic transaction may still be in flight. Its
  // tentative replacement lives in `runtime.cache` for the flush machinery,
  // but unrelated request code must keep seeing the last committed view until
  // that write succeeds. Concurrent ordinary mutations update both views.
  if (runtime.activeAtomicCommit?.recording) return runtime.activeAtomicCommit.committed;
  return guardLazyCollectionAccess(runtime.cache ?? empty(), runtime);
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

  // ── Seed the sidecar before the first commit ever reaches it ───────────
  //
  // The RPC writes only the operations it is handed, against whatever the
  // sidecar row already holds. On a project that has not been split yet that
  // row is empty, so the first commit would leave it holding one file while
  // the main document — which still has all of them — is cleared on the next
  // flush. Every other workspace file would be gone.
  //
  // Seeding first makes the move lossless without a migration step anyone has
  // to remember. It runs once: after this the sidecar is populated and the
  // flag stays set for the life of the process.
  const devSidecar = SIDECAR_COLLECTIONS.find(entry => entry.key === "devTeamWorkspaceFiles")!;
  if (backend.saveSidecarBlob && !runtime.sidecarPopulated.has(devSidecar.slug)) {
    const existing = runtime.cache?.devTeamWorkspaceFiles ?? {};
    if (Object.keys(existing).length > 0) {
      await backend.saveSidecarBlob(devSidecar.slug, JSON.stringify({ devTeamWorkspaceFiles: existing }), realmId);
      runtime.sidecarPopulated.add(devSidecar.slug);
    }
  }

  try {
    const savedBlob = await backend.applyDevTeamWorkspaceFiles(operations, realmId);
    const remoteState = parseBlob(savedBlob);
    if (backend.loadSidecarBlob) {
      // The RPC now writes the SIDECAR row, so what comes back describes only
      // the workspace files — not the whole portal. Replacing the cache with it
      // would wipe every other collection, which is the single worst thing this
      // change could do. Merge the one collection instead.
      const current = runtime.cache ?? empty();
      current.devTeamWorkspaceFiles = remoteState.devTeamWorkspaceFiles ?? {};
      runtime.cache = current;
      // The sidecar now holds files, so the main document's copy may be cleared.
      if (Object.keys(current.devTeamWorkspaceFiles).length > 0) {
        runtime.sidecarPopulated.add(devSidecar.slug);
      }
    } else {
      // A normal domain mutation may have landed while the database RPC was in
      // flight. Reapply those still-pending patches over the returned snapshot;
      // their own flush remains responsible for persistence.
      runtime.cache = runtime.pendingPatchOperations.length > 0
        ? parseBlob(JSON.stringify(applyStoragePatch(remoteState, runtime.pendingPatchOperations)))
        : remoteState;
    }
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

function replacePortalState(target: PortalState, replacement: PortalState): void {
  const targetRecord = target as unknown as Record<string, unknown>;
  for (const key of Object.keys(targetRecord)) delete targetRecord[key];
  Object.assign(targetRecord, replacement as unknown as Record<string, unknown>);
}

async function commitPortalStateMutationTransactionInLane(
  transaction: PortalStateMutationTransaction,
  runtime: RealmRuntime,
): Promise<void> {
  const operations = diffStorageValue(transaction.base, transaction.working);
  if (operations.length === 0) {
    await portalStateMutationTransactions.exit(() => flushPendingWrites());
    return;
  }

  // Coordinators use this boundary to prove that a remote lease still belongs
  // to this operation immediately before any durable state can change. Keep it
  // after the potentially expensive clone/diff work, and run it for explicit
  // transaction checkpoints as well as the final commit.
  await transaction.beforeCommit?.();

  // The lease check above can await the database. Snapshot and merge only after
  // it returns: an ordinary local writer may have committed a disjoint branch
  // while renewal was in flight, and merging from the earlier cache would erase
  // that write at the very boundary intended to make this transaction safe.
  const beforeCommit = structuredClone(runtime.cache ?? empty());
  const beforeMutationVersion = runtime.mutationVersion;
  const beforePersistedVersion = runtime.persistedVersion;
  const beforeLastFlushError = runtime.lastFlushError;
  const beforeWritable = runtime.writable;
  const merged = applyStoragePatch(runtime.cache ?? empty(), operations);
  const commitCapture: PortalStateCommitCapture = {
    recording: false,
    committed: structuredClone(beforeCommit),
    operations: [],
  };
  runtime.activeAtomicCommit = commitCapture;
  const transactionPatchOperations = new Set<StoragePatchOperation>();
  let transactionMutationVersion = beforeMutationVersion;
  try {
    await portalStateMutationTransactions.exit(async () => {
      const patchStart = runtime.pendingPatchOperations.length;
      mutate(state => replacePortalState(state, merged));
      for (const operation of runtime.pendingPatchOperations.slice(patchStart)) {
        transactionPatchOperations.add(operation);
      }
      transactionMutationVersion = runtime.mutationVersion;
      commitCapture.recording = true;
      await flushPendingWrites();
    });
    transaction.base = structuredClone(transaction.working);
  } catch (error) {
    commitCapture.recording = false;
    const failedMutationVersion = runtime.mutationVersion;
    const retainedPending = runtime.pendingPatchOperations.filter(
      operation => !transactionPatchOperations.has(operation),
    );
    if (runtime.flushTimer) clearTimeout(runtime.flushTimer);
    runtime.flushTimer = null;
    // Roll back only this transaction. Mutations made by another async request
    // while the failed backend call was in flight remain pending and visible.
    runtime.cache = parseBlob(JSON.stringify(applyStoragePatch(beforeCommit, commitCapture.operations)));
    runtime.pendingPatchOperations = retainedPending;
    const concurrentMutationCount = Math.max(0, failedMutationVersion - transactionMutationVersion);
    runtime.mutationVersion = beforeMutationVersion + concurrentMutationCount;
    runtime.persistedVersion = Math.min(
      runtime.mutationVersion,
      Math.max(beforePersistedVersion, runtime.persistedVersion),
    );
    // A failed local file replacement deliberately makes the process
    // read-only. A remote revision/unknown-outcome fence must also survive the
    // optimistic cache rollback; only a fully compensated definitive failure
    // can return to the pre-commit bookkeeping.
    if (backend.kind !== "file" && !runtime.reconciliationRequired) {
      runtime.lastFlushError = beforeLastFlushError;
      runtime.writable = beforeWritable;
    }
    if (
      runtime.writable
      && !runtime.reconciliationRequired
      && runtime.mutationVersion !== runtime.persistedVersion
      && (!backend.applyPatch || runtime.pendingPatchOperations.length > 0)
    ) {
      scheduleFlush(transaction.realmId, runtime);
    }
    throw error;
  } finally {
    commitCapture.recording = false;
    if (runtime.activeAtomicCommit === commitCapture) runtime.activeAtomicCommit = null;
  }
}

async function commitPortalStateMutationTransaction(
  transaction: PortalStateMutationTransaction,
): Promise<void> {
  const runtime = realmRuntime(transaction.realmId);
  // Different Supabase workspace keys may execute their domain work in
  // parallel, but they share one in-process cache. Serialize only the short
  // publish/flush phase so one tentative tree can never become another
  // transaction's base or overwrite its rollback view.
  const previous = runtime.atomicCommitTail;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  runtime.atomicCommitTail = tail;
  await previous.catch(() => undefined);
  try {
    await commitPortalStateMutationTransactionInLane(transaction, runtime);
  } finally {
    release();
  }
}

/**
 * Run one coordinated mutation against an isolated state tree and publish its
 * complete diff in one durable commit. A thrown operation is discarded before
 * it can reach the shared cache or backend. Nested coordinated domain calls
 * reuse the outer working tree and therefore commit as one unit.
 */
export async function withAtomicPortalStateMutation<T>(
  operation: () => T | Promise<T>,
  options: { beforeCommit?: () => void | Promise<void> } = {},
): Promise<T> {
  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);
  if (runtime.reconciliationRequired) throw runtime.reconciliationRequired;
  const inherited = portalStateMutationTransactions.getStore();
  if (inherited?.active) {
    if (inherited.realmId !== realmId) {
      throw new Error("portal_state_transaction_cannot_change_realm");
    }
    return operation();
  }

  if (!runtime.cache) runtime.cache = empty();
  const base = structuredClone(
    runtime.activeAtomicCommit?.recording
      ? runtime.activeAtomicCommit.committed
      : runtime.cache,
  );
  const transaction: PortalStateMutationTransaction = {
    active: true,
    realmId,
    base,
    working: structuredClone(base),
    beforeCommit: options.beforeCommit,
  };
  let result: T;
  try {
    result = await portalStateMutationTransactions.run(
      transaction,
      () => Promise.resolve(operation()),
    );
  } finally {
    // Async resources created by the operation retain this store. They must
    // never keep reading or mutating a working tree after its owner returned.
    transaction.active = false;
  }
  await commitPortalStateMutationTransaction(transaction);
  return result;
}

export function mutate(fn: (state: PortalState) => void): void {
  const realmId = getActiveDataRealmId();
  const runtime = realmRuntime(realmId);
  if (runtime.reconciliationRequired) throw runtime.reconciliationRequired;
  const transaction = portalStateMutationTransactions.getStore();
  if (transaction?.active && transaction.realmId === realmId) {
    fn(transaction.working);
    return;
  }
  if (!runtime.cache) runtime.cache = empty();
  const activeCommit = runtime.activeAtomicCommit;
  // Once an atomic commit starts flushing, unrelated mutations are evaluated
  // against the committed view, then replayed onto the tentative cache as a
  // patch. This keeps failed/tentative transaction state invisible without
  // running a caller's mutation callback twice (callbacks may allocate ids).
  const mutationTarget = activeCommit?.recording ? activeCommit.committed : runtime.cache;
  const before = backend.applyPatch || activeCommit?.recording
    ? structuredClone(mutationTarget)
    : null;
  fn(mutationTarget);
  if (before) {
    const operations = diffStorageValue(before, mutationTarget);
    if (operations.length === 0) return;
    if (activeCommit?.recording) {
      activeCommit.operations.push(...operations);
      runtime.cache = parseBlob(JSON.stringify(applyStoragePatch(runtime.cache, operations)));
    }
    if (backend.applyPatch) runtime.pendingPatchOperations.push(...operations);
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
  const transaction = portalStateMutationTransactions.getStore();
  if (transaction?.active) {
    await commitPortalStateMutationTransaction(transaction);
    return;
  }
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
  if (runtime.reconciliationRequired) throw runtime.reconciliationRequired;
  runtime.cache = empty();
  runtime.pendingPatchOperations = [];
  runtime.hydrated = true;
  runtime.mutationVersion += 1;
  await flushRealm(realmId, runtime, { throwOnError: true });
}

export function isPersistent(): boolean {
  const runtime = realmRuntime();
  return backend.persistent && runtime.writable && !runtime.reconciliationRequired;
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
    writable: runtime.writable && !runtime.reconciliationRequired,
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
    runtime.reconciliationRequired = null;
    runtime.reconciliationPlan = null;
    await flushRealm(valid, runtime, { throwOnError: true });
  });
}

/** Clone the complete current realm into an isolated target realm. */
export async function cloneCurrentDataRealm(targetRealmId: string): Promise<void> {
  await ensureHydrated({ fresh: true });
  await flushPendingWrites();
  await replaceDataRealmState(targetRealmId, structuredClone(getState()));
}
