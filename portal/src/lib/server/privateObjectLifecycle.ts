import "server-only";

import { createHash } from "node:crypto";

import {
  deletePrivateUpload,
  type PrivateUploadDeleteProviders,
  type StoredPrivateUpload,
} from "@/lib/server/privateUploadStorage";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { flushPendingWrites, getState, mutate } from "@/server/storage";
import type { PortalState, PrivateObjectLifecycle } from "@/server/types";

const STAGED_LEASE_MS = 24 * 60 * 60_000;
const READY_CHECKPOINT_MS = 7 * 24 * 60 * 60_000;
const DELETE_RECOVERY_MS = 365 * 24 * 60 * 60_000;

export class PrivateObjectLifecycleConflictError extends Error {
  readonly code = "private_object_request_conflict";
  constructor() {
    super("This operation key was already used for different file intent.");
    this.name = "PrivateObjectLifecycleConflictError";
  }
}

export class PrivateObjectLifecycleClaimError extends Error {
  readonly code = "private_upload_claim_unavailable";
  constructor(message = "One or more uploads are no longer available to attach. Upload them again.") {
    super(message);
    this.name = "PrivateObjectLifecycleClaimError";
  }
}

export function privateObjectLifecycleLockKey(agencyId: string): string {
  return `private-object-lifecycle:${agencyId}`;
}

function lifecycleId(operation: "stage" | "delete", agencyId: string, purpose: string, objectId: string): string {
  return `${operation}:${agencyId}:${purpose}:${objectId}`;
}

export function privateObjectRequestHash(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function assertMatching(existing: PrivateObjectLifecycle, requestHash: string): void {
  if (existing.requestHash !== requestHash) throw new PrivateObjectLifecycleConflictError();
}

export interface BeginStagedPrivateUploadInput {
  agencyId: string;
  purpose: string;
  objectId: string;
  requestHash: string;
  planned: StoredPrivateUpload;
  localDirectory: string;
  now?: number;
  leaseMs?: number;
}

/** Persist the cleanup handle before the provider sees any bytes. */
export async function beginStagedPrivateUpload(input: BeginStagedPrivateUploadInput): Promise<PrivateObjectLifecycle> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(input.agencyId), async () => {
    const id = lifecycleId("stage", input.agencyId, input.purpose, input.objectId);
    const existing = getState().privateObjectLifecycles[id];
    if (existing) {
      assertMatching(existing, input.requestHash);
      return existing;
    }
    const now = input.now ?? Date.now();
    const record: PrivateObjectLifecycle = {
      id,
      agencyId: input.agencyId,
      operation: "stage",
      purpose: input.purpose,
      objectId: input.objectId,
      requestHash: input.requestHash,
      state: "uploading",
      storageProvider: input.planned.storageProvider,
      storageKey: input.planned.storageKey,
      localDirectory: input.localDirectory,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + (input.leaseMs ?? STAGED_LEASE_MS),
    };
    mutate(state => { state.privateObjectLifecycles[id] = record; });
    return record;
  });
}

/** Replace the predicted deletion key with the provider's exact returned key. */
export async function confirmStagedPrivateUpload(input: {
  agencyId: string;
  purpose: string;
  objectId: string;
  requestHash: string;
  stored: StoredPrivateUpload;
  now?: number;
}): Promise<PrivateObjectLifecycle> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(input.agencyId), () => {
    const id = lifecycleId("stage", input.agencyId, input.purpose, input.objectId);
    const existing = getState().privateObjectLifecycles[id];
    if (!existing) throw new Error("private_upload_lifecycle_missing");
    assertMatching(existing, input.requestHash);
    const updated: PrivateObjectLifecycle = {
      ...existing,
      storageProvider: input.stored.storageProvider,
      storageKey: input.stored.storageKey,
      updatedAt: input.now ?? Date.now(),
    };
    mutate(state => { state.privateObjectLifecycles[id] = updated; });
    return updated;
  });
}

