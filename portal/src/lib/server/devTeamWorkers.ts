import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/devDocs";

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

async function walk(dir: string, cutoff: number, out: ActiveFile[], budget = { left: 20000 }): Promise<void> {
  if (budget.left <= 0) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (budget.left <= 0) return;
    if (entry.name.startsWith(".") && entry.name !== ".data") {
      if (entry.isDirectory()) continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, cutoff, out, budget);
      continue;
    }
    if (!entry.isFile()) continue;
    budget.left -= 1;
    try {
      const info = await stat(full);
      if (info.mtimeMs >= cutoff) {
        const rel = relative(PROJECT_ROOT, full);
        out.push({ relPath: rel, mtimeMs: info.mtimeMs, area: areaFor(rel) });
      }
    } catch {
      // Unreadable file — skip it rather than failing the whole scan.
    }
  }
}

/** Explicit worker check-ins, newest first. */
export async function readCheckIns(): Promise<WorkerCheckIn[]> {
  let names: string[];
  try {
    names = await readdir(WORKERS_DIR);
  } catch {
    return [];
  }
  const out: WorkerCheckIn[] = [];
  for (const file of names) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(WORKERS_DIR, file), "utf8");
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
    names = await readdir(dataDir);
  } catch {
    return [];
  }
  const out: { name: string; mtimeMs: number }[] = [];
  for (const file of names) {
    const match = /^portal-state\.(.+)\.json$/.exec(file);
    if (!match) continue;
    try {
      const info = await stat(join(dataDir, file));
      out.push({ name: match[1], mtimeMs: info.mtimeMs });
    } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Everything the live panel needs. `windowMs` bounds "recent" (default 2h).
 */
export async function scanWorkerSignals(windowMs = 2 * 60 * 60 * 1000, now = Date.now()): Promise<WorkerSignals> {
  const cutoff = now - windowMs;
  const recentFiles: ActiveFile[] = [];

  await Promise.all(
    WATCHED.map(dir => walk(join(PROJECT_ROOT, dir), cutoff, recentFiles)),
  );

  recentFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const [checkIns, sandboxes] = await Promise.all([readCheckIns(), readSandboxes()]);

  return {
    checkIns,
    activeCheckIns: checkIns.filter(checkIn => isCheckInActive(checkIn, now)),
    // Un-truncated on purpose: `recentFiles.length` and `groupActivity()` over
    // this list are the "N files in 2h" and the area map the board prints, and
    // slicing here made both of them a lie.
    recentFiles,
    sandboxes,
    scannedAtMs: now,
  };
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
