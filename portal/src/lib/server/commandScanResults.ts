import "server-only";

import crypto from "node:crypto";

import type { BusinessIssueRadar } from "@/engines/data/radar/businessRadar";
import type { CommandIntelligenceSnapshot } from "@/lib/intelligence/commandIntelligence";
import { getActiveDataRealmId, getBackendInfo } from "@/server/storage";
import { normaliseDataRealmId } from "@/server/dataRealm";
import { getUserById } from "@/server/users";
import type { ServerUser, SessionPayload } from "@/server/types";

/** Long enough for a station walk; short enough that URLs do not become bookmarks. */
export const COMMAND_SCAN_RESULT_TTL_MS = 2 * 60 * 1_000;
const COMMAND_SCAN_RESULT_SCHEMA = 1;
const SIDECAR_PREFIX = "command-scan-result";

/** Every field is authority, not presentation. All five must still match. */
export interface CommandScanPrincipal {
  realmId: string;
  agencyId: string;
  userId: string;
  sessionRev: number;
  accessRev: number;
}

export interface CommandScanResult {
  schema: typeof COMMAND_SCAN_RESULT_SCHEMA;
  handle: string;
  principal: CommandScanPrincipal;
  createdAt: number;
  expiresAt: number;
  radar: BusinessIssueRadar;
  intelligence: CommandIntelligenceSnapshot;
}

/**
 * Supabase and Postgres each persist one JSON value at a stable hashed key;
 * local/test processes share the same semantics over a map. There is no global
 * capacity eviction: a principal owns exactly one bounded row and a new issue
 * overwrites the old row.
 */
export interface CommandScanResultStorage {
  load(storageKey: string, realmId: string): Promise<unknown | null>;
  save(storageKey: string, realmId: string, result: CommandScanResult): Promise<void>;
}

export interface CommandScanResultRepository {
  issue(input: {
    principal: CommandScanPrincipal;
    radar: BusinessIssueRadar;
    intelligence: CommandIntelligenceSnapshot;
    now?: number;
  }): Promise<CommandScanResult>;
  read(input: {
    handle: string | null | undefined;
    principal: CommandScanPrincipal;
    now?: number;
  }): Promise<CommandScanResult | null>;
}

export type CommandScanResultReadOutcome =
  | { status: "found"; result: CommandScanResult }
  | { status: "missing"; result: null }
  | { status: "unavailable"; result: null };

function exactRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("command_scan_revision_invalid");
  return value;
}

export function normalizeCommandScanPrincipal(principal: CommandScanPrincipal): CommandScanPrincipal {
  return {
    realmId: normaliseDataRealmId(principal.realmId),
    agencyId: principal.agencyId.trim(),
    userId: principal.userId.trim(),
    sessionRev: exactRevision(principal.sessionRev),
    accessRev: exactRevision(principal.accessRev),
  };
}

/** Build the binding from server-owned request/session state, never query input. */
export function commandScanPrincipalForSession(
  session: SessionPayload,
  agencyId = session.agencyId,
  authorityUser?: Pick<ServerUser, "sessionRev" | "accessRev"> | null,
): CommandScanPrincipal {
  const currentUser = authorityUser ?? getUserById(session.userId);
  return normalizeCommandScanPrincipal({
    realmId: getActiveDataRealmId(),
    agencyId,
    userId: session.userId,
    sessionRev: currentUser?.sessionRev ?? session.sessionRev ?? 0,
    accessRev: currentUser?.accessRev ?? session.accessRev ?? 0,
  });
}

/**
 * The key is stable across revision bumps so an identity still owns one row.
 * Revisions live inside the record and invalidate reads without accumulating
 * old rows. Raw ids never appear in the provider-visible key.
 */
export function commandScanResultStorageKey(principal: CommandScanPrincipal): string {
  const normalized = normalizeCommandScanPrincipal(principal);
  return crypto
    .createHash("sha256")
    .update([normalized.realmId, normalized.agencyId, normalized.userId].join("\u0000"))
    .digest("hex");
}

/** Accept only an opaque UUID emitted by this store; arbitrary query text is ignored. */
export function normalizeCommandScanResultHandle(
  value: string | string[] | null | undefined,
): string | null {
  const candidate = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function samePrincipal(left: CommandScanPrincipal, right: CommandScanPrincipal): boolean {
  return left.realmId === right.realmId
    && left.agencyId === right.agencyId
    && left.userId === right.userId
    && left.sessionRev === right.sessionRev
    && left.accessRev === right.accessRev;
}

function normalizeStoredResult(value: unknown): CommandScanResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CommandScanResult>;
  const handle = normalizeCommandScanResultHandle(row.handle);
  if (row.schema !== COMMAND_SCAN_RESULT_SCHEMA || !handle || !row.principal) return null;
  if (!Number.isFinite(row.createdAt) || !Number.isFinite(row.expiresAt)) return null;
  if (!row.radar || typeof row.radar !== "object" || !row.intelligence || typeof row.intelligence !== "object") return null;
  try {
    return {
      schema: COMMAND_SCAN_RESULT_SCHEMA,
      handle,
      principal: normalizeCommandScanPrincipal(row.principal),
      createdAt: Number(row.createdAt),
      expiresAt: Number(row.expiresAt),
      radar: row.radar,
      intelligence: row.intelligence,
    };
  } catch {
    return null;
  }
}

