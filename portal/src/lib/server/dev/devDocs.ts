import "server-only";
// Dev Docs — a read-only, Dev-Mode-gated index of the project's OWN markdown,
// read LIVE off the local filesystem and presented as a browsable folder tree.
//
// This is dev tooling. It only ever runs locally, because every reachable
// surface (the sidebar item, the route, and the public entry points here)
// gates on `canUseDevMode()` + `effectiveRole(session).isFounder`. That gate is
// what makes reading the repo's docs off disk safe: there is no
// durable/serverless filesystem in play, only a founder's local sandbox.
//
// Scope (Ed's call): EVERY markdown file in the portal — `docs/` (incl. the
// generated `reference/` tree), the root handoff files (CLAUDE/AGENTS/README),
// and the code-adjacent READMEs under `src/` — minus build/vendor dirs. Kept
// tidy by a folder tree rather than one flat list.
//
// Read-only by contract: this module walks and reads markdown; it never writes.

import { readdir, stat, open, readFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join, resolve, relative, basename, sep } from "node:path";

import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import type { SessionPayload } from "@/server/types";

// The portal root. Server code here resolves disk paths from `process.cwd()`
// (the portal root) — the same convention as storage.ts. All doc paths are
// relative to this, so the tree mirrors the real folder layout.
export const PROJECT_ROOT = resolve(process.cwd());

// Directories we never descend into — vendored deps and build output, not docs.
const IGNORED_DIRS = new Set([
  "node_modules", ".next", ".git", ".data", ".turbo", ".vercel",
  ".cache", "coverage", "dist", "build", ".claude",
]);

// The generated per-source-file docs (~1,700). Their titles come from the
// filename (they mirror source paths, shown in full on the row) rather than a
// file read, so the scan stays fast.
const GENERATED_PREFIX = "docs/reference/files/";

export interface DevDocEntry {
  /** Posix path relative to the portal root, e.g. "docs/development/plans/dev-docs.md". The stable id. */
  relPath: string;
  title: string;
  mtimeMs: number;
  sizeBytes: number;
}

/** A node in the folder tree: either a folder (has children) or a doc (has entry). */
export interface DevDocTreeNode {
  name: string;   // segment name — folder or file
  path: string;   // full relPath (file) or folder path
  isDir: boolean;
  count: number;  // docs under this node (1 for a file)
  newestMtimeMs: number;
  entry?: DevDocEntry;        // files only
  children?: DevDocTreeNode[]; // folders only
}

export interface DevDocsIndex {
  entries: DevDocEntry[];   // flat, newest-edited first (for the "recently edited" feed)
  tree: DevDocTreeNode[];   // the folder tree (for browsing)
  total: number;
  scannedAtMs: number;
}

// ---- gate ------------------------------------------------------------------

/** The one predicate every reachable Dev Docs surface asks. Dev Mode + founder. */
export function devDocsAccessible(session: SessionPayload | null | undefined): boolean {
  return canUseDevMode() && effectiveRole(session).isFounder;
}

export function assertDevDocsAccess(session: SessionPayload | null | undefined): void {
  if (!devDocsAccessible(session)) {
    throw new Error("Dev Docs is not available in this context.");
  }
}

