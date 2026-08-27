import "server-only";

// Cross-request memoisation for the Dev Team markdown parsers.
//
// The whole Dev Team workspace re-reads and re-parses ~40 markdown files on
// EVERY request — roadmap.md, all of docs/development/plans/*.md (parsed twice,
// once for phases and once for statuses), findings, state.md, audits.md, the
// docs tree. None of these change between most requests, yet each one was a
// fresh `readFile` + a regex-heavy parse. That is the single biggest cost on
// the slowest surface in the app.
//
// This module is a transparent cache in front of those reads. It is keyed by
// (namespace, absolute path) and validated by the file's mtime + size: a parse
// result is reused only while the file on disk has not moved. Nothing here
// changes what the parsers produce — it is pure memoisation, so the returned
// shapes are exactly what the callers got before.
//
// Two guarantees make it safe to trust the cached value:
//   • A changed file busts its own entry automatically. `stat` is cheap and
//     always runs; a different mtime OR size means a re-read + re-parse.
//   • Same-process writes invalidate explicitly. A write can land in the same
//     millisecond as the mtime the cache saw (coarse FS clocks) with an
//     identical size, so every write path in these modules calls one of the
//     `invalidate*` helpers below rather than trusting mtime alone.

import {
  readDevWorkspaceFile,
  statDevWorkspacePath,
} from "@/lib/server/dev/devWorkspaceFiles";
import { getActiveDataRealmId } from "@/server/dataRealm";

interface CacheEntry {
  mtimeMs: number;
  size: number;
  value: unknown;
}

// A three-level store: data realm → namespace → absolute path → entry.
// The durable Dev Team workspace is an overlay inside the active signed data
// realm, so identical paths (and even identical mtime/size pairs) can contain
// different bytes in live and Sandbox. Keeping the realm as the first key
// prevents one request from reusing another realm's parsed document.
const STORE = new Map<string, Map<string, Map<string, CacheEntry>>>();

// Test-observable counters. Never read by production code — only the perf smoke
// test asserts against them to prove a second read did not re-parse from disk.
let hits = 0;
let misses = 0;

function bucket(realmId: string, namespace: string): Map<string, CacheEntry> {
  let namespaces = STORE.get(realmId);
  if (!namespaces) {
    namespaces = new Map();
    STORE.set(realmId, namespaces);
  }
  let map = namespaces.get(namespace);
  if (!map) {
    map = new Map();
    namespaces.set(namespace, map);
  }
  return map;
}

/**
 * Memoise `compute` for one file, keyed by (namespace, absPath) and validated
 * by the file's mtime + size. `compute` runs only on a miss (new file, or the
 * file moved since it was cached) and is handed the stat it was validated
 * against, so a caller that needs the mtime/size need not stat the file twice.
 *
 * Returns `null` — WITHOUT calling `compute` — when the file cannot be stat'd
 * (missing/unreadable), mirroring the "skip this file" behaviour every caller
 * already had around its `readFile`.
 */
export async function memoiseByStat<T>(
  namespace: string,
  absPath: string,
  compute: (info: { mtimeMs: number; size: number }) => Promise<T>,
): Promise<T | null> {
  // Capture before the first await. AsyncLocalStorage preserves the realm, but
  // an explicit key also makes cache ownership unambiguous for the full read.
  const realmId = getActiveDataRealmId();
  const map = bucket(realmId, namespace);
  let info: { mtimeMs: number; size: number };
  try {
    info = await statDevWorkspacePath(absPath);
  } catch {
    // Gone — drop any stale entry so a re-created file re-parses.
    map.delete(absPath);
    return null;
  }

  const hit = map.get(absPath);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) {
    hits += 1;
    return hit.value as T;
  }

  const value = await compute({ mtimeMs: info.mtimeMs, size: info.size });
  map.set(absPath, { mtimeMs: info.mtimeMs, size: info.size, value });
  misses += 1;
  return value;
}

/**
 * The common case: read the whole file as UTF-8 and hand it to `parse`. The
 * parsed result (including a `null` the parser returns to mean "nothing here")
 * is memoised, so a file with no phases / no status is never re-parsed either.
 *
 * Returns `null` when the file cannot be read, matching each caller's existing
 * try/catch-around-readFile skip.
 */
