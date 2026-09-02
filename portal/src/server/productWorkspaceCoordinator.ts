import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

import { withDevFileTransaction } from "@/lib/server/dev/devFileTransaction";
import {
  ensureHydrated,
  getActiveDataRealmId,
  getBackendInfo,
  getFileBackendDataPath,
  withAtomicPortalStateMutation,
} from "./storage";

const LEASE_MS = 60_000;
const LEASE_REFRESH_MS = process.env.NODE_ENV === "test"
  ? Math.max(1, Number(process.env.AQUA_PRODUCT_WORKSPACE_LEASE_REFRESH_MS) || 20_000)
  : 20_000;
const LEASE_COMMIT_MIN_REMAINING_MS = 30_000;
const WAIT_MS = 10_000;

interface RemoteLease {
  state: "claimed" | "held";
  leaseExpiresAt: number;
}

interface RemoteLockScope {
  active: boolean;
  leaseExpiresAt: number;
  lostError: ProductWorkspaceLeaseLostError | null;
  pending: Set<Promise<unknown>>;
  renewForBoundary: () => Promise<void>;
}

const heldRemoteLocks = new AsyncLocalStorage<ReadonlyMap<string, RemoteLockScope>>();

interface PortalStateCommitScope {
  active: boolean;
  postCommit: Array<() => void | Promise<void>>;
  postCommitKeys: Set<string>;
  pendingTransactions: Set<Promise<unknown>>;
}

const portalStateCommitScopes = new AsyncLocalStorage<PortalStateCommitScope>();

/**
 * Queue an in-process effect until the surrounding durable state commit wins.
 * A key makes repeated scheduling inside one transaction idempotent; distinct
 * unkeyed domain events deliberately retain their original one-call/one-effect
 * behaviour.
 */
export function deferUntilPortalStateCommit(
  effect: () => void | Promise<void>,
  key?: string,
): boolean {
  const scope = portalStateCommitScopes.getStore();
  if (!scope?.active) return false;
  if (key && scope.postCommitKeys.has(key)) return true;
  if (key) scope.postCommitKeys.add(key);
  scope.postCommit.push(effect);
  return true;
}

export class ProductWorkspaceBusyError extends Error {
  constructor() {
    super("This workspace is being updated in another session. Try again in a moment.");
    this.name = "ProductWorkspaceBusyError";
  }
}

export class ProductWorkspaceLeaseLostError extends Error {
  constructor(message = "This workspace changed ownership before the update could commit. Retry the operation.") {
    super(message);
    this.name = "ProductWorkspaceLeaseLostError";
  }
}

function workspaceKey(input: { agencyId: string; clientId: string; productId: string }): string {
  return crypto
    .createHash("sha256")
    .update([input.agencyId, input.clientId, input.productId].join("\u0000"))
    .digest("hex");
}

function holderId(): string {
  return `product-workspace:${process.pid}:${crypto.randomUUID()}`;
}

function normaliseRemoteLease(value: unknown): RemoteLease {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const state = row.state;
  const leaseExpiresAt = Number(row.leaseExpiresAt);
  if ((state !== "claimed" && state !== "held") || !Number.isFinite(leaseExpiresAt)) {
    throw new Error("product_workspace_lease_invalid");
  }
  return { state, leaseExpiresAt };
}

const memoryTails = new Map<string, Promise<void>>();
interface MemoryLockScope {
  active: boolean;
  pending: Set<Promise<unknown>>;
}
const heldMemoryLocks = new AsyncLocalStorage<ReadonlyMap<string, MemoryLockScope>>();

async function withMemoryLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const held = heldMemoryLocks.getStore();
  const inheritedScope = held?.get(key);
  if (inheritedScope?.active) {
    const nested = Promise.resolve().then(operation);
    inheritedScope.pending.add(nested);
    void nested.then(
      () => { inheritedScope.pending.delete(nested); },
      () => { inheritedScope.pending.delete(nested); },
    );
    return nested;
  }
  const previous = memoryTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  memoryTails.set(key, tail);
  await previous.catch(() => undefined);
  const scope: MemoryLockScope = { active: true, pending: new Set() };
  try {
    const nextHeld = new Map(held);
    nextHeld.set(key, scope);
    return await heldMemoryLocks.run(nextHeld, operation);
  } finally {
    while (scope.pending.size) {
      await Promise.allSettled([...scope.pending]);
    }
    scope.active = false;
    release();
    if (memoryTails.get(key) === tail) memoryTails.delete(key);
  }
}