// ---- display + scan helpers ------------------------------------------------

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function humaniseFilename(base: string): string {
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function stripInline(s: string): string {
  return s.replace(/[`*_]+/g, "").trim();
}

/** Best-effort first ATX heading from the file's opening bytes; null if none. */
async function firstHeadingTitle(absPath: string): Promise<string | null> {
  let fh: FileHandle | undefined;
  try {
    fh = await open(absPath, "r");
    const buf = Buffer.alloc(2048);
    const { bytesRead } = await fh.read(buf, 0, 2048, 0);
    const text = buf.subarray(0, bytesRead).toString("utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^#{1,3}\s+(.+?)\s*#*$/.exec(line);
      if (m) return stripInline(m[1]) || null;
    }
    return null;
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

// ---- scan ------------------------------------------------------------------

async function walk(absDir: string, acc: string[]): Promise<void> {
  let dirents;
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return; // unreadable dir — skip, not fatal
  }
  for (const d of dirents) {
    if (d.isDirectory()) {
      if (IGNORED_DIRS.has(d.name)) continue;
      await walk(join(absDir, d.name), acc);
    } else if (d.isFile() && d.name.toLowerCase().endsWith(".md")) {
      acc.push(join(absDir, d.name));
    }
  }
}

async function buildEntry(abs: string, relPath: string): Promise<DevDocEntry | null> {
  let st;
  try {
    st = await stat(abs);
  } catch {
    return null;
  }
  const bareName = basename(relPath).replace(/\.md$/i, "");
  const derived = relPath.startsWith(GENERATED_PREFIX);
  const title = derived
    ? bareName
    : (await firstHeadingTitle(abs)) ?? humaniseFilename(bareName);
  return { relPath, title, mtimeMs: st.mtimeMs, sizeBytes: st.size };
}

/** Build the folder tree from a flat entry list. Folders first, then newest-first. */
export function buildDocTree(entries: DevDocEntry[]): DevDocTreeNode[] {
  const root: DevDocTreeNode = { name: "", path: "", isDir: true, count: 0, newestMtimeMs: 0, children: [] };
  for (const e of entries) {
    const parts = e.relPath.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1;
      const name = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      if (isFile) {
        node.children!.push({ name, path, isDir: false, count: 1, newestMtimeMs: e.mtimeMs, entry: e });
      } else {
        let dir = node.children!.find(c => c.isDir && c.name === name);
        if (!dir) {
          dir = { name, path, isDir: true, count: 0, newestMtimeMs: 0, children: [] };
          node.children!.push(dir);
        }
        node = dir;
      }
    }
  }
  const finalize = (n: DevDocTreeNode): void => {
    if (!n.isDir || !n.children) return;
    for (const c of n.children) finalize(c);
    n.count = n.children.reduce((s, c) => s + c.count, 0);
    n.newestMtimeMs = n.children.reduce((m, c) => Math.max(m, c.newestMtimeMs), 0);
    n.children.sort(
      (a, b) =>
        (a.isDir === b.isDir ? 0 : a.isDir ? -1 : 1) ||
        b.newestMtimeMs - a.newestMtimeMs ||
        a.name.localeCompare(b.name),
    );
  };
  finalize(root);
  return root.children!;
}

/**
 * Walk the portal for every markdown doc (minus vendor/build dirs) and return
 * a flat newest-first list plus the folder tree. Gate-free (the pure scan) —
 * the gate lives on the public entry `listDevDocs()` and on the route.
 */
export async function scanDevDocs(): Promise<DevDocsIndex> {
  const absFiles: string[] = [];
  await walk(PROJECT_ROOT, absFiles);

  const built = await Promise.all(
    absFiles.map(abs => buildEntry(abs, toPosix(relative(PROJECT_ROOT, abs)))),
  );
  const entries = built.filter((e): e is DevDocEntry => e !== null);
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs || a.relPath.localeCompare(b.relPath));

  return {
    entries,
    tree: buildDocTree(entries),
    total: entries.length,
    scannedAtMs: Date.now(),
  };
}

/** Gated public entry: the index of all docs. Founder + Dev Mode only. */
export async function listDevDocs(session: SessionPayload | null | undefined): Promise<DevDocsIndex> {
  assertDevDocsAccess(session);
  return scanDevDocs();
}

export interface DevDocContent {
  relPath: string;
  title: string;
  content: string;
  mtimeMs: number;
  sizeBytes: number;
}

/**
 * Gated public entry: read one doc's live markdown for the in-app viewer.
 * Founder + Dev Mode only, and confined to the project — a caller-supplied
 * relPath cannot escape the portal root (traversal rejected), cannot dip into a
 * vendor/build dir, and must be `.md`.
 */
export async function readDevDoc(
  session: SessionPayload | null | undefined,
  relPath: string,
): Promise<DevDocContent> {
  assertDevDocsAccess(session);

  const abs = resolve(PROJECT_ROOT, relPath);
  // Confine to the project tree — reject `..`/absolute escapes and non-markdown.
  if (abs !== PROJECT_ROOT && !abs.startsWith(PROJECT_ROOT + sep)) {
    throw new Error("Path escapes the project root.");
  }
  if (!abs.toLowerCase().endsWith(".md")) {
    throw new Error("Not a markdown doc.");
  }
  const posixRel = toPosix(relative(PROJECT_ROOT, abs));
  if (posixRel.split("/").some(seg => IGNORED_DIRS.has(seg))) {
    throw new Error("Outside the documentation set.");
  }

  const st = await stat(abs); // throws for a missing path
  if (!st.isFile()) throw new Error("Not a file.");

  const content = await readFile(abs, "utf8");
  const bareName = basename(posixRel).replace(/\.md$/i, "");
  const derived = posixRel.startsWith(GENERATED_PREFIX);
  const title = derived
    ? bareName
    : (await firstHeadingTitle(abs)) ?? humaniseFilename(bareName);

  return { relPath: posixRel, title, content, mtimeMs: st.mtimeMs, sizeBytes: st.size };
}

// ---- launch blockers (Phase 3) ---------------------------------------------
// Ed's call: the overview's blocker strip is PARSED from state.md, not
// hand-curated — so it self-updates as the shared brain does.

export interface DevDocBlocker {
  label: string;
  detail?: string;
  resolved: boolean;
}

function cleanBlockerText(s: string): string {
  return s
    .replace(/~~/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](href) → text
    .replace(/[`*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse the `## Blockers` section of state.md into structured items. Resolved =
 * struck-through, ticked (✅), or the label says cleared/resolved/done. The
 * label is the part before the em-dash; the rest is the detail.
 */
export function parseBlockers(markdown: string): DevDocBlocker[] {
  const out: DevDocBlocker[] = [];
  let inSection = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^(#{2,4})\s+(.+?)\s*#*$/.exec(raw);
    if (heading) {
      inSection = /^blockers?\b/i.test(heading[2].trim());
      continue;
    }
    if (!inSection) continue;
    const li = /^\s*[-*]\s+(.+)$/.exec(raw);
    if (!li) continue;
    const cleaned = cleanBlockerText(li[1]);
    if (!cleaned) continue;
    const [label, ...rest] = cleaned.split(/\s*—\s*/); // em-dash separates label — detail
    // Strong markers (strike / tick) count anywhere; the words only in the
    // label, so a "…not done yet" detail can't flip an open blocker to resolved.
    const resolved =
      li[1].includes("~~") || li[1].includes("✅") || /\b(cleared|resolved|done)\b/i.test(label);
    out.push({ label: label.trim(), detail: rest.join(" — ").trim() || undefined, resolved });
  }
  return out;
}

/** Gate-free internal read of state.md's blockers (page gates before calling). */
export async function scanBlockers(): Promise<DevDocBlocker[]> {
  try {
    const raw = await readFile(join(PROJECT_ROOT, "docs", "context", "state.md"), "utf8");
    return parseBlockers(raw);
  } catch {
    return [];
  }
}
