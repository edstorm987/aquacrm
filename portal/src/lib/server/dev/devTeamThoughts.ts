import "server-only";

import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/dev/devDocs";

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

async function readAll(): Promise<Thought[]> {
  const file = ledgerFile();
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    // No ledger yet is a legitimate empty. Anything else is not.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ThoughtLedgerUnreadableError(file);
  }
  if (!Array.isArray(parsed)) throw new ThoughtLedgerUnreadableError(file);
  return (parsed as Thought[]).map(normalise);
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

let writeSeq = 0;

async function writeAll(rows: Thought[]): Promise<void> {
  const file = ledgerFile();
  await mkdir(dirname(file), { recursive: true });
  const { keep, evicted } = applyCap(rows);
  if (evicted.length) {
    await appendFile(archiveFile(), evicted.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
  }
  // Atomic: a reader sees the old file or the new one, never a half-written
  // splice of both. rename(2) is atomic within a filesystem.
  const tmp = `${file}.${process.pid}.${writeSeq++}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(keep, null, 2) + "\n", "utf8");
    await rename(tmp, file);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

/**
 * One mutation at a time inside this process. Read-modify-write over a shared
 * file interleaves otherwise, and the loser's row disappears.
 */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run, run);
  chain = next.then(() => undefined, () => undefined);
  return next;
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
}): Promise<Thought> {
  const text = clean(input.text ?? "", 2000);
  if (!text) throw new Error("Say something first.");

  return serial(async () => {
    const rows = await readAll();
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
    };
    await writeAll([thought, ...rows]);
    return thought;
  });
}

export async function listThoughts(limit = 100): Promise<Thought[]> {
  return (await readAllForDisplay()).slice(0, Math.max(1, Math.min(limit, MAX)));
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
  return (await readAll()).filter(t =>
    !(t.readBy ?? {})[name] && (!t.worker || t.worker.toLowerCase() === name));
}

/** Mark `ids` as picked up BY `worker`. Other readers are left as they were. */
export async function acknowledge(ids: string[], worker: string): Promise<number> {
  const name = clean(worker, 60).toLowerCase();
  if (!name) return 0;
  return serial(async () => {
    const rows = await readAll();
    const wanted = new Set(ids);
    let n = 0;
    for (const row of rows) {
      if (!wanted.has(row.id)) continue;
      const readBy = row.readBy ?? {};
      if (readBy[name]) continue;
      row.readBy = { ...readBy, [name]: Date.now() };
      n += 1;
    }
    if (n) await writeAll(rows);
    return n;
  });
}

/** Count of thoughts NOBODY has picked up — badges the console. */
export async function unacknowledgedCount(): Promise<number> {
  return (await readAllForDisplay()).filter(t => !isRead(t)).length;
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
