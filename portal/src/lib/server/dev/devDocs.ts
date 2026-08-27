import "server-only";
// Dev Docs — a read-only index of the project's OWN markdown, presented as a
// browsable folder tree. Local development reads the working tree. Production
// reads the checked-in deployment snapshot included by Next output tracing.
//
// This is the founder's internal control plane, not a tenant feature. Every
// reachable surface (sidebar, page and API/reader) delegates to the shared
// `devTeamAccessible()` decision: local fixtures still require Dev Mode, while
// production admits only the deployment's live FOUNDER_EMAIL account.
//
// Scope (Ed's call): EVERY markdown file in the portal — `docs/` (incl. the
// generated `reference/` tree), the root handoff files (CLAUDE/AGENTS/README),
// and the code-adjacent READMEs under `src/` — minus build/vendor dirs. Kept
// tidy by a folder tree rather than one flat list.
//
// Read-only by contract: this module walks and reads markdown; it never writes.

import { join, resolve, relative, basename, sep } from "node:path";

import {
  createCoalescedRefreshCache,
  memoiseByStat,
  readParsedFile,
} from "@/lib/server/dev/devMarkdownCache";
import { devTeamAccessible } from "@/lib/server/dev/devTeamAccess";
import {
  readDevWorkspaceDirectory,
  readDevWorkspaceHead,
  readDevWorkspaceSnapshot,
} from "@/lib/server/dev/devWorkspaceFiles";
import {
  CONSOLIDATED_AUTHORED_DOC_PATHS,
  consolidatedDevDocsIndex,
} from "@/lib/server/dev/devDocsConsolidation";
import { getActiveDataRealmId } from "@/server/dataRealm";
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

/** Exact and worker-suffixed build directories are never documentation. */
export function isIgnoredDevDocsDirectory(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith(".next-");
}

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