/** Mutating core used only while the caller already owns the lifecycle lock. */
function markStagedPrivateUploadsReadyUnlocked(input: {
  agencyId: string;
  purpose: string;
  objectIds?: readonly string[];
  storageKeys?: readonly string[];
  ownerId: string;
  now?: number;
}): number {
  const ids = new Set(input.objectIds ?? []);
  const keys = new Set((input.storageKeys ?? []).filter(Boolean));
  const now = input.now ?? Date.now();
  let changed = 0;
  mutate(state => {
    for (const [id, record] of Object.entries(state.privateObjectLifecycles)) {
      if (record.operation !== "stage" || record.agencyId !== input.agencyId || record.purpose !== input.purpose) continue;
      if (!ids.has(record.objectId) && !keys.has(record.storageKey)) continue;
      state.privateObjectLifecycles[id] = {
        ...record,
        state: "ready",
        ownerId: input.ownerId,
        error: undefined,
        updatedAt: now,
        expiresAt: now + READY_CHECKPOINT_MS,
      };
      changed += 1;
    }
  });
  return changed;
}

/**
 * Finalise a claimed object while holding the same lifecycle lock as the
 * sweeper. A finaliser can therefore never race a provider delete.
 */
export async function markStagedPrivateUploadsReady(input: {
  agencyId: string;
  purpose: string;
  objectIds?: readonly string[];
  storageKeys?: readonly string[];
  ownerId: string;
  now?: number;
}): Promise<number> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(input.agencyId), () =>
    markStagedPrivateUploadsReadyUnlocked(input));
}

/**
 * Claim every selected staged upload before committing its durable owner.
 * Missing or in-flight sweep records fail the owner operation atomically;
 * callers must not persist a reference after this throws.
 */
export async function claimStagedPrivateUploadsForOwnership(input: {
  agencyId: string;
  purpose: string;
  objectIds?: readonly string[];
  storageKeys?: readonly string[];
  now?: number;
  leaseMs?: number;
}): Promise<number> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(input.agencyId), () => {
    const wantedIds = new Set((input.objectIds ?? []).filter(Boolean));
    const wantedKeys = new Set((input.storageKeys ?? []).filter(Boolean));
    if (!wantedIds.size && !wantedKeys.size) return 0;
    const now = input.now ?? Date.now();
    const matches = Object.values(getState().privateObjectLifecycles).filter(record =>
      record.operation === "stage"
      && record.agencyId === input.agencyId
      && record.purpose === input.purpose
      && (wantedIds.has(record.objectId) || wantedKeys.has(record.storageKey)));
    const matchedIds = new Set(matches.map(record => record.objectId));
    const matchedKeys = new Set(matches.map(record => record.storageKey));
    if ([...wantedIds].some(id => !matchedIds.has(id)) || [...wantedKeys].some(key => !matchedKeys.has(key))) {
      throw new PrivateObjectLifecycleClaimError();
    }
    if (matches.some(record => record.state === "sweeping" || record.state === "delete-failed" || record.state === "deleting")) {
      throw new PrivateObjectLifecycleClaimError();
    }
    const matchIds = new Set(matches.map(record => record.id));
    mutate(state => {
      for (const [id, record] of Object.entries(state.privateObjectLifecycles)) {
        if (!matchIds.has(id) || record.state === "ready") continue;
        state.privateObjectLifecycles[id] = {
          ...record,
          state: "claiming",
          error: undefined,
          updatedAt: now,
          expiresAt: now + (input.leaseMs ?? STAGED_LEASE_MS),
        };
      }
    });
    return matches.length;
  });
}

/**
 * Run the durable owner mutation and readiness transition inside the lifecycle
 * lane. This is especially important for PortalState-backed plugin owners: a
 * second fresh transaction after their unflushed mutation would otherwise
 * reload the old snapshot and erase the new owner.
 */