export async function readParsedFile<T>(
  namespace: string,
  absPath: string,
  parse: (text: string) => T,
): Promise<T | null> {
  try {
    return await memoiseByStat(namespace, absPath, async () => parse(await readDevWorkspaceFile(absPath, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Drop one (namespace, path) entry in every realm. Local development realms
 * can share the same physical working tree, while production overlays do not;
 * all-realm invalidation is safe for both and writes are rare.
 */
export function invalidateFile(namespace: string, absPath: string): void {
  for (const namespaces of STORE.values()) namespaces.get(namespace)?.delete(absPath);
}

/**
 * Drop EVERY entry for one file, whatever namespace cached it. A plan file is
 * cached under both `tasks` and `planStatus`; state.md under `workers` and
 * `blockers`; and a doc edit can rewrite any of them — so a write has to reach
 * all of a path's cached parses, not just the one it knows about.
 */
export function invalidatePath(absPath: string): void {
  for (const namespaces of STORE.values()) {
    for (const map of namespaces.values()) map.delete(absPath);
  }
}

/** Drop every entry in one namespace across all realms. */
export function invalidateNamespace(namespace: string): void {
  for (const namespaces of STORE.values()) namespaces.get(namespace)?.clear();
}

// ---- coalesced live indexes ------------------------------------------------

export interface CoalescedRefreshCacheStats {
  hits: number;
  loads: number;
  coalesced: number;
  size: number;
  inFlight: number;
}

/**
 * A small cross-request cache for expensive live indexes.
 *
 * Unlike `memoiseByStat`, which protects one parsed file, this protects the
 * directory walk that discovers all of those files. Concurrent misses share
 * one loader promise, and invalidation advances a generation so a scan that
 * started before an edit cannot publish stale results after that edit.
 */
export function createCoalescedRefreshCache<K, V>(ttlMs: number): {
  get: (key: K, load: () => Promise<V>, opts?: { fresh?: boolean }) => Promise<V>;
  invalidate: (key: K) => void;
  clear: () => void;
  stats: () => CoalescedRefreshCacheStats;
  reset: () => void;
} {
  const values = new Map<K, { completedAtMs: number; value: V }>();
  const revisions = new Map<K, number>();
  const pending = new Map<K, { epoch: number; revision: number; promise: Promise<V> }>();
  let epoch = 0;
  let hits = 0;
  let loads = 0;
  let coalesced = 0;

  const revisionFor = (key: K) => revisions.get(key) ?? 0;

  const get = async (key: K, load: () => Promise<V>, opts: { fresh?: boolean } = {}): Promise<V> => {
    const now = Date.now();
    const cached = values.get(key);
    if (!opts.fresh && cached && now - cached.completedAtMs < ttlMs) {
      hits += 1;
      return cached.value;
    }

    const revision = revisionFor(key);
    const existing = pending.get(key);
    if (existing && existing.epoch === epoch && existing.revision === revision) {
      coalesced += 1;
      return existing.promise;
    }

    loads += 1;
    const loadEpoch = epoch;
    let promise: Promise<V>;
    promise = (async () => {
      const value = await load();
      if (epoch === loadEpoch && revisionFor(key) === revision) {
        // Start the freshness window when the expensive scan FINISHES. Starting
        // it before a multi-second walk makes the result expire while loading.
        values.set(key, { completedAtMs: Date.now(), value });
      }
      return value;
    })().finally(() => {
      if (pending.get(key)?.promise === promise) pending.delete(key);
    });
    pending.set(key, { epoch: loadEpoch, revision, promise });
    return promise;
  };

  const invalidate = (key: K): void => {
    revisions.set(key, revisionFor(key) + 1);
    values.delete(key);
    // Do not cancel a filesystem read already in progress. Its captured
    // generation prevents it from entering the cache, and the next caller
    // starts a fresh load instead of joining it.
  };

  const clear = (): void => {
    epoch += 1;
    values.clear();
    revisions.clear();
    pending.clear();
  };

  return {
    get,
    invalidate,
    clear,
    stats: () => ({ hits, loads, coalesced, size: values.size, inFlight: pending.size }),
    reset: () => {
      clear();
      hits = 0;
      loads = 0;
      coalesced = 0;
    },
  };
}

// ---- test observability -----------------------------------------------------

/** Cache counters + total entries across all namespaces, for the perf smoke test only. */
export function __cacheStats(): { hits: number; misses: number; size: number } {
  let size = 0;
  for (const namespaces of STORE.values()) {
    for (const map of namespaces.values()) size += map.size;
  }
  return { hits, misses, size };
}

/** Clear the store and the counters — the perf smoke test isolates itself with this. */
export function __resetCache(): void {
  STORE.clear();
  hits = 0;
  misses = 0;
}