function markRemoteLeaseLost(scope: RemoteLockScope, reason: string, cause?: unknown): ProductWorkspaceLeaseLostError {
  if (scope.lostError) return scope.lostError;
  const error = new ProductWorkspaceLeaseLostError(reason);
  if (cause !== undefined) Object.defineProperty(error, "cause", { value: cause });
  scope.lostError = error;
  return error;
}

function assertRemoteLeaseScope(scope: RemoteLockScope): void {
  if (scope.lostError) throw scope.lostError;
  if (Date.now() >= scope.leaseExpiresAt) {
    throw markRemoteLeaseLost(
      scope,
      "This workspace lease expired before the update could commit. Retry the operation.",
    );
  }
}

function activeRemoteLeaseScopes(): RemoteLockScope[] {
  return [...new Set(
    [...(heldRemoteLocks.getStore()?.values() ?? [])].filter(scope => scope.active),
  )];
}

async function ensureActiveRemoteLeasesForBoundary(): Promise<void> {
  for (const scope of activeRemoteLeaseScopes()) {
    assertRemoteLeaseScope(scope);
    await scope.renewForBoundary();
    assertRemoteLeaseScope(scope);
  }
}

function assertActiveRemoteLeasesHeld(): void {
  for (const scope of activeRemoteLeaseScopes()) assertRemoteLeaseScope(scope);
}