export function createCommandScanResultRepository(
  storage: CommandScanResultStorage,
  randomUUID: () => string = crypto.randomUUID,
): CommandScanResultRepository {
  return {
    async issue(input) {
      const principal = normalizeCommandScanPrincipal(input.principal);
      if (!principal.agencyId || !principal.userId) throw new Error("command_scan_principal_invalid");
      const now = input.now ?? Date.now();
      const handle = normalizeCommandScanResultHandle(randomUUID());
      if (!handle) throw new Error("command_scan_handle_invalid");
      const result: CommandScanResult = {
        schema: COMMAND_SCAN_RESULT_SCHEMA,
        handle,
        principal,
        createdAt: now,
        expiresAt: now + COMMAND_SCAN_RESULT_TTL_MS,
        radar: input.radar,
        intelligence: input.intelligence,
      };
      // Stable key + upsert invalidates the old handle without an insert-only
      // cache or a capacity-based eviction race.
      await storage.save(commandScanResultStorageKey(principal), principal.realmId, result);
      return result;
    },

    async read(input) {
      const handle = normalizeCommandScanResultHandle(input.handle);
      if (!handle) return null;
      const principal = normalizeCommandScanPrincipal(input.principal);
      if (!principal.agencyId || !principal.userId) return null;
      const raw = await storage.load(commandScanResultStorageKey(principal), principal.realmId);
      const result = normalizeStoredResult(raw);
      if (!result || result.handle !== handle) return null;
      if (!samePrincipal(result.principal, principal)) return null;
      if (result.expiresAt <= (input.now ?? Date.now())) return null;
      return result;
    },
  };
}

/** Test/local seam. Pass the same map to model two independent app instances. */
export function createMemoryCommandScanResultStorage(
  shared = new Map<string, CommandScanResult>(),
): CommandScanResultStorage {
  const key = (storageKey: string, realmId: string) => `${realmId}\u0000${storageKey}`;
  return {
    async load(storageKey, realmId) {
      const value = shared.get(key(storageKey, realmId));
      return value ? structuredClone(value) : null;
    },
    async save(storageKey, realmId, result) {
      shared.set(key(storageKey, realmId), structuredClone(result));
    },
  };
}

const globalWithCommandScanResults = globalThis as typeof globalThis & {
  __aquaCommandScanResults?: Map<string, CommandScanResult>;
};
const localRows = globalWithCommandScanResults.__aquaCommandScanResults ?? new Map<string, CommandScanResult>();
globalWithCommandScanResults.__aquaCommandScanResults = localRows;
const localStorage = createMemoryCommandScanResultStorage(localRows);

function sidecarSlug(storageKey: string): string {
  return `${SIDECAR_PREFIX}-${storageKey}`;
}

function parseStoredBlob(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Corrupt/partial provider state is a miss, never permission to execute a
    // replacement scan from a GET render.
    return null;
  }
}

const runtimeStorage: CommandScanResultStorage = {
  async load(storageKey, realmId) {
    const backend = getBackendInfo().kind;
    if (backend === "supabase") {
      const raw = await (await import("@/server/storageSupabase"))
        .loadSidecarBlob(sidecarSlug(storageKey), {}, realmId);
      return parseStoredBlob(raw);
    }
    if (backend === "postgres") {
      const raw = await (await import("@/server/storagePostgres"))
        .loadSidecarBlob(sidecarSlug(storageKey), realmId);
      return parseStoredBlob(raw);
    }
    return localStorage.load(storageKey, realmId);
  },
  async save(storageKey, realmId, result) {
    const backend = getBackendInfo().kind;
    const content = JSON.stringify(result);
    if (backend === "supabase") {
      await (await import("@/server/storageSupabase"))
        .saveSidecarBlob(sidecarSlug(storageKey), content, {}, realmId);
      return;
    }
    if (backend === "postgres") {
      await (await import("@/server/storagePostgres"))
        .saveSidecarBlob(sidecarSlug(storageKey), content, realmId);
      return;
    }
    await localStorage.save(storageKey, realmId, result);
  },
};

const runtimeRepository = createCommandScanResultRepository(runtimeStorage);

export function issueCommandScanResult(input: {
  principal: CommandScanPrincipal;
  radar: BusinessIssueRadar;
  intelligence: CommandIntelligenceSnapshot;
  now?: number;
}): Promise<CommandScanResult> {
  return runtimeRepository.issue(input);
}

/** A miss is an honest paused state; it never falls through to running a scan. */
export function readCommandScanResult(input: {
  handle: string | null | undefined;
  principal: CommandScanPrincipal;
  now?: number;
}): Promise<CommandScanResult | null> {
  return runtimeRepository.read(input);
}

/**
 * An optional continuation-store outage must not take down the Command Centre.
 * It is distinct from a genuine miss so the UI can say "unavailable" rather
 * than claiming the handle expired. Neither outcome is permission to run work
 * from a GET render.
 */
export async function readCommandScanResultOutcome(
  input: {
    handle: string | null | undefined;
    principal: CommandScanPrincipal;
    now?: number;
  },
  options: {
    repository?: CommandScanResultRepository;
    onUnavailable?: (error: unknown) => void;
  } = {},
): Promise<CommandScanResultReadOutcome> {
  try {
    const result = await (options.repository ?? runtimeRepository).read(input);
    return result
      ? { status: "found", result }
      : { status: "missing", result: null };
  } catch (error) {
    (options.onUnavailable ?? (failure => {
      console.warn(
        "[command-scan] result provider unavailable; keeping the page paused:",
        failure instanceof Error ? failure.message : failure,
      );
    }))(error);
    return { status: "unavailable", result: null };
  }
}

/** Local/test isolation only. Remote rows are one-per-principal and overwrite. */
export function clearCommandScanResultsForTests() {
  localRows.clear();
}
