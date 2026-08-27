import "server-only";

import crypto from "node:crypto";

import { withDevFileTransaction } from "@/lib/server/dev/devFileTransaction";
import {
  ensureHydrated,
  flushPendingWrites,
  getActiveDataRealmId,
  getBackendInfo,
  getFileBackendDataPath,
} from "./storage";

const LEASE_MS = 60_000;
const WAIT_MS = 10_000;

interface RemoteLease {
  state: "claimed" | "held";
  leaseExpiresAt: number;
}

export class ProductWorkspaceBusyError extends Error {
  constructor() {
    super("This workspace is being updated in another session. Try again in a moment.");
    this.name = "ProductWorkspaceBusyError";
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

async function withMemoryLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = memoryTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  memoryTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (memoryTails.get(key) === tail) memoryTails.delete(key);
  }
}

async function withRemoteLock<T>(
  backend: "supabase" | "postgres",
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const realmId = getActiveDataRealmId();
  const holder = holderId();
  const deadline = Date.now() + WAIT_MS;
  let delayMs = 30;
  for (;;) {
    const rawLease = backend === "supabase"
      ? await (await import("./storageSupabase")).claimProductWorkspaceLease(key, holder, LEASE_MS, {}, realmId)
      : await (await import("./storagePostgres")).claimProductWorkspaceLease(key, holder, LEASE_MS, realmId);
    const lease = normaliseRemoteLease(rawLease);
    if (lease.state === "claimed") break;
    if (Date.now() >= deadline) throw new ProductWorkspaceBusyError();
    await new Promise(resolve => setTimeout(resolve, delayMs));
    delayMs = Math.min(250, Math.round(delayMs * 1.5));
  }

  try {
    return await operation();
  } finally {
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

/**
 * Serialize one client/product mutation across browser tabs and server
 * processes, reload the durable state while holding that lock, then flush the
 * complete cross-model change before releasing it.
 */
export async function withProductWorkspaceTransaction<T>(
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
export async function withPortalStateTransaction<T>(
  key: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const run = async () => {
    await ensureHydrated({ fresh: true });
    const result = await operation();
    await flushPendingWrites();
    return result;
  };
  const backend = getBackendInfo().kind;
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

/** Reuse the same durable per-client lease for metadata ledgers that merge by item id. */
export function withClientMetadataLedgerTransaction<T>(
  input: { agencyId: string; clientId: string; ledger: "requests" | "approvals" | "payment-plans" | "performance-reports" | "record" | "tasks" },
  operation: () => T | Promise<T>,
): Promise<T> {
  return withProductWorkspaceTransaction({
    agencyId: input.agencyId,
    clientId: input.clientId,
    productId: `metadata-ledger:${input.ledger}`,
  }, operation);
}
