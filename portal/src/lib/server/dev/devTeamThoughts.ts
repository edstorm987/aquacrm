import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/dev/devDocs";
import { atomicReplaceDevFile, withDevFileTransaction } from "@/lib/server/dev/devFileTransaction";
import {
  DevWorkspaceFileConflictError,
  readDevWorkspaceSnapshot,
  replaceDurableDevWorkspaceFiles,
  usesDurableDevTeamWorkspace,
  type DevWorkspaceFileVersion,
} from "@/lib/server/dev/devWorkspaceFiles";

// Ed's thoughts — the reply channel.
//
// Findings capture "this is wrong". This captures "here's what I think about
// what you're doing" — a note left on a specific task, plan, or nothing in
// particular, so work can continue without Ed having to find the right chat.
//
// Two consumers, which is the whole point:
//   • the Dev Console shows them inline against the task
//   • a WORKER reads its own unread thoughts with `npm run worker:thoughts <name>`
//     and marks them acknowledged, so nothing is silently missed
//
// Stored as one JSON ledger under `.data/` — local only, never committed.
//
// Three things this module is careful about, because it is the ONLY copy of
// what Ed said and it has two independent writers (this module and
// `scripts/worker-thoughts.mjs`):
//
//   1. Every write is atomic (temp file + rename) and in-process mutations are
//      serialised. Two overlapping plain writeFile calls used to leave the
//      shorter payload inside the longer one — valid JSON followed by trailing
//      garbage — which readAll() swallowed, reporting an empty ledger.
//   2. A ledger we could not PARSE is never overwritten. Empty-because-missing
//      and empty-because-broken are different answers.
//   3. The row cap never evicts a thought nobody has read. Trimming the oldest
//      row regardless of delivery quietly destroyed instructions a worker had
//      not come back for yet.

const MAX = 500;

/**
 * `DEV_THOUGHTS_FILE` points the ledger somewhere else — the same seam
 * `PORTAL_DATA_FILE` gives portal state. Without it no test could touch this
 * module without writing Ed's real ledger, which is exactly why none did.
 * Resolved per call so a test can point it at a temp file after import.
 */
function ledgerFile(): string {
  const override = process.env.DEV_THOUGHTS_FILE?.trim();
  return override || join(PROJECT_ROOT, ".data", "dev-thoughts.json");
}

function archiveFile(): string {
  return ledgerFile().replace(/\.json$/i, "") + ".archive.jsonl";
}

export interface Thought {
  id: string;
  at: number;
  author: string;
  text: string;
  /** What it's about: a task id (plan#n), a plan slug, or undefined = general. */
  taskId?: string;
  planName?: string;
  /**
   * A Dev Editor project this note belongs to (dev-editor-finish.md phase 14
   * — the editor's per-project Notes tab rides this ledger rather than
   * growing a second notes store). Undefined = not a project note; project
   * notes and worker thoughts share the file but never each other's queries.
   * A FIRST-CLASS field, not a convention smuggled through `taskId` — that
   * would have polluted `thoughtsByTask`'s console groupings.
   */
  projectId?: string;
  /**
   * Worker this is aimed at, when known. Undefined = a general note, which
   * every worker should see — so it cannot be "used up" by the first one.
   */
  worker?: string;
  /**
   * Who has picked it up: worker name → when. Per-reader on purpose. A single
   * global `acknowledgedAt` meant the first worker to run `--ack` consumed a
   * general note for everyone else, and general notes are the common case —
   * a task with no active check-in carries no worker at all.
   */
  readBy?: Record<string, number>;
}

/** The ledger exists but could not be parsed — never silently overwrite it. */
export class ThoughtLedgerUnreadableError extends Error {
  constructor(public readonly file: string) {
    super(`The thoughts ledger at ${file} is not readable JSON. It has been left untouched — move it aside before writing again.`);
    this.name = "ThoughtLedgerUnreadableError";
  }
}