export async function commitStagedPrivateUploadOwnership<T>(input: {
  agencyId: string;
  purpose: string;
  objectIds?: readonly string[];
  storageKeys?: readonly string[];
  commit: () => Promise<{ ownerId: string; value: T }>;
  now?: number;
}): Promise<T> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(input.agencyId), async () => {
    const wantedIds = new Set((input.objectIds ?? []).filter(Boolean));
    const wantedKeys = new Set((input.storageKeys ?? []).filter(Boolean));
    if (!wantedIds.size && !wantedKeys.size) throw new PrivateObjectLifecycleClaimError();
    const matches = Object.values(getState().privateObjectLifecycles).filter(record =>
      record.operation === "stage"
      && record.agencyId === input.agencyId
      && record.purpose === input.purpose
      && (wantedIds.has(record.objectId) || wantedKeys.has(record.storageKey)));
    const matchedIds = new Set(matches.map(record => record.objectId));
    const matchedKeys = new Set(matches.map(record => record.storageKey));
    if ([...wantedIds].some(id => !matchedIds.has(id))
      || [...wantedKeys].some(key => !matchedKeys.has(key))
      || matches.some(record => record.state !== "claiming" && record.state !== "ready")) {
      throw new PrivateObjectLifecycleClaimError();
    }
    const committed = await input.commit();
    markStagedPrivateUploadsReadyUnlocked({
      agencyId: input.agencyId,
      purpose: input.purpose,
      objectIds: input.objectIds,
      storageKeys: input.storageKeys,
      ownerId: committed.ownerId,
      now: input.now,
    });
    return committed.value;
  });
}

export interface PreparedPrivateObjectDeletion<T> {
  snapshot: T;
  storageProvider?: string | null;
  storageKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DeletePrivateObjectWithRecoveryInput<T> {
  agencyId: string;
  purpose: string;
  objectId: string;
  requestHash: string;
  localDirectory: string;
  /** Runs inside the same atomic state mutation that writes the checkpoint. */
  prepare(state: PortalState): PreparedPrivateObjectDeletion<T>;
  providers?: PrivateUploadDeleteProviders;
  /** Strip secrets/content before the durable recovery checkpoint is written. */
  checkpointSnapshot?: (snapshot: T) => unknown;
  /** Minimise a completed replay tombstone. */
  completedSnapshot?: (snapshot: T) => unknown;
  /** Fault seam for crash-after-checkpoint tests. */
  afterCheckpoint?: () => void | Promise<void>;
  now?: () => number;
}

export type DeletePrivateObjectWithRecoveryResult<T> =
  | { ok: true; snapshot: T; metadata?: Record<string, unknown>; replayed: boolean }
  | { ok: false; snapshot: T; metadata?: Record<string, unknown>; error: string };

/**
 * Durable two-phase owner deletion. The checkpoint and owner mutation are one
 * state edit; provider success is idempotently replayed; the checkpoint is
 * removed only after both halves have converged.
 */
export async function deletePrivateObjectWithRecovery<T>(input: DeletePrivateObjectWithRecoveryInput<T>): Promise<DeletePrivateObjectWithRecoveryResult<T>> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(input.agencyId), async () => {
    const id = lifecycleId("delete", input.agencyId, input.purpose, input.objectId);
    let record = getState().privateObjectLifecycles[id];
    let activeSnapshot: T | undefined;
    if (record) {
      assertMatching(record, input.requestHash);
      if (record.state === "ready") {
        return { ok: true, snapshot: record.ownerSnapshot as T, metadata: record.metadata, replayed: true };
      }
    } else {
      const now = input.now?.() ?? Date.now();
      let prepared: PreparedPrivateObjectDeletion<T> | undefined;
      mutate(state => {
        prepared = input.prepare(state);
        activeSnapshot = prepared.snapshot;
        const provider = (prepared.storageProvider ?? "local") as PrivateObjectLifecycle["storageProvider"];
        state.privateObjectLifecycles[id] = {
          id,
          agencyId: input.agencyId,
          operation: "delete",
          purpose: input.purpose,
          objectId: input.objectId,
          requestHash: input.requestHash,
          state: "deleting",
          storageProvider: provider,
          storageKey: prepared.storageKey?.trim() ?? "",
          localDirectory: input.localDirectory,
          ownerSnapshot: input.checkpointSnapshot ? input.checkpointSnapshot(prepared.snapshot) : prepared.snapshot,
          metadata: prepared.metadata,
          createdAt: now,
          updatedAt: now,
          expiresAt: now + DELETE_RECOVERY_MS,
        };
      });
      record = getState().privateObjectLifecycles[id];
      // This is the recovery point. A process dying after it can always find
      // the exact owner snapshot and provider key on retry.
      await flushPendingWrites();
      await input.afterCheckpoint?.();
    }
    if (!record) throw new Error("private_object_delete_checkpoint_missing");
    const snapshot = activeSnapshot ?? record.ownerSnapshot as T;
    const removal = await deletePrivateUpload({
      storageProvider: record.storageProvider,
      storageKey: record.storageKey,
      localDirectory: record.localDirectory,
    }, input.providers);
    if (!removal.ok) {
      const now = input.now?.() ?? Date.now();
      mutate(state => {
        const latest = state.privateObjectLifecycles[id];
        if (!latest || latest.requestHash !== input.requestHash) return;
        state.privateObjectLifecycles[id] = {
          ...latest,
          state: "delete-failed",
          error: removal.error ?? "Storage provider refused deletion.",
          updatedAt: now,
        };
      });
      return { ok: false, snapshot, metadata: record.metadata, error: removal.error ?? "Storage provider refused deletion." };
    }
    const completedAt = input.now?.() ?? Date.now();
    mutate(state => {
      const latest = state.privateObjectLifecycles[id];
      if (!latest || latest.requestHash !== input.requestHash) return;
      state.privateObjectLifecycles[id] = {
        ...latest,
        state: "ready",
        ownerSnapshot: input.completedSnapshot ? input.completedSnapshot(snapshot) : latest.ownerSnapshot,
        error: undefined,
        updatedAt: completedAt,
        expiresAt: completedAt + READY_CHECKPOINT_MS,
      };
    });
    return { ok: true, snapshot, metadata: record.metadata, replayed: false };
  });
}

