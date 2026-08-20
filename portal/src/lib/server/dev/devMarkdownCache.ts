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

import { readFile, stat } from "node:fs/promises";

interface CacheEntry {
  mtimeMs: number;
  size: number;
  value: unknown;
}

// A two-level store: namespace → (absolute path → entry). Nested maps keep the
// key structured (no string-separator that could collide with a space or colon
// in a path) and make per-namespace / per-path invalidation a plain lookup.
const STORE = new Map<string, Map<string, CacheEntry>>();

// Test-observable counters. Never read by production code — only the perf smoke
// test asserts against them to prove a second read did not re-parse from disk.
let hits = 0;
let misses = 0;

function bucket(namespace: string): Map<string, CacheEntry> {
  let map = STORE.get(namespace);
  if (!map) {
    map = new Map();
    STORE.set(namespace, map);
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
  const map = bucket(namespace);
  let info: { mtimeMs: number; size: number };
  try {
    info = await stat(absPath);
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
    return await memoiseByStat(namespace, absPath, async () => parse(await readFile(absPath, "utf8")));
  } catch {
    return null;
  }
}

/** Drop one (namespace, path) entry. Precise — use when only one reader cached it. */
export function invalidateFile(namespace: string, absPath: string): void {
  STORE.get(namespace)?.delete(absPath);
}

/**
 * Drop EVERY entry for one file, whatever namespace cached it. A plan file is
 * cached under both `tasks` and `planStatus`; state.md under `workers` and
 * `blockers`; and a doc edit can rewrite any of them — so a write has to reach
 * all of a path's cached parses, not just the one it knows about.
 */
export function invalidatePath(absPath: string): void {
  for (const map of STORE.values()) map.delete(absPath);
}

/** Drop every entry in one namespace. */
export function invalidateNamespace(namespace: string): void {
  STORE.get(namespace)?.clear();
}

// ---- test observability -----------------------------------------------------

/** Cache counters + total entries across all namespaces, for the perf smoke test only. */
export function __cacheStats(): { hits: number; misses: number; size: number } {
  let size = 0;
  for (const map of STORE.values()) size += map.size;
  return { hits, misses, size };
}

/** Clear the store and the counters — the perf smoke test isolates itself with this. */
export function __resetCache(): void {
  STORE.clear();
  hits = 0;
  misses = 0;
}
