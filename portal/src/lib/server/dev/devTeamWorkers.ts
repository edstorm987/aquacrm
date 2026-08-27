import "server-only";

import { join, relative } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/dev/devDocs";
import { createCoalescedRefreshCache } from "@/lib/server/dev/devMarkdownCache";
import {
  readDevWorkspaceDirectory,
  readDevWorkspaceFile,
  statDevWorkspacePath,
} from "@/lib/server/dev/devWorkspaceFiles";
import { getActiveDataRealmId } from "@/server/dataRealm";

// Live worker signals for the Dev Team board.
//
// Workers are separate chats, not processes we can inspect — so "live" comes
// from two independent signals:
//
//   1. CHECK-INS (intent) — a worker runs `npm run worker:checkin` and writes
//      `.data/workers/<name>.json`. Tells us who they are and what they think
//      they're doing.
//   2. FILE ACTIVITY (truth) — what has actually changed on disk in the last
//      couple of hours. Needs no cooperation, so a worker who forgets to check
//      in still shows up the moment they touch a file.
//
// Together: intent when we have it, evidence always. Everything here is
// read-only and confined to the project root.

const WORKERS_DIR = join(PROJECT_ROOT, ".data", "workers");

/**
 * How long a check-in counts as "working right now".
 *
 * A check-in file is written once and never deleted — nothing checks OUT — so
 * without a window every worker that has ever run `worker:checkin` reads as
 * live forever. This is the staleness contract for the whole signal, and it
 * lives HERE (next to the reader) so every consumer honours the same cutoff.
 *
 * Kept in step with `ACTIVE_WORKER_WINDOW_MS` in devConsoleStatus.ts, which
 * predates this constant; smoke-dev-team-workers.test.ts pins the two equal so
 * they cannot drift.
 */
export const ACTIVE_CHECK_IN_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Directories worth watching for "someone is working right now". */
const WATCHED = ["src", "scripts", "docs"];

/** Never walked — huge, generated, or irrelevant to authored work. */
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".data", "dist", "build", "coverage", ".turbo", ".vercel",
]);

/** Build/vendor directory predicate shared by the walker and its regression test. */
export function shouldSkipWorkerDirectory(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith(".next-") || name.startsWith(".");
}

export interface WorkerCheckIn {
  name: string;
  status: string;
  plan?: string;
  phase?: string;
  at: number;
}

export interface ActiveFile {
  relPath: string;
  mtimeMs: number;
  area: string;
}

export interface WorkerSignals {
  /** EVERY check-in on disk, newest first — history included. */
  checkIns: WorkerCheckIn[];
  /**
   * Only the check-ins inside `ACTIVE_CHECK_IN_WINDOW_MS` that have not signed
   * off — "who is working right now". Anything that answers that question must
   * read THIS, not `checkIns`.
   */
  activeCheckIns: WorkerCheckIn[];
  /**
   * EVERY file changed inside the window, newest first — NOT truncated. Counts
   * and groupings must be taken from this whole list; callers that display a
   * list slice it themselves for transport/rendering. (It used to be sliced to
   * 200 here, which silently under-reported "N files in 2h" by ~90% and hid
   * whole areas from the board.)
   */
  recentFiles: ActiveFile[];
  sandboxes: { name: string; mtimeMs: number }[];
  scannedAtMs: number;
}

/** Which part of the app a path belongs to — used to group live activity. */
export function areaFor(relPath: string): string {
  const parts = relPath.split("/");
  // `parts.length > 2` = parts[1] is a DIRECTORY. A file sitting directly in
  // docs/ (development.md, PRODUCT-ARCHITECTURE.md) belongs to "docs" — before,
  // each such file became its own area row, sitting next to the real ones.
  if (parts[0] === "docs") return parts.length > 2 ? `docs/${parts[1]}` : "docs";
  if (parts[0] === "scripts") return "tests/scripts";
  if (parts[0] !== "src") return parts[0] ?? "root";
  // src/app/portal/agency/... → the meaningful slice
  if (parts[1] === "app") return parts.slice(1, 4).join("/");
  if (parts[1] === "built-ins") return parts.slice(1, 4).join("/");
  return parts.slice(1, 3).join("/");
}

const MAX_WATCHED_FILES = 20_000;
const DIRECTORY_READ_CONCURRENCY = 128;
const FILE_STAT_CONCURRENCY = 256;