export function pendingPrivateObjectDeletion<T>(agencyId: string, purpose: string, objectId: string): { snapshot: T; record: PrivateObjectLifecycle } | null {
  const record = getState().privateObjectLifecycles[lifecycleId("delete", agencyId, purpose, objectId)];
  if (!record || record.operation !== "delete" || record.state === "ready") return null;
  return { snapshot: record.ownerSnapshot as T, record };
}

/** Includes a completed replay checkpoint; delete commands use this, readers do not. */
export function privateObjectDeletionCheckpoint<T>(agencyId: string, purpose: string, objectId: string): { snapshot: T; record: PrivateObjectLifecycle } | null {
  const record = getState().privateObjectLifecycles[lifecycleId("delete", agencyId, purpose, objectId)];
  if (!record || record.operation !== "delete") return null;
  return { snapshot: record.ownerSnapshot as T, record };
}

export function pendingPrivateObjectDeletionSnapshots<T>(agencyId: string, purpose: string): Array<{ snapshot: T; record: PrivateObjectLifecycle }> {
  return Object.values(getState().privateObjectLifecycles)
    .filter(record => record.operation === "delete" && record.state !== "ready" && record.agencyId === agencyId && record.purpose === purpose)
    .map(record => ({ snapshot: record.ownerSnapshot as T, record }));
}

function valueReferencesStorageKey(value: unknown, storageKey: string, seen = new Set<object>()): boolean {
  if (value === storageKey) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => valueReferencesStorageKey(item, storageKey, seen));
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => key !== "privateObjectLifecycles" && valueReferencesStorageKey(child, storageKey, seen));
}

export interface PrivateObjectLifecycleSweepResult {
  cleaned: number;
  failed: number;
  recoveredReady: number;
  retainedClaims: number;
  prunedReady: number;
}