async function withRemoteLock<T>(
  backend: "supabase" | "postgres",
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const realmId = getActiveDataRealmId();
  const lockIdentity = JSON.stringify([backend, realmId, key]);
  const inheritedLocks = heldRemoteLocks.getStore();
  const inheritedScope = inheritedLocks?.get(lockIdentity);
  // PortalState transactions legitimately compose. In particular, a private
  // object lifecycle transaction can call a client metadata transaction while
  // the generic Postgres backend maps both logical lanes onto its one whole-
  // blob lock. Only the active lock-owning async call chain may bypass the
  // second acquisition; unrelated requests still acquire the durable lease.
  if (inheritedScope?.active) {
    assertRemoteLeaseScope(inheritedScope);
    const nested = Promise.resolve().then(operation);
    inheritedScope.pending.add(nested);
    void nested.then(
      () => { inheritedScope.pending.delete(nested); },
      () => { inheritedScope.pending.delete(nested); },
    );
    return nested;
  }

  const holder = holderId();
  const deadline = Date.now() + WAIT_MS;
  let delayMs = 30;
  const claim = () => backend === "supabase"
    ? import("./storageSupabase").then(module => module.claimProductWorkspaceLease(key, holder, LEASE_MS, {}, realmId))
    : import("./storagePostgres").then(module => module.claimProductWorkspaceLease(key, holder, LEASE_MS, realmId));
  const renew = () => backend === "supabase"
    ? import("./storageSupabase").then(module => module.renewProductWorkspaceLease(key, holder, LEASE_MS, {}, realmId))
    : import("./storagePostgres").then(module => module.renewProductWorkspaceLease(key, holder, LEASE_MS, realmId));
  let claimedLease: RemoteLease;
  for (;;) {
    const rawLease = await claim();
    const lease = normaliseRemoteLease(rawLease);
    if (lease.state === "claimed") {
      claimedLease = lease;
      break;
    }
    if (Date.now() >= deadline) throw new ProductWorkspaceBusyError();
    await new Promise(resolve => setTimeout(resolve, delayMs));
    delayMs = Math.min(250, Math.round(delayMs * 1.5));
  }

  // Provider calls may legitimately take longer than the database function's
  // 60-second maximum lease. Renew while the event loop is waiting on that I/O
  // so another server cannot enter the same client lane halfway through.
  let stopped = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshInFlight: Promise<void> = Promise.resolve();
  let renewalTail: Promise<void> = Promise.resolve();
  const scope: RemoteLockScope = {
    active: true,
    leaseExpiresAt: claimedLease.leaseExpiresAt,
    lostError: null,
    pending: new Set(),
    renewForBoundary: async () => undefined,
  };

  const refreshLease = async (requiredForBoundary: boolean): Promise<void> => {
    if (stopped || !scope.active) return;
    assertRemoteLeaseScope(scope);
    // A normal claim leaves ample time for the commit. Avoid an extra RPC on
    // every short transaction, but synchronously renew when a long provider
    // call has consumed nearly all of the lease.
    if (requiredForBoundary && scope.leaseExpiresAt - Date.now() >= LEASE_COMMIT_MIN_REMAINING_MS) return;
    try {
      // Renewal must never use the acquisition RPC. A delayed heartbeat can
      // arrive after this holder's lease expired and after a successor acquired
      // and released the row; reacquiring here would hide that ownership gap and
      // allow a stale working tree to commit (the classic lease ABA race).
      const lease = normaliseRemoteLease(await renew());
      if (lease.state !== "claimed") {
        throw markRemoteLeaseLost(
          scope,
          "This workspace lease was acquired by another process before the update could commit. Retry the operation.",
        );
      }
      if (lease.leaseExpiresAt <= Date.now()) {
        throw markRemoteLeaseLost(
          scope,
          "This workspace lease renewal was already expired. Retry the operation.",
        );
      }
      scope.leaseExpiresAt = lease.leaseExpiresAt;
    } catch (error) {
      if (error instanceof ProductWorkspaceLeaseLostError) throw error;
      if (requiredForBoundary || Date.now() >= scope.leaseExpiresAt) {
        throw markRemoteLeaseLost(
          scope,
          "This workspace lease could not be confirmed before the update could commit. Retry the operation.",
          error,
        );
      }
      console.warn("[product-workspace] durable lease refresh failed:", error instanceof Error ? error.message : error);
    }
  };
  const queueRefresh = (requiredForBoundary: boolean): Promise<void> => {
    const refresh = renewalTail.catch(() => undefined).then(() => refreshLease(requiredForBoundary));
    renewalTail = refresh.then(() => undefined, () => undefined);
    return refresh;
  };
  scope.renewForBoundary = () => queueRefresh(true);
  const scheduleRefresh = () => {
    refreshTimer = setTimeout(() => {
      refreshInFlight = queueRefresh(false).finally(() => {
        if (!stopped && !scope.lostError) scheduleRefresh();
      });
      // The owner observes the rejection at the commit/return fence. Attach an
      // immediate observer so a lost heartbeat cannot become an unhandled one.
      void refreshInFlight.catch(() => undefined);
    }, LEASE_REFRESH_MS);
  };
  scheduleRefresh();

  const nextHeldLocks = new Map(inheritedLocks);
  nextHeldLocks.set(lockIdentity, scope);
  try {
    const result = await heldRemoteLocks.run(nextHeldLocks, operation);
    assertRemoteLeaseScope(scope);
    return result;
  } finally {
    // AsyncLocalStorage is also inherited by work that escaped without being
    // awaited. Drain any reentrant work that started while this lease was
    // active, then invalidate the scope before releasing so later work cannot
    // mistake a stale context for ownership of this lease.
    while (scope.pending.size) {
      await Promise.allSettled([...scope.pending]);
    }
    scope.active = false;
    stopped = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    await refreshInFlight.catch(() => undefined);
    // Once the lease is lost or locally expired, this holder no longer owns
    // anything to release. The database release RPC is holder-checked too, but
    // skipping it makes that ownership rule explicit and avoids ambiguous logs.
    if (!scope.lostError && Date.now() < scope.leaseExpiresAt) {
      try {
        if (backend === "supabase") {
          await (await import("./storageSupabase")).releaseProductWorkspaceLease(key, holder, {}, realmId);
        } else {
          await (await import("./storagePostgres")).releaseProductWorkspaceLease(key, holder, realmId);
        }
      } catch (error) {
        // The bounded lease will self-release. Do not turn a committed workspace
        // mutation into an ambiguous client failure solely because unlock failed.
        console.warn("[product-workspace] durable lease release failed:", error instanceof Error ? error.message : error);
      }
    }
  }
}

/**
 * Serialize one client/product mutation across browser tabs and server
 * processes, reload the durable state while holding that lock, then flush the
 * complete cross-model change before releasing it.
 */
export function withProductWorkspaceTransaction<T>(
  input: { agencyId: string; clientId: string; productId: string },
  operation: () => T | Promise<T>,
): Promise<T> {
  return withPortalStateTransaction(workspaceKey(input), operation);
}

/**
 * Serialize one logical PortalState mutation across processes. The key may be
 * narrower on patch-based Supabase storage, while whole-blob file/Postgres
 * backends deliberately share one lock so a refreshed snapshot cannot replace
 * an unrelated concurrent write.
 */