/**
 * Discover watched files breadth-first in bounded concurrent batches. The old
 * recursive walker awaited every child directory and every file stat in
 * series; under the dev server's file watcher that turned ~2,500 cheap stats
 * into a 2.5–5 second route tail. Batching preserves the same filesystem truth
 * and safety budget without opening thousands of handles at once.
 */
async function discoverWatchedFiles(): Promise<string[]> {
  const directories = WATCHED.map(dir => join(PROJECT_ROOT, dir));
  const files: string[] = [];

  for (let offset = 0; offset < directories.length && files.length < MAX_WATCHED_FILES;) {
    const batch = directories.slice(offset, offset + DIRECTORY_READ_CONCURRENCY);
    offset += batch.length;
    const listings = await Promise.all(batch.map(async directory => {
      try {
        return { directory, entries: await readDevWorkspaceDirectory(directory) };
      } catch {
        return { directory, entries: [] };
      }
    }));

    for (const { directory, entries } of listings) {
      for (const entry of entries) {
        if (files.length >= MAX_WATCHED_FILES) break;
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!shouldSkipWorkerDirectory(entry.name)) directories.push(full);
        } else if (entry.isFile()) {
          files.push(full);
        }
      }
    }
  }
  return files;
}

async function readRecentFiles(cutoff: number): Promise<ActiveFile[]> {
  const files = await discoverWatchedFiles();
  const recentFiles: ActiveFile[] = [];
  for (let offset = 0; offset < files.length; offset += FILE_STAT_CONCURRENCY) {
    const batch = await Promise.all(files.slice(offset, offset + FILE_STAT_CONCURRENCY).map(async full => {
      try {
        const info = await statDevWorkspacePath(full);
        if (info.mtimeMs < cutoff) return null;
        const relPath = relative(PROJECT_ROOT, full);
        return { relPath, mtimeMs: info.mtimeMs, area: areaFor(relPath) } satisfies ActiveFile;
      } catch {
        return null;
      }
    }));
    for (const file of batch) if (file) recentFiles.push(file);
  }
  recentFiles.sort((left, right) => right.mtimeMs - left.mtimeMs || left.relPath.localeCompare(right.relPath));
  return recentFiles;
}