/** Delete expired unowned objects; never delete a key a durable owner now cites. */
export async function processPrivateObjectLifecycleSweep(options: {
  now?: number;
  providers?: PrivateUploadDeleteProviders;
} = {}): Promise<PrivateObjectLifecycleSweepResult> {
  const now = options.now ?? Date.now();
  const agencies = Array.from(new Set(Object.values(getState().privateObjectLifecycles).map(record => record.agencyId)));
  const totals: PrivateObjectLifecycleSweepResult = { cleaned: 0, failed: 0, recoveredReady: 0, retainedClaims: 0, prunedReady: 0 };
  for (const agencyId of agencies) {
    await withPortalStateTransaction(privateObjectLifecycleLockKey(agencyId), async () => {
      mutate(state => {
        for (const [id, record] of Object.entries(state.privateObjectLifecycles)) {
          if (record.agencyId === agencyId && record.operation === "delete" && record.state === "ready" && record.expiresAt <= now) {
            delete state.privateObjectLifecycles[id];
            totals.prunedReady += 1;
          }
        }
      });
      const candidates = Object.values(getState().privateObjectLifecycles)
        .filter(record => record.operation === "stage" && record.agencyId === agencyId && record.expiresAt <= now);
      for (const candidate of candidates) {
        const latest = getState().privateObjectLifecycles[candidate.id];
        if (!latest || latest.expiresAt > now) continue;
        if (latest.state === "ready") {
          mutate(state => { delete state.privateObjectLifecycles[latest.id]; });
          totals.prunedReady += 1;
          continue;
        }
        if (valueReferencesStorageKey(
          Object.fromEntries(Object.entries(getState()).filter(([key]) => key !== "privateObjectLifecycles")),
          latest.storageKey,
        )) {
          markStagedPrivateUploadsReadyUnlocked({ agencyId, purpose: latest.purpose, objectIds: [latest.objectId], ownerId: "recovered-owner", now });
          totals.recoveredReady += 1;
          continue;
        }
        // A claim is a durable hand-off checkpoint written before an inbox,
        // enquiry, expense, campaign, or client-request owner commit. Cross-
        // store owners cannot all be discovered by scanning PortalState, so an
        // expired claim is retained for safe recovery rather than guessed away.
        if (latest.state === "claiming") {
          mutate(state => {
            const current = state.privateObjectLifecycles[latest.id];
            if (!current || current.state !== "claiming") return;
            state.privateObjectLifecycles[latest.id] = {
              ...current,
              error: "Ownership finalisation requires recovery; storage was retained.",
              updatedAt: now,
              expiresAt: now + STAGED_LEASE_MS,
            };
          });
          totals.retainedClaims += 1;
          continue;
        }
        if (latest.state !== "uploading" && latest.state !== "delete-failed" && latest.state !== "sweeping") continue;
        const sweepIdentity = `${latest.requestHash}:${latest.storageProvider}:${latest.storageKey}`;
        mutate(state => {
          const current = state.privateObjectLifecycles[latest.id];
          if (!current || current.requestHash !== latest.requestHash) return;
          state.privateObjectLifecycles[latest.id] = {
            ...current,
            state: "sweeping",
            error: undefined,
            updatedAt: now,
          };
        });
        // Persist the destructive claim before provider I/O. A process restart
        // may safely retry an idempotent provider delete, while owner adoption
        // refuses a `sweeping` record.
        await flushPendingWrites();
        const removal = await deletePrivateUpload({
          storageProvider: latest.storageProvider,
          storageKey: latest.storageKey,
          localDirectory: latest.localDirectory,
        }, options.providers);
        const afterIo = getState().privateObjectLifecycles[latest.id];
        const unchanged = afterIo
          && afterIo.state === "sweeping"
          && `${afterIo.requestHash}:${afterIo.storageProvider}:${afterIo.storageKey}` === sweepIdentity;
        if (!unchanged) {
          // Preserve the newest checkpoint. All supported finalisers use this
          // lock, so this is a defence against an unexpected direct mutation.
          totals.failed += 1;
          continue;
        }
        if (removal.ok) {
          mutate(state => {
            const current = state.privateObjectLifecycles[latest.id];
            if (current?.state === "sweeping" && `${current.requestHash}:${current.storageProvider}:${current.storageKey}` === sweepIdentity) {
              delete state.privateObjectLifecycles[latest.id];
            }
          });
          totals.cleaned += 1;
        } else {
          mutate(state => {
            const current = state.privateObjectLifecycles[latest.id];
            if (!current) return;
            state.privateObjectLifecycles[latest.id] = {
              ...current,
              state: "delete-failed",
              error: removal.error ?? "Storage provider refused deletion.",
              updatedAt: now,
              expiresAt: now + STAGED_LEASE_MS,
            };
          });
          totals.failed += 1;
        }
      }
    });
  }
  return totals;
}
