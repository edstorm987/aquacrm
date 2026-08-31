import type { PluginStorage } from "../lib/aquaPluginTypes";

const mutationQueues = new Map<string, Promise<void>>();

/**
 * The live runtime storage (`src/built-ins/runtime/_runtime.ts`) implements
 * `runExclusive`, which delegates to `withPortalStateTransaction`: it reloads
 * the durable state (`ensureHydrated({ fresh: true })`), runs the operation and
 * flushes the write, all inside a cross-process lock (dev file lock, or a
 * Supabase/Postgres lease). Running the read-compare-write inside it is what
 * makes the `expectedUpdatedAt` check a real compare-and-set when two server
 * instances serve the same agency — an in-process queue alone only orders the
 * mutations of one process against each other.
 *
 * The vendored `PluginStorage` contract does not declare it, and harnesses
 * (tests, read-only storages) may not provide it, so it is detected
 * structurally and the in-process queue remains the fallback.
 */
type CrossProcessStorage = PluginStorage & {
  runExclusive?<T>(key: string, operation: () => Promise<T>): Promise<T>;
};

export interface MarketingLockContext {
  agencyId: string;
  storage: PluginStorage;
}

async function withInProcessQueue<T>(lockKey: string, work: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  mutationQueues.set(lockKey, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (mutationQueues.get(lockKey) === queued) mutationQueues.delete(lockKey);
  }
}

export async function withMarketingRecordLock<T>(
  ctx: MarketingLockContext,
  collection: string,
  work: () => Promise<T>,
): Promise<T> {
  const lockKey = `marketing:${ctx.agencyId}:${collection}`;
  const storage = ctx.storage as CrossProcessStorage;
  const runExclusive = typeof storage.runExclusive === "function"
    ? storage.runExclusive.bind(storage)
    : null;
  // In-process queue outside, durable lock inside: waiters of this process are
  // ordered locally before one of them competes for the cross-process lease.
  return withInProcessQueue(lockKey, () => (runExclusive ? runExclusive(lockKey, work) : work()));
}

export interface MarketingRecordStorage<T extends { id: string }> {
  legacyKey: string;
  rowPrefix: string;
  tombstonePrefix: string;
  storage: PluginStorage;
}

const rowKey = (prefix: string, id: string) => `${prefix}${encodeURIComponent(id)}`;

export async function listMarketingRecords<T extends { id: string }>(
  config: MarketingRecordStorage<T>,
): Promise<T[]> {
  const legacy = (await config.storage.get<T[]>(config.legacyKey)) ?? [];
  const rows = new Map(legacy.map(row => [row.id, row]));
  for (const key of await config.storage.list(config.rowPrefix)) {
    const row = await config.storage.get<T>(key);
    if (row) rows.set(row.id, row);
  }
  for (const key of await config.storage.list(config.tombstonePrefix)) {
    const id = decodeURIComponent(key.slice(config.tombstonePrefix.length));
    rows.delete(id);
  }
  return [...rows.values()];
}

export async function getMarketingRecord<T extends { id: string }>(
  config: MarketingRecordStorage<T>,
  id: string,
): Promise<T | null> {
  if (await config.storage.get(rowKey(config.tombstonePrefix, id))) return null;
  const independent = await config.storage.get<T>(rowKey(config.rowPrefix, id));
  if (independent) return independent;
  const legacy = (await config.storage.get<T[]>(config.legacyKey)) ?? [];
  return legacy.find(row => row.id === id) ?? null;
}

export async function setMarketingRecord<T extends { id: string }>(
  config: MarketingRecordStorage<T>,
  row: T,
): Promise<void> {
  await config.storage.set(rowKey(config.rowPrefix, row.id), row);
}

export async function deleteMarketingRecord<T extends { id: string }>(
  config: MarketingRecordStorage<T>,
  id: string,
): Promise<void> {
  await config.storage.set(rowKey(config.tombstonePrefix, id), true);
  await config.storage.del(rowKey(config.rowPrefix, id));
}

export function nextRecordVersion(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}
