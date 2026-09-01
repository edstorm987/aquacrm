import "server-only";

import crypto from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

import { invalidateDevDocsIndex, PROJECT_ROOT } from "@/lib/server/dev/devDocs";
import { invalidatePath } from "@/lib/server/dev/devMarkdownCache";
import type { SessionPayload } from "@/server/types";
import {
  DevFileConflictError,
  devFileVersion,
  recoverDevFileBatch,
  replaceDevFilesWithJournal,
  withDevFileTransaction,
} from "@/lib/server/dev/devFileTransaction";
import {
  DevWorkspaceFileConflictError,
  readDevWorkspaceFile,
  readDevWorkspaceSnapshot,
  replaceDurableDevWorkspaceFiles,
  usesDurableDevTeamWorkspace,
  type DevWorkspaceFileVersion,
} from "@/lib/server/dev/devWorkspaceFiles";

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
  /** Identifies the exact bytes this attribution belongs to. */
  contentSha256?: string;
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

function parseLedger(raw: string): DocEdit[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error("The Dev Team document attribution ledger is invalid and was left untouched.", { cause: error });
  }
  if (!Array.isArray(parsed) || !parsed.every(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    return typeof entry.relPath === "string"
      && typeof entry.author === "string"
      && (entry.authorEmail === undefined || typeof entry.authorEmail === "string")
      && typeof entry.at === "number" && Number.isSafeInteger(entry.at) && entry.at >= 0
      && typeof entry.sizeBytes === "number" && Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes >= 0
      && (entry.contentSha256 === undefined || (typeof entry.contentSha256 === "string" && /^[0-9a-f]{64}$/.test(entry.contentSha256)))
      && (entry.note === undefined || typeof entry.note === "string");
  })) {
    throw new Error("The Dev Team document attribution ledger is invalid and was left untouched.");
  }
  return parsed as DocEdit[];
}

async function readLedger(): Promise<DocEdit[]> {
  try {
    return parseLedger(await readDevWorkspaceFile(LEDGER_PATH, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof Error && error.message.includes("attribution ledger is invalid")) throw error;
    throw new Error("The Dev Team document attribution ledger could not be read and was left untouched.", { cause: error });
  }
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
  expectedSha256?: string;
}): Promise<{ mtimeMs: number; sizeBytes: number; contentSha256: string }> {
  const abs = resolveWritablePath(input.relPath);

  if (typeof input.content !== "string") throw new Error("Nothing to save.");
  if (input.content.length > MAX_BYTES) throw new Error("That document is too large to save here.");

  // One lock covers BOTH the document and the attribution ledger. Separate
  // server processes therefore re-check the expected version in order, and
  // the content hash makes an attribution meaningful only for the bytes that
  // actually survived.
  return withDevFileTransaction(LEDGER_PATH, async () => {
    // A previous process may have stopped after committing the document but
    // before its attribution row (or vice versa). Finish that exact journaled
    // pair before taking a new version snapshot.
    await recoverDevFileBatch(LEDGER_PATH, [abs, LEDGER_PATH]);

    const current = await devFileVersion(abs);
    if (!current) throw new Error("That document no longer exists.");
    const hashConflict = Boolean(input.expectedSha256 && current.sha256 !== input.expectedSha256);
    const legacyMtimeConflict = !input.expectedSha256
      && typeof input.expectedMtimeMs === "number"
      && Math.abs(current.mtimeMs - input.expectedMtimeMs) > 1;
    if (hashConflict || legacyMtimeConflict) {
      throw new Error(
        "This document changed on disk since you opened it — a worker may have edited it. Reload before saving so their change isn't lost.",
      );
    }

    const entryBase = {
      relPath: toPosix(relative(PROJECT_ROOT, abs)),
      author: (input.authorName || input.session.email || "Unknown").slice(0, 80),
      authorEmail: input.session.email,
      at: Date.now(),
      sizeBytes: Buffer.byteLength(input.content, "utf8"),
      contentSha256: crypto.createHash("sha256").update(input.content).digest("hex"),
      note: input.note ? input.note.replace(/\s+/g, " ").trim().slice(0, 400) : undefined,
    } satisfies DocEdit;

    if (usesDurableDevTeamWorkspace()) {
      let ledgerEntries: DocEdit[] = [];
      let ledgerVersion: DevWorkspaceFileVersion | null = null;
      try {
        const snapshot = await readDevWorkspaceSnapshot(LEDGER_PATH);
        ledgerEntries = parseLedger(snapshot.bytes.toString("utf8"));
        ledgerVersion = snapshot.version;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const ledgerContent = JSON.stringify([entryBase, ...ledgerEntries].slice(0, MAX_ENTRIES), null, 2) + "\n";
      try {
        const [after] = await replaceDurableDevWorkspaceFiles([
          { target: abs, content: input.content, expected: current },
          { target: LEDGER_PATH, content: ledgerContent, expected: ledgerVersion },
        ]);
        invalidatePath(abs);
        invalidateDevDocsIndex();
        return { mtimeMs: after.mtimeMs, sizeBytes: after.size, contentSha256: after.sha256 };
      } catch (error) {
        if (error instanceof DevWorkspaceFileConflictError) throw new DevFileConflictError(error.message);
        throw error;
      }
    }

    // Compare the exact bytes again immediately before atomic rename. This
    // catches a direct editor/worker that does not participate in Aqua's lock.
    const ledgerVersion = await devFileVersion(LEDGER_PATH);
    const ledger = await readLedger();
    const ledgerContent = JSON.stringify(
      [entryBase, ...ledger].slice(0, MAX_ENTRIES),
      null,
      2,
    ) + "\n";
    const [after] = await replaceDevFilesWithJournal(LEDGER_PATH, [
      { target: abs, content: input.content, expected: current },
      { target: LEDGER_PATH, content: ledgerContent, expected: ledgerVersion },
    ]);
    // A Library edit can rewrite a plan, state.md, the roadmap, audits.md or a
    // finding — any of which a dev reader has memoised. Bust every namespace that
    // cached THIS file so the edit is visible on the next read, mtime tick or not.
    invalidatePath(abs);
    invalidateDevDocsIndex();

    return { mtimeMs: after.mtimeMs, sizeBytes: after.size, contentSha256: after.sha256 };
  });
}

/** The edit history for one doc, plus whether it moved outside the app since. */
export async function docHistory(relPath: string): Promise<DocHistory> {
  const abs = resolve(PROJECT_ROOT, relPath);
  const version = await devFileVersion(abs);
  const mtimeMs = version?.mtimeMs ?? 0;

  const key = ledgerKey(relPath);
  const ledger = await readLedger();
  const forPath = ledger.filter(e => ledgerKey(e.relPath) === key);
  // Keep the genuine history. The newest hash is checked separately below to
  // decide whether the CURRENT bytes can still be attributed to the app.
  const edits = forPath.slice(0, 20);

  // A second of slack: writeFile + stat aren't perfectly simultaneous.
  const lastInApp = forPath[0]?.at ?? 0;
  const latestHash = forPath[0]?.contentSha256;
  const hashMoved = Boolean(latestHash && version?.sha256 && latestHash !== version.sha256);
  const changedOutsideApp = hashMoved || (mtimeMs > 0 && mtimeMs - lastInApp > 1500);

  return { edits, changedOutsideApp, mtimeMs };
}

/** The most recent in-app edits across every doc — the "who did what" feed. */
export async function recentDocEdits(limit = 25): Promise<DocEdit[]> {
  const ledger = await readLedger();
  return ledger.slice(0, Math.max(1, Math.min(limit, 100)));
}