/** Who has picked a thought up, oldest read first. */
export function readersOf(t: Thought): string[] {
  return Object.entries(t.readBy ?? {}).sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

export function isRead(t: Thought): boolean {
  return readersOf(t).length > 0;
}

/**
 * Rows written before per-reader acknowledgement carried a single
 * `acknowledgedBy`/`acknowledgedAt` pair. Fold them in rather than treating an
 * old ledger as entirely unread.
 */
function normalise(row: Thought & { acknowledgedBy?: unknown; acknowledgedAt?: unknown }): Thought {
  const { acknowledgedBy, acknowledgedAt, ...rest } = row;
  const readBy: Record<string, number> = { ...(rest.readBy ?? {}) };
  if (typeof acknowledgedAt === "number" && !Object.keys(readBy).length) {
    readBy[typeof acknowledgedBy === "string" && acknowledgedBy ? acknowledgedBy : "a worker"] = acknowledgedAt;
  }
  return Object.keys(readBy).length ? { ...rest, readBy } : { ...rest, readBy: undefined };
}

async function readAllSnapshot(): Promise<{ rows: Thought[]; version: DevWorkspaceFileVersion | null }> {
  const file = ledgerFile();
  let text: string;
  let version: DevWorkspaceFileVersion;
  try {
    const snapshot = await readDevWorkspaceSnapshot(file);
    text = snapshot.bytes.toString("utf8");
    version = snapshot.version;
  } catch (error) {
    // No ledger yet is a legitimate empty. Anything else is not.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { rows: [], version: null };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ThoughtLedgerUnreadableError(file);
  }
  if (!Array.isArray(parsed)) throw new ThoughtLedgerUnreadableError(file);
  return { rows: (parsed as Thought[]).map(normalise), version };
}

async function readAll(): Promise<Thought[]> {
  return (await readAllSnapshot()).rows;
}

/** The read path a rendered page takes: never throws, but never silent either. */
async function readAllForDisplay(): Promise<Thought[]> {
  try {
    return await readAll();
  } catch (error) {
    console.error("[dev-thoughts] ledger unreadable:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Trim to the cap by dropping only rows somebody has actually READ, oldest
 * first, and archive whatever is dropped. An unread thought is never evicted:
 * a worker offline through a long session must still find what Ed left it.
 */
function applyCap(rows: Thought[]): { keep: Thought[]; evicted: Thought[] } {
  if (rows.length <= MAX) return { keep: rows, evicted: [] };
  const evictable = new Set<number>();
  let over = rows.length - MAX;
  for (let i = rows.length - 1; i >= 0 && over > 0; i--) {
    if (isRead(rows[i])) { evictable.add(i); over -= 1; }
  }
  return {
    keep: rows.filter((_, i) => !evictable.has(i)),
    evicted: rows.filter((_, i) => evictable.has(i)),
  };
}

async function writeAll(rows: Thought[], expected: DevWorkspaceFileVersion | null): Promise<void> {
  const file = ledgerFile();
  const { keep, evicted } = applyCap(rows);
  const nextLedger = JSON.stringify(keep, null, 2) + "\n";
  if (usesDurableDevTeamWorkspace()) {
    const replacements: Array<{
      target: string;
      content: string;
      expected: DevWorkspaceFileVersion | null;
    }> = [{ target: file, content: nextLedger, expected }];
    if (evicted.length) {
      let archive = "";
      let archiveVersion: DevWorkspaceFileVersion | null = null;
      try {
        const snapshot = await readDevWorkspaceSnapshot(archiveFile());
        archive = snapshot.bytes.toString("utf8");
        archiveVersion = snapshot.version;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      replacements.push({
        target: archiveFile(),
        content: archive + evicted.map(row => JSON.stringify(row)).join("\n") + "\n",
        expected: archiveVersion,
      });
    }
    await replaceDurableDevWorkspaceFiles(replacements);
    return;
  }

  await mkdir(dirname(file), { recursive: true });
  if (evicted.length) {
    await appendFile(archiveFile(), evicted.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
  }
  // Durable atomic replacement: readers see the old ledger or the complete new
  // one, and fsync finishes before rename.
  await atomicReplaceDevFile(file, nextLedger, expected);
}

/**
 * One mutation at a time across all processes. The lock is a directory beside
 * the selected ledger, so the portal and worker-thoughts script share it.
 */
async function serial<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await withDevFileTransaction(ledgerFile(), run);
    } catch (error) {
      if (!usesDurableDevTeamWorkspace() || !(error instanceof DevWorkspaceFileConflictError) || attempt === 4) throw error;
    }
  }
  throw new DevWorkspaceFileConflictError();
}

function clean(s: string, max: number): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

let idSeq = 0;

export async function addThought(input: {
  text: string;
  author: string;
  taskId?: string;
  planName?: string;
  worker?: string;
  projectId?: string;
}): Promise<Thought> {
  const text = clean(input.text ?? "", 2000);
  if (!text) throw new Error("Say something first.");

  return serial(async () => {
    const { rows, version } = await readAllSnapshot();
    const thought: Thought = {
      // Time-ordered, and unique even when two land in the same millisecond at
      // the cap — the old id folded in `rows.length`, which stops moving there.
      id: `th_${Date.now().toString(36)}_${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      author: clean(input.author || "Ed", 80),
      text,
      taskId: input.taskId ? clean(input.taskId, 120) : undefined,
      planName: input.planName ? clean(input.planName, 120) : undefined,
      worker: input.worker ? clean(input.worker, 60) : undefined,
      projectId: input.projectId ? clean(input.projectId, 120) : undefined,
    };
    await writeAll([thought, ...rows], version);
    return thought;
  });
}

export async function listThoughts(limit = 100): Promise<Thought[]> {
  return (await readAllForDisplay()).slice(0, Math.max(1, Math.min(limit, MAX)));
}

/**
 * One project's notes, newest first — the editor's Notes tab (phase 14).
 *
 * Filtered by the first-class `projectId` tag, so a project's notes and the
 * worker-thought traffic share a ledger without ever answering each other's
 * queries. TENANCY IS THE CALLER'S JOB, stated here because this module
 * cannot do it: the ledger knows project ids, not agencies, so the route must
 * resolve the id through `getDevProject(session.agencyId, …)` BEFORE asking —
 * the same tenant-before-project order every dev route uses.
 */
export async function listThoughtsForProject(projectId: string, limit = 100): Promise<Thought[]> {
  const wanted = clean(projectId, 120);
  if (!wanted) return [];
  return (await readAllForDisplay())
    .filter(thought => thought.projectId === wanted)
    .slice(0, Math.max(1, Math.min(limit, MAX)));
}

/** Thoughts grouped by the task they're attached to, for inline display. */
export async function thoughtsByTask(): Promise<Record<string, Thought[]>> {
  const rows = await readAllForDisplay();
  const out: Record<string, Thought[]> = {};
  for (const t of rows) {
    if (!t.taskId) continue;
    (out[t.taskId] ??= []).push(t);
  }
  return out;
}

/**
 * What a given worker still hasn't picked up — its own, plus general notes.
 * "Unread" is per reader: another worker acknowledging a general note does not
 * consume it for this one.
 */
export async function unreadFor(worker: string): Promise<Thought[]> {
  const name = worker.toLowerCase();
  // Project notes (`projectId` set) are the EDITOR's Notes tab, not worker
  // instructions — without this exclusion every worker would be handed Ed's
  // project notes as unread general notes, which is exactly the "aimed at
  // nobody = aimed at everybody" rule misfiring on a row it was never for.
  return (await readAll()).filter(t =>
    !t.projectId && !(t.readBy ?? {})[name] && (!t.worker || t.worker.toLowerCase() === name));
}

/** Mark `ids` as picked up BY `worker`. Other readers are left as they were. */
export async function acknowledge(ids: string[], worker: string): Promise<number> {
  const name = clean(worker, 60).toLowerCase();
  if (!name) return 0;
  return serial(async () => {
    const { rows, version } = await readAllSnapshot();
    const wanted = new Set(ids);
    let n = 0;
    for (const row of rows) {
      if (!wanted.has(row.id)) continue;
      const readBy = row.readBy ?? {};
      if (readBy[name]) continue;
      row.readBy = { ...readBy, [name]: Date.now() };
      n += 1;
    }
    if (n) await writeAll(rows, version);
    return n;
  });
}

/** Count of thoughts NOBODY has picked up — badges the console. */
export async function unacknowledgedCount(): Promise<number> {
  // Project notes are notes-to-self in the editor; nothing acknowledges them,
  // so counting them would light the console badge permanently.
  return (await readAllForDisplay()).filter(t => !isRead(t) && !t.projectId).length;
}

/**
 * How close the ledger is to its cap, and how much of it is undeliverable
 * backlog. Unread rows are never evicted, so a ledger that stays over the cap
 * is a signal that nobody is running `worker:thoughts`.
 */
export async function ledgerPressure(): Promise<{ rows: number; unread: number; max: number; full: boolean }> {
  const rows = await readAllForDisplay();
  const unread = rows.filter(t => !isRead(t)).length;
  return { rows: rows.length, unread, max: MAX, full: rows.length >= MAX };
}