/** The compatibility name every existing Dev Team surface imports. */
export function devDocsAccessible(session: SessionPayload | null | undefined): boolean {
  return devTeamAccessible(session);
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
  try {
    const text = (await readDevWorkspaceHead(absPath, 2048)).toString("utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^#{1,3}\s+(.+?)\s*#*$/.exec(line);
      if (m) return stripInline(m[1]) || null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- scan ------------------------------------------------------------------

async function walk(absDir: string, acc: string[]): Promise<void> {
  let dirents;
  try {
    dirents = await readDevWorkspaceDirectory(absDir);
  } catch {
    return; // unreadable dir — skip, not fatal
  }
  for (const d of dirents) {
    if (d.isDirectory()) {
      if (isIgnoredDevDocsDirectory(d.name)) continue;
      await walk(join(absDir, d.name), acc);
    } else if (d.isFile() && d.name.toLowerCase().endsWith(".md")) {
      acc.push(join(absDir, d.name));
    }
  }
}

async function buildEntry(abs: string, relPath: string): Promise<DevDocEntry | null> {
  // Memoise by mtime. Generated source references are consolidated into a few
  // large volumes, so every doc can use its real first heading without the old
  // filename-only shortcut for thousands of per-source stubs.
  return memoiseByStat("docEntry", abs, async ({ mtimeMs, size }) => {
    const bareName = basename(relPath).replace(/\.md$/i, "");
    const title = (await firstHeadingTitle(abs)) ?? humaniseFilename(bareName);
    return { relPath, title, mtimeMs, sizeBytes: size };
  });
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
export const DEV_DOCS_INDEX_TTL_MS = 15_000;
const devDocsIndexCache = createCoalescedRefreshCache<string, DevDocsIndex>(DEV_DOCS_INDEX_TTL_MS);
const libraryDocsIndexCache = createCoalescedRefreshCache<string, DevDocsIndex>(DEV_DOCS_INDEX_TTL_MS);

function docsIndexCacheKey(kind: "project" | "library"): string {
  return `${getActiveDataRealmId()}:${kind}`;
}

async function buildIndex(absFiles: string[]): Promise<DevDocsIndex> {
  const built = await Promise.all(
    [...new Set(absFiles)].map(abs => buildEntry(abs, toPosix(relative(PROJECT_ROOT, abs)))),
  );
  const entries = built.filter((entry): entry is DevDocEntry => entry !== null);
  entries.sort((left, right) => right.mtimeMs - left.mtimeMs || left.relPath.localeCompare(right.relPath));
  return {
    entries,
    tree: buildDocTree(entries),
    total: entries.length,
    scannedAtMs: Date.now(),
  };
}

export async function scanDevDocs(opts: { fresh?: boolean } = {}): Promise<DevDocsIndex> {
  return devDocsIndexCache.get(docsIndexCacheKey("project"), async () => {
    const absFiles: string[] = [];
    await walk(PROJECT_ROOT, absFiles);
    return buildIndex(absFiles);
  }, opts);
}

/**
 * The founder-facing Library contains nine authored volumes and the generated
 * reference volumes. Do not walk the entire repository only to discard every
 * other Markdown entry after the scan: resolve the nine exact files and walk
 * the one generated reference directory instead.
 */
export async function scanLibraryDevDocs(opts: { fresh?: boolean } = {}): Promise<DevDocsIndex> {
  return libraryDocsIndexCache.get(docsIndexCacheKey("library"), async () => {
    const absFiles = CONSOLIDATED_AUTHORED_DOC_PATHS.map(relPath => join(PROJECT_ROOT, relPath));
    await walk(join(PROJECT_ROOT, "docs", "reference"), absFiles);
    return consolidatedDevDocsIndex(await buildIndex(absFiles));
  }, opts);
}

/** Same-process writes call this so the next navigation cannot see stale data. */
export function invalidateDevDocsIndex(): void {
  // Production overlays are realm-specific; local realms can still share the
  // working tree. Clearing every realm is the safe write contract for both.
  devDocsIndexCache.clear();
  libraryDocsIndexCache.clear();
}

/** Test-only observability for the warm/coalesced scan contract. */
export function __devDocsIndexCacheStats() {
  return devDocsIndexCache.stats();
}

export function __libraryDocsIndexCacheStats() {
  return libraryDocsIndexCache.stats();
}

export function __resetDevDocsIndexCache(): void {
  devDocsIndexCache.reset();
  libraryDocsIndexCache.reset();
}

/** Gated public entry: the index of all docs. Founder-only Dev Team access. */
export async function listDevDocs(session: SessionPayload | null | undefined): Promise<DevDocsIndex> {
  assertDevDocsAccess(session);
  return scanLibraryDevDocs();
}

export interface DevDocContent {
  relPath: string;
  title: string;
  content: string;
  mtimeMs: number;
  sizeBytes: number;
  /** Exact version token used by the editor's optimistic save guard. */
  contentSha256: string;
}

/**
 * Gated public entry: read one doc's live markdown for the in-app viewer.
 * Founder-only Dev Team access, and confined to the project — a caller-supplied
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
  if (posixRel.split("/").some(isIgnoredDevDocsDirectory)) {
    throw new Error("Outside the documentation set.");
  }

  // One snapshot keeps the bytes and optimistic-concurrency token together on
  // both the local inode and the durable production overlay.
  const snapshot = await readDevWorkspaceSnapshot(abs);
  const content = snapshot.bytes.toString("utf8");
  const bareName = basename(posixRel).replace(/\.md$/i, "");
  const title = (await firstHeadingTitle(abs)) ?? humaniseFilename(bareName);

  return {
    relPath: posixRel,
    title,
    content,
    mtimeMs: snapshot.version.mtimeMs,
    sizeBytes: snapshot.version.size,
    contentSha256: snapshot.version.sha256,
  };
}

// ---- launch blockers (Phase 3) ---------------------------------------------
// The overview's blocker strip is parsed from the current status documents,
// not hand-curated in UI code. `state.md` supplies operational blockers while
// the live checklist supplies current decisions and source defects.

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

/** Parse checkbox items from every red (blocking) checklist section. */
export function parseChecklistBlockers(markdown: string): DevDocBlocker[] {
  const out: DevDocBlocker[] = [];
  let inBlockingSection = false;
  let current: { checked: boolean; body: string } | null = null;

  const flush = () => {
    if (!current) return;
    const boldLabel = /\*\*(.+?)\*\*/.exec(current.body)?.[1];
    const cleaned = cleanBlockerText(current.body);
    const label = cleanBlockerText(boldLabel ?? cleaned.split(/\s*[—:]\s*/)[0] ?? cleaned);
    const detail = boldLabel
      ? cleanBlockerText(current.body.replace(/\*\*(.+?)\*\*/, "")).replace(/^[\s:—.–-]+/, "")
      : cleanBlockerText(cleaned.slice(label.length)).replace(/^[\s:—.–-]+/, "");
    if (label) out.push({ label, detail: detail || undefined, resolved: current.checked });
    current = null;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^(#{2,4})\s+(.+?)\s*#*$/.exec(raw);
    if (heading) {
      flush();
      inBlockingSection = heading[2].includes("🔴");
      continue;
    }

    const item = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(raw);
    if (item) {
      flush();
      if (inBlockingSection) current = { checked: item[1].toLowerCase() === "x", body: item[2] };
      continue;
    }

    if (current && /^\s{2,}\S/.test(raw)) current.body += ` ${raw.trim()}`;
  }
  flush();
  return out;
}

/** Gate-free internal read of current blocker sources (page gates before calling). */
export async function scanBlockers(): Promise<DevDocBlocker[]> {
  const [stateBlockers, checklistBlockers] = await Promise.all([
    readParsedFile("blockers:state", join(PROJECT_ROOT, "docs", "context", "state.md"), parseBlockers),
    readParsedFile(
      "blockers:checklist",
      join(PROJECT_ROOT, "docs", "development", "checklist.md"),
      parseChecklistBlockers,
    ),
  ]);
  const merged = new Map<string, DevDocBlocker>();
  for (const blocker of [...(stateBlockers ?? []), ...(checklistBlockers ?? [])]) {
    merged.set(blocker.label.toLocaleLowerCase(), blocker);
  }
  return [...merged.values()];
}