export function withPortalStateTransaction<T>(
  key: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const run = async () => {
    // Nested domain transactions share the outer isolated working tree and its
    // post-commit queue. Refreshing or flushing in the middle would publish a
    // partial outer mutation.
    if (portalStateCommitScopes.getStore()?.active) return operation();
    await ensureHydrated({ fresh: true });
    const scope: PortalStateCommitScope = {
      active: true,
      postCommit: [],
      postCommitKeys: new Set(),
      pendingTransactions: new Set(),
    };
    let result: T;
    try {
      result = await portalStateCommitScopes.run(
        scope,
        () => withAtomicPortalStateMutation(async () => {
          try {
            const value = await operation();
            // A domain method can accidentally start a nested transaction without
            // awaiting it. Keep its state work inside the same atomic commit and
            // turn a nested failure into an outer rollback rather than committing
            // whatever happened before the rejection.
            while (scope.pendingTransactions.size > 0) {
              const pending = [...scope.pendingTransactions];
              scope.pendingTransactions.clear();
              await Promise.all(pending);
            }
            return value;
          } finally {
            // Timers and other escaped resources retain AsyncLocalStorage after
            // this callback returns. Fence them before durable commit begins.
            scope.active = false;
          }
        }, { beforeCommit: ensureActiveRemoteLeasesForBoundary }),
      );
    } finally {
      scope.active = false;
    }
    // State is durable at this point. Effects deliberately start afterwards so
    // a rejected/failed commit cannot trigger subscribers or automation.
    for (const effect of scope.postCommit) {
      await ensureActiveRemoteLeasesForBoundary();
      try {
        await effect();
      } catch (error) {
        console.error(
          "[portal-state] post-commit effect failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }
    assertActiveRemoteLeasesHeld();
    return result;
  };
  const backend = getBackendInfo().kind;
  const inheritedScope = portalStateCommitScopes.getStore();
  if (inheritedScope?.active) {
    const nested = Promise.resolve().then(run);
    inheritedScope.pendingTransactions.add(nested);
    // The outer transaction drains the original promise and propagates a
    // rejection. Attach an immediate observer as well so a fire-and-forget
    // caller cannot trigger Node's unhandled-rejection path first.
    void nested.catch(() => undefined);
    return nested;
  }
  if (backend === "file") {
    const path = getFileBackendDataPath();
    if (!path) throw new Error("product_workspace_file_backend_path_missing");
    // File persistence replaces one whole JSON blob, so every coordinated
    // client-ledger write must share the state-file lock even when the logical
    // workspaces differ.
    return withDevFileTransaction(path, run);
  }
  if (backend === "postgres") {
    // The generic Postgres driver also persists one whole JSONB blob.
    return withRemoteLock(backend, "portal-state-coordinated-write", run);
  }
  if (backend === "supabase") {
    return withRemoteLock(backend, key, run);
  }
  return withMemoryLock(key, run);
}

/**
 * Cross-process coordination for remote provider calls without opening a
 * PortalState transaction. The provider lane may contain slow network I/O;
 * state adoption should use a short withPortalStateTransaction inside it.
 */
export function withPortalProviderLease<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const backend = getBackendInfo().kind;
  const lane = `provider:${key}`;
  if (backend === "supabase" || backend === "postgres") {
    return withRemoteLock(backend, lane, operation);
  }
  if (backend === "file") {
    const path = getFileBackendDataPath();
    if (path) {
      const suffix = crypto.createHash("sha256").update(lane).digest("hex");
      return withDevFileTransaction(`${path}.provider-${suffix}`, operation);
    }
  }
  return withMemoryLock(lane, operation);
}

/** Reuse the same durable per-client lease for metadata ledgers that merge by item id. */
export function withClientMetadataLedgerTransaction<T>(
  input: { agencyId: string; clientId: string; ledger: "requests" | "approvals" | "files" | "payment-plans" | "performance-reports" | "record" | "tasks" },
  operation: () => T | Promise<T>,
): Promise<T> {
  return withProductWorkspaceTransaction({
    agencyId: input.agencyId,
    clientId: input.clientId,
    productId: `metadata-ledger:${input.ledger}`,
  }, operation);
}

/**
 * One serial lane for every provision/publish/deploy mutation on a client.
 * Provider and filesystem I/O intentionally remains inside the lane: otherwise
 * two requests can both snapshot `metadata.properties` and the later flush
 * silently removes the earlier project's row or status.
 */
export function withClientProjectTransaction<T>(
  input: { agencyId: string; clientId: string },
  operation: () => T | Promise<T>,
): Promise<T> {
  return withProductWorkspaceTransaction({
    agencyId: input.agencyId,
    clientId: input.clientId,
    productId: "client-projects",
  }, operation);
}
