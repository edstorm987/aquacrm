import "server-only";

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { PROJECT_ROOT } from "@/lib/server/devDocs";
import type { SessionPayload } from "@/server/types";

// Editing docs from inside the app, with attribution.
//
// The docs ARE the project's memory, and they're written from two directions:
// Ed edits them in the portal, and workers/agents rewrite them straight on
// disk. So "who changed this?" needs two answers:
//
//   • IN-APP edits are recorded here in a ledger, with the signed-in user.
//   • OUTSIDE edits (a worker, an editor, a script) can't announce themselves —
//     but they move the file's mtime. So when the file is newer than the last
//     ledger entry, we can say honestly "changed outside the app since Ed's
//     last edit", rather than pretending we know who did it.
//
// Writes are confined to the project root, markdown only, and refuse vendor
// and build directories.

const LEDGER_PATH = join(PROJECT_ROOT, ".data", "dev-doc-edits.json");
const MAX_ENTRIES = 500;
const MAX_BYTES = 2_000_000;

/** Directories a doc edit must never reach into. */
const REFUSED_SEGMENTS = new Set([
  "node_modules", ".next", ".git", "dist", "build", "coverage", ".vercel", ".turbo",
]);

export interface DocEdit {
  relPath: string;
  /** Display name of whoever saved it from the app. */
  author: string;
  authorEmail?: string;
  at: number;
  sizeBytes: number;
  /** Optional note Ed leaves with the save — "why", not "what". */
  note?: string;
}

export interface DocHistory {
  edits: DocEdit[];
  /** True when the file on disk is newer than our last recorded in-app edit. */
  changedOutsideApp: boolean;
  /** File mtime, so the UI can show when that outside change happened. */
  mtimeMs: number;
}

/** Repo-relative, forward-slashed — the ONE spelling a path gets in the ledger. */
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * The ledger key for a path: canonical, repo-relative, posix.
 *
 * Attribution is matched by string equality, so a path must have exactly one
 * spelling or one file's history splits in two — `docs/a.md` and `./docs/a.md`
 * are the same file but were two different documents to the ledger, which is
 * how "who changed this" could come back empty on a doc you had just saved.
 * Derived from the RESOLVED absolute path, never from the caller's string.
 */
function ledgerKey(relPath: string): string {
  return toPosix(relative(PROJECT_ROOT, resolve(PROJECT_ROOT, relPath)));
}

/** Resolve + validate a doc path for WRITING. Throws with a plain reason. */
function resolveWritablePath(relPath: string): string {
  const abs = resolve(PROJECT_ROOT, relPath);
  if (abs !== PROJECT_ROOT && !abs.startsWith(PROJECT_ROOT + sep)) {
    throw new Error("That path is outside the project.");
  }
  if (!abs.toLowerCase().endsWith(".md")) {
    throw new Error("Only markdown files can be edited here.");
  }
  const rel = abs.slice(PROJECT_ROOT.length + 1);
  if (rel.split(/[\\/]/).some(segment => REFUSED_SEGMENTS.has(segment))) {
    throw new Error("That directory is not editable.");
  }
  return abs;
}

async function readLedger(): Promise<DocEdit[]> {
  try {
    const raw = await readFile(LEDGER_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as DocEdit[] : [];
  } catch {
    return [];
  }
}

async function writeLedger(entries: DocEdit[]): Promise<void> {
  await mkdir(dirname(LEDGER_PATH), { recursive: true });
  // Newest first, bounded — this is a working record, not an audit archive.
  const bounded = entries.slice(0, MAX_ENTRIES);
  await writeFile(LEDGER_PATH, JSON.stringify(bounded, null, 2) + "\n", "utf8");
}

/**
 * Save a doc's markdown and record who did it.
 *
 * `expectedMtimeMs` is an optimistic-concurrency guard: the caller passes the
 * mtime it loaded, and the save is refused if the file moved underneath — which
 * is exactly what happens when a worker rewrites the same doc mid-edit. Better
 * to make Ed re-read than to silently erase a worker's change.
 */
export async function saveDevDoc(input: {
  session: SessionPayload;
  relPath: string;
  content: string;
  note?: string;
  authorName?: string;
  expectedMtimeMs?: number;
}): Promise<{ mtimeMs: number; sizeBytes: number }> {
  const abs = resolveWritablePath(input.relPath);

  if (typeof input.content !== "string") throw new Error("Nothing to save.");
  if (input.content.length > MAX_BYTES) throw new Error("That document is too large to save here.");

  const current = await stat(abs).catch(() => null);
  if (!current) throw new Error("That document no longer exists.");
  if (
    typeof input.expectedMtimeMs === "number" &&
    Math.abs(current.mtimeMs - input.expectedMtimeMs) > 1
  ) {
    throw new Error(
      "This document changed on disk since you opened it — a worker may have edited it. Reload before saving so their change isn't lost.",
    );
  }

  await writeFile(abs, input.content, "utf8");
  const after = await stat(abs);

  const entry: DocEdit = {
    // From `abs`, not from what the caller typed — see `ledgerKey`.
    relPath: toPosix(relative(PROJECT_ROOT, abs)),
    author: (input.authorName || input.session.email || "Unknown").slice(0, 80),
    authorEmail: input.session.email,
    at: Date.now(),
    sizeBytes: after.size,
    note: input.note ? input.note.replace(/\s+/g, " ").trim().slice(0, 400) : undefined,
  };
  const ledger = await readLedger();
  await writeLedger([entry, ...ledger]);

  return { mtimeMs: after.mtimeMs, sizeBytes: after.size };
}

/** The edit history for one doc, plus whether it moved outside the app since. */
export async function docHistory(relPath: string): Promise<DocHistory> {
  const abs = resolve(PROJECT_ROOT, relPath);
  const info = await stat(abs).catch(() => null);
  const mtimeMs = info?.mtimeMs ?? 0;

  const key = ledgerKey(relPath);
  const ledger = await readLedger();
  const edits = ledger.filter(e => ledgerKey(e.relPath) === key).slice(0, 20);

  // A second of slack: writeFile + stat aren't perfectly simultaneous.
  const lastInApp = edits[0]?.at ?? 0;
  const changedOutsideApp = mtimeMs > 0 && mtimeMs - lastInApp > 1500;

  return { edits, changedOutsideApp, mtimeMs };
}

/** The most recent in-app edits across every doc — the "who did what" feed. */
export async function recentDocEdits(limit = 25): Promise<DocEdit[]> {
  const ledger = await readLedger();
  return ledger.slice(0, Math.max(1, Math.min(limit, 100)));
}