/** Explicit worker check-ins, newest first. */
export async function readCheckIns(): Promise<WorkerCheckIn[]> {
  let names: string[];
  try {
    names = (await readDevWorkspaceDirectory(WORKERS_DIR))
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    return [];
  }
  const out: WorkerCheckIn[] = [];
  for (const file of names) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readDevWorkspaceFile(join(WORKERS_DIR, file), "utf8");
      const parsed = JSON.parse(raw) as Partial<WorkerCheckIn>;
      if (!parsed?.name) continue;
      out.push({
        name: String(parsed.name).slice(0, 60),
        status: String(parsed.status ?? "working").slice(0, 200),
        plan: parsed.plan ? String(parsed.plan).slice(0, 120) : undefined,
        phase: parsed.phase ? String(parsed.phase).slice(0, 80) : undefined,
        at: Number(parsed.at) || 0,
      });
    } catch {
      // A half-written check-in is not worth failing the board over.
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Is this check-in the word of a worker who is working RIGHT NOW? Two ways to
 * stop being live: go quiet for longer than the window, or sign off — a worker
 * whose phase/status says "done" is history the moment it says so.
 */
export function isCheckInActive(checkIn: WorkerCheckIn, now = Date.now()): boolean {
  if (!(checkIn.at >= now - ACTIVE_CHECK_IN_WINDOW_MS)) return false;
  return !/^(done|complete|completed|routed|finished|signed off)\b/i.test(
    (checkIn.phase ?? checkIn.status ?? "").trim(),
  );
}

/**
 * The DEFAULT read for "who is working right now". `readCheckIns()` is the raw
 * history and stays available, but a consumer that reaches for it to answer
 * "who is on this plan" will name workers who stopped hours ago.
 */
export async function readActiveCheckIns(now = Date.now()): Promise<WorkerCheckIn[]> {
  return (await readCheckIns()).filter(checkIn => isCheckInActive(checkIn, now));
}

/** Forked worker sandboxes — evidence a worker has (or had) a server running. */
async function readSandboxes(): Promise<{ name: string; mtimeMs: number }[]> {
  const dataDir = join(PROJECT_ROOT, ".data");
  let names: string[];
  try {
    names = (await readDevWorkspaceDirectory(dataDir))
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    return [];
  }
  const out: { name: string; mtimeMs: number }[] = [];
  for (const file of names) {
    const match = /^portal-state\.(.+)\.json$/.exec(file);
    if (!match) continue;
    try {
      const info = await statDevWorkspacePath(join(dataDir, file));
      out.push({ name: match[1], mtimeMs: info.mtimeMs });
    } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// Short-lived cache for the worker-activity scan. `scanWorkerSignals` recursively
// walks `WATCHED` (src, scripts, docs — thousands of files) on every call, which
// made the Dev Team home render ~5s each hit. The panel it feeds only shows
// "activity in the last 2h", so a few seconds of staleness is invisible; a 15s TTL
// turns every subsequent render into a memory read. Keyed on windowMs so the rare
// non-default caller gets its own entry; `now` is deliberately NOT part of the key
// (the whole point is to reuse a recent scan). Callers that need a guaranteed-fresh
// read pass `fresh: true`.
export const SIGNALS_TTL_MS = 15_000;
const signalsCache = createCoalescedRefreshCache<string, WorkerSignals>(SIGNALS_TTL_MS);
const fileActivityCache = createCoalescedRefreshCache<string, WorkerFileActivity>(SIGNALS_TTL_MS);

function workerSignalsCacheKey(windowMs: number): string {
  return `${getActiveDataRealmId()}:${windowMs}`;
}

export interface WorkerFileActivity {
  recentFiles: ActiveFile[];
  scannedAtMs: number;
}

/** The file-only activity read used by Logs, without check-ins or sandboxes. */
export async function scanRecentWorkerFiles(
  windowMs = 2 * 60 * 60 * 1000,
  now = Date.now(),
  opts: { fresh?: boolean } = {},
): Promise<WorkerFileActivity> {
  return fileActivityCache.get(workerSignalsCacheKey(windowMs), async () => ({
    recentFiles: await readRecentFiles(now - windowMs),
    scannedAtMs: now,
  }), opts);
}

/**
 * Everything the live panel needs. `windowMs` bounds "recent" (default 2h).
 * Cached for {@link SIGNALS_TTL_MS} to keep the Dev Team home fast; pass
 * `{ fresh: true }` to force a full re-scan.
 */
export async function scanWorkerSignals(
  windowMs = 2 * 60 * 60 * 1000,
  now = Date.now(),
  opts: { fresh?: boolean } = {},
): Promise<WorkerSignals> {
  return signalsCache.get(workerSignalsCacheKey(windowMs), async () => {
    const [activity, checkIns, sandboxes] = await Promise.all([
      // A composite-cache miss must start a current file scan. Reusing an
      // activity value near the end of its own TTL and then caching that
      // composite for another TTL would silently double the freshness bound.
      scanRecentWorkerFiles(windowMs, now, { fresh: true }),
      readCheckIns(),
      readSandboxes(),
    ]);

    return {
      checkIns,
      activeCheckIns: checkIns.filter(checkIn => isCheckInActive(checkIn, now)),
      // Un-truncated on purpose: `recentFiles.length` and `groupActivity()` over
      // this list are the "N files in 2h" and the area map the board prints, and
      // slicing here made both of them a lie.
      recentFiles: activity.recentFiles,
      sandboxes,
      scannedAtMs: activity.scannedAtMs,
    };
  }, opts);
}

/** Test-only observability for the warm/coalesced scan contract. */
export function __workerSignalsCacheStats() {
  return signalsCache.stats();
}

export function __workerFileActivityCacheStats() {
  return fileActivityCache.stats();
}

export function __resetWorkerSignalsCache(): void {
  signalsCache.reset();
  fileActivityCache.reset();
}

export interface AreaActivity {
  area: string;
  count: number;
  newestMs: number;
  sample: string[];
}

/** Group recent file activity into areas — "where work is happening right now". */
export function groupActivity(files: ActiveFile[]): AreaActivity[] {
  const byArea = new Map<string, AreaActivity>();
  for (const file of files) {
    const existing = byArea.get(file.area);
    if (existing) {
      existing.count += 1;
      existing.newestMs = Math.max(existing.newestMs, file.mtimeMs);
      if (existing.sample.length < 4) existing.sample.push(file.relPath);
    } else {
      byArea.set(file.area, {
        area: file.area,
        count: 1,
        newestMs: file.mtimeMs,
        sample: [file.relPath],
      });
    }
  }
  return [...byArea.values()].sort((a, b) => b.newestMs - a.newestMs);
}
