import type { PluginStorage } from "../lib/aquaPluginTypes";

const mutationQueues = new Map<string, Promise<void>>();

export async function withMarketingRecordLock<T>(
  agencyId: string,
  collection: string,
  work: () => Promise<T>,
): Promise<T> {
  const lockKey = `${agencyId}:${collection}`;
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
