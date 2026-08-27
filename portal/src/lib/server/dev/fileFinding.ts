import "server-only";

// ─── FILE FINDING — the skill, built ONCE ────────────────────────────────────
//
// Ed (dev-editor-finish.md, phase 15): "the librarian also needs its own thing
// … its different from the editor since librarian is for files finding make it
// a skill they can all use as well".
//
// This module IS that skill: given an agency and optionally one of its
// projects, answer "where is X / what exists about X" across the three places
// an answer can already be found — nothing here builds a new index:
//
//   • the project's mapped repository — `DevProjectRepoMap` records the walk
//     MAP already did; the full file list is re-read through the engine's own
//     `readRepoTree` (GitHub) or `readWorkspaceFiles` (the local working tree)
//     rather than a second walker;
//   • the docs library — `scanDevDocs` already indexes every markdown doc;
//   • the generated symbol reference — `docs/reference/*.md`, every exported
//     symbol with its signature, grep-able by design.
//
// Every hit says WHY it matched (`path` / `symbol` / `doc-title` / `content`),
// results are ranked and capped, and the `searched` report says what was and
// was NOT looked at — "we did not find it" and "we did not look" are different
// answers, the same honesty rule `findWordsInProject` follows.
//
// ── Who calls it ─────────────────────────────────────────────────────────────
//
// ANY assistant. The Librarian is the first consumer, the Aqua Editor AI the
// second; neither owns it. The Librarian FINDS, the editor AI EDITS — two
// assistants, one file-finding skill under both. Pure server, no UI, no chat:
// consumers decide how to present the answer (`fileFindingBrief` renders one
// plain-text form for prompts, so every assistant describes results the same
// way).
//
// ── Gates and tenancy ────────────────────────────────────────────────────────
//
// Like `scanDevDocs`, the retrieval itself is gate-free and the PUBLIC surface
// gates: whichever route or assistant calls this must hold its own gate
// (project/explorer access for a project search, or local-owner access for the
// whole-tree Librarian; the editor AI route's own checks).
// What IS enforced here — because it is tenant data, not presentation — is the
// project boundary, in the order `devProjects.ts` uses everywhere: tenant
// first, then project. A project id from another agency throws the SAME
// `project_not_found` a genuinely missing id does, so a guessed id confirms
// nothing (the `editorAiStatus` rule).
//
// ── The network rule ─────────────────────────────────────────────────────────
//
// This module touches the network in exactly one case: a GitHub-mapped project
// whose token resolves (project connection → agency connection → environment —
// the same ladder as `sourceEditTarget`). No token, no repository, or no repo
// map at all → it degrades rather than fetches: the recorded map's top-level
// directories still answer path questions, and docs + reference are always
// local. Never a silent fallback — the `searched.repo.status` names which of
// the four levels the answer came from.

import { basename, join } from "node:path";

import { memoiseByStat } from "./devMarkdownCache";
import { PROJECT_ROOT, scanDevDocs, type DevDocsIndex } from "./devDocs";
import { readDevWorkspaceDirectory, readDevWorkspaceFile } from "./devWorkspaceFiles";
import { devProjectGitHubToken, getDevProject, listDevProjects } from "@/engines/editor/server/devProjects";
import { readRepoTree } from "@/engines/editor/server/githubSource";
import { readWorkspaceFiles } from "@/engines/editor/server/workspaceFiles";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import type { DevProject } from "@/server/types";

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type FileFindingSource = "repo" | "reference" | "docs";

/** Why a hit matched — the four kinds phase 15 names. */
export type FileFindingReasonKind = "path" | "symbol" | "doc-title" | "content";

export interface FileFindingReason {
  kind: FileFindingReasonKind;
  /** The query term that hit. */
  term: string;
  /** What it hit — a basename, a symbol name, a doc title, or a line fragment. */
  detail: string;
}

export interface FileFindingHit {
  source: FileFindingSource;
  /** Repo path, reference source-file path, or doc relPath. */
  path: string;
  /** The doc's title, when the hit is a doc. */
  title?: string;
  /** Distinct query terms this hit answered. The primary rank. */
  termsMatched: number;
  score: number;
  reasons: FileFindingReason[];
}

/** Which of the four levels the repository half answered from. */
export type FileFindingRepoStatus =
  /** GitHub tree read at the project's ref — the full file list. */
  | "full-tree"
  /** The local working tree walked — a blank-repository project. */
  | "workspace"
  /** Only the recorded map's top-level directories — no token resolved, so no network. */
  | "map-only"
  /** No project given, or no (error-free) repo map recorded — docs and reference only. */
  | "none";

export interface FileFindingResult {
  query: string;
  /** The normalised terms actually searched for. */
  terms: string[];
  hits: FileFindingHit[];
  /** True when more matched than `limit` allowed back. */
  capped: boolean;
  limit: number;
  /** Set when the query held nothing searchable. `hits` is empty. */
  reason?: "empty-query";
  detail?: string;
  /** What was searched and what was not — never silent. */
  searched: {
    repo: { status: FileFindingRepoStatus; detail: string; filesSearched: number };
    docs: { searched: boolean; total: number; detail?: string };
    reference: { searched: boolean; pages: number; detail?: string };
  };
}

export interface FindFilesInput {
  agencyId: string;
  /** One of this agency's projects. Absent → docs + reference only. */
  projectId?: string;
  /** Free words: "where is the checkout page", "aqua tag bridge", a filename… */
  query: string;
  /** Hits returned, 1–50. Default 20. */
  limit?: number;
}

/**
 * Test seams, `SourceEditDeps`-style. Production passes none: without these a
 * GitHub-mapped project cannot be driven in-process except by planting a real
 * encrypted connection, and the docs/reference reads would walk the real tree.
 */
export interface FileFindingDeps {
  readTree?: typeof readRepoTree;
  readWorkspace?: typeof readWorkspaceFiles;
  /** Defaults to `process.cwd()` — the same convention as `mapProject`. */
  workspaceRoot?: string;
  /** Overrides vault/env token resolution. */
  githubToken?: string;
  /** False for delegated requests: require this project's bound connection. */
  allowSharedCredentials?: boolean;
  scanDocs?: () => Promise<DevDocsIndex>;
  /** Overrides the `docs/reference` directory, for fixture pages. */
  referenceDir?: string;
  /** False on delegated project surfaces: never fall through to process.cwd(). */
  allowWorkspace?: boolean;
  /** False on delegated project surfaces: Aqua's own docs/reference are internal. */
  includeInternalSources?: boolean;
}

// ─── Tuning ──────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_TERMS = 8;
const MAX_REASONS_PER_HIT = 6;
const MAX_DETAIL_LENGTH = 160;

/**
 * What a hit is worth, by what matched. A symbol NAMED like the query is the
 * best "where is X" answer there is; a file or doc named like it is nearly as
 * good; a passing mention in a signature or summary is evidence, not an
 * answer. Per term a candidate scores its BEST kind, so ten weak mentions in
 * one file never outrank one file that is actually called the thing.
 */
const WEIGHTS = {
  repoPathBasename: 6,
  referencePathBasename: 6,
  /** basename minus extension IS the term — `publish.ts` for "publish". */
  exactBasenameBonus: 2,
  symbol: 5,
  repoPath: 4,
  referencePath: 4,
  docTitle: 4,
  docPath: 3,
  mapDirectory: 3,
  content: 1,
} as const;

/** Repo answers outrank code-reference answers outrank docs, on a tie. */
const SOURCE_RANK: Record<FileFindingSource, number> = { repo: 0, reference: 1, docs: 2 };

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * The words a "where is…" question is made of, which never name the thing
 * being looked for. Small on purpose — a term this list wrongly ate would be
 * a silent miss, so only unambiguous connective words belong here.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "of", "in", "on", "at", "to", "for",
  "and", "or", "where", "what", "which", "who", "how", "does", "do", "did",
  "it", "its", "my", "our", "this", "that", "with", "about", "find", "me",
]);

/**
 * Free words → lowercase terms. Dots and slashes survive (people paste
 * filenames and paths); question-shaped filler ("where is the…"), trailing
 * punctuation and one-character fragments do not — they match everything and
 * mean nothing.
 */
export function queryTerms(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of (query ?? "").toLowerCase().split(/[\s,;'"()]+/)) {
    const term = raw.trim().replace(/^[?!:.…]+|[?!:…]+$/g, "").replace(/\.+$/g, "");
    if (term.length >= 2 && !STOPWORDS.has(term)) seen.add(term);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

// ─── Candidates ──────────────────────────────────────────────────────────────

interface Candidate {
  source: FileFindingSource;
  path: string;
  title?: string;
  /** term → best weight seen. */
  perTerm: Map<string, number>;
  reasons: FileFindingReason[];
  reasonKeys: Set<string>;
}

function truncateDetail(detail: string): string {
  const clean = detail.replace(/\s+/g, " ").trim();
  return clean.length > MAX_DETAIL_LENGTH ? `${clean.slice(0, MAX_DETAIL_LENGTH - 1)}…` : clean;
}


/** The basename weight, with the exact-name bonus when the file IS the term. */
function basenameWeight(base: string, term: string, weight: number): number {
  const stem = base.replace(/\.[^.]+$/, "");
  return stem === term ? weight + WEIGHTS.exactBasenameBonus : weight;
}

/**
 * Word-boundary matching for CONTENT — and only content. "live" as a substring
 * matches "delivery" and "lives", which is how the verify's canonical question
 * ("where does publish live") ranked reference prose above `publish.ts` itself.
 * Paths, symbols and titles keep substring matching on purpose: "publish"
 * SHOULD match `publishWordsEdit` and `publishing-checklist.md`.
 */
function contentMatches(text: string, term: string): boolean {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
}

class CandidateSet {
  private map = new Map<string, Candidate>();

  record(
    source: FileFindingSource,
    path: string,
    term: string,
    kind: FileFindingReasonKind,
    weight: number,
    detail: string,
    title?: string,
  ): void {
    const key = `${source}\u0000${path}`;
    let candidate = this.map.get(key);
    if (!candidate) {
      candidate = { source, path, title, perTerm: new Map(), reasons: [], reasonKeys: new Set() };
      this.map.set(key, candidate);
    }
    if (title && !candidate.title) candidate.title = title;
    const best = candidate.perTerm.get(term) ?? 0;
    if (weight > best) candidate.perTerm.set(term, weight);
    const truncated = truncateDetail(detail);
    const reasonKey = `${kind}\u0000${truncated}`;
    if (!candidate.reasonKeys.has(reasonKey) && candidate.reasons.length < MAX_REASONS_PER_HIT) {
      candidate.reasonKeys.add(reasonKey);
      candidate.reasons.push({ kind, term, detail: truncated });
    }
  }

  /**
   * Ranked: most terms answered BY REAL SIGNALS first — a term matched only in
   * prose (weight 1) counts for the score but not for the primary sort, so a
   * content-grazed mention of question filler can never outrank the file whose
   * NAME answers the question. Then score, then repo → reference → docs, then
   * path.
   */
  ranked(): FileFindingHit[] {
    const hits: FileFindingHit[] = [];
    const strongOf = new Map<FileFindingHit, number>();
    for (const c of this.map.values()) {
      let score = 0;
      let strongTerms = 0;
      for (const weight of c.perTerm.values()) {
        score += weight;
        if (weight > WEIGHTS.content) strongTerms += 1;
      }
      const hit: FileFindingHit = {
        source: c.source,
        path: c.path,
        ...(c.title ? { title: c.title } : {}),
        termsMatched: c.perTerm.size,
        score,
        reasons: c.reasons,
      };
      hits.push(hit);
      strongOf.set(hit, strongTerms);
    }
    hits.sort((a, b) =>
      (strongOf.get(b) ?? 0) - (strongOf.get(a) ?? 0)
      || b.termsMatched - a.termsMatched
      || b.score - a.score
      || SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
      || a.path.localeCompare(b.path));
    return hits;
  }
}

// ─── The repository half ─────────────────────────────────────────────────────

/**
 * The project, or the refusal — tenant FIRST, the `devProjects` order.
 * `getDevProject` compares `agencyId` before returning, so another agency's
 * project id and a made-up one throw the same error: no existence oracle.
 */
function assertProject(agencyId: string, projectId: string): DevProject {
  const project = getDevProject(agencyId, projectId.trim());
  if (!project) throw new Error("project_not_found");
  return project;
}

/**
 * The same token ladder as `sourceEditTarget`, minus the throw: FIND degrades
 * where EDIT refuses, because a missing token still leaves the recorded map,
 * the docs and the reference able to answer.
 */
function resolveRepoToken(agencyId: string, project: DevProject, deps: FileFindingDeps): string | undefined {
  return deps.githubToken
    || devProjectGitHubToken(agencyId, project)
    || (deps.allowSharedCredentials === false
      ? undefined
      : resolveIntegrationValues(agencyId, "github").token || process.env.GITHUB_TOKEN?.trim())
    || undefined;
}

interface RepoListing {
  status: FileFindingRepoStatus;
  detail: string;
  /** Full file paths, when a tree was actually read. */
  paths: string[];
  /** Top-level directory names, when only the recorded map answers. */
  directories: string[];
}

async function listRepoFiles(
  agencyId: string,
  project: DevProject | null,
  deps: FileFindingDeps,
): Promise<RepoListing> {
  if (!project) {
    return { status: "none", detail: "No project given, so no repository was searched.", paths: [], directories: [] };
  }
  const repoMap = project.map?.repo;
  if (!repoMap || repoMap.error) {
    const internalFallback = deps.includeInternalSources === false
      ? "No project repository files were searched."
      : "Docs and the reference were still searched.";
    return {
      status: "none",
      detail: repoMap?.error
        ? `The last Map could not read the repository (${repoMap.error}). ${internalFallback}`
        : `This project has no repository map yet — press Map. ${internalFallback}`,
      paths: [],
      directories: [],
    };
  }

  // A blank repository IS the local working tree — the same rule the editor
  // uses. Local disk, never the network.
  if (repoMap.source === "workspace" || !project.repository) {
    if (deps.allowWorkspace === false) {
      return {
        status: "none",
        detail: "This project uses the local working tree, which is available only in the owner's local workspace.",
        paths: [],
        directories: [],
      };
    }
    const files = await (deps.readWorkspace ?? readWorkspaceFiles)(deps.workspaceRoot ?? process.cwd())
      .catch(() => null);
    if (!files) {
      return {
        status: "map-only",
        detail: "The working tree could not be walked, so only the recorded map's directories were searched.",
        paths: [],
        directories: repoMap.directories,
      };
    }
    return {
      status: "workspace",
      detail: `The local working tree was walked — ${files.length} files.`,
      paths: files.map(file => file.path),
      directories: [],
    };
  }

  const token = resolveRepoToken(agencyId, project, deps);
  if (!token) {
    // THE network rule: no token, no fetch. The recorded map still answers.
    return {
      status: "map-only",
      detail: "No GitHub token resolves for this project, so nothing was fetched — only the recorded map's top-level directories were searched. Connect GitHub in the editor's Settings tab for the full tree.",
      paths: [],
      directories: repoMap.directories,
    };
  }

  try {
    const head = await (deps.readTree ?? readRepoTree)({
      repository: project.repository,
      ref: project.ref || "main",
      token,
    });
    return {
      status: "full-tree",
      detail: `${project.repository} read at ${project.ref || "main"} — ${head.files.length} files${head.truncated ? " (GitHub truncated the list, so part of the repository was never offered)" : ""}.`,
      paths: head.files.map(file => file.path),
      directories: [],
    };
  } catch (error) {
    return {
      status: "map-only",
      detail: `${project.repository} could not be read (${error instanceof Error ? error.message : "unknown error"}), so only the recorded map's top-level directories were searched.`,
      paths: [],
      directories: repoMap.directories,
    };
  }
}

// ─── The reference half ──────────────────────────────────────────────────────

/** One greppable fact from a generated reference page. */
interface ReferenceEntry {
  /** The source file the fact is about. */
  file: string;
  /** The exported symbol's name, when the line is a symbol line. */
  symbol?: string;
  /** The whole line, for content matching. */
  text: string;
}

/** Pure navigation — nothing in it locates code. */
const REFERENCE_SKIP = new Set(["00-index.md"]);

/**
 * Parse one generated reference page into greppable entries. Two shapes exist
 * and both are handled: the consolidated volume pages (` ### `path` ` headings
 * over ``- `symbol(...)` — summary`` lines) and `files-index.md`
 * (``- [`path`](volume.md#anchor) — summary`` rows). Anything else contributes
 * nothing rather than erroring — the pages are generated, and a format drift
 * should degrade retrieval, not break it.
 */
export function parseReferencePage(markdown: string): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  let currentFile = "";
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^#{2,4}\s+`([^`]+)`\s*$/.exec(raw);
    if (heading) {
      currentFile = heading[1];
      continue;
    }
    const indexRow = /^-\s+\[`([^`]+)`\]\([^)]*\)\s*(.*)$/.exec(raw);
    if (indexRow) {
      entries.push({ file: indexRow[1], text: indexRow[2] || indexRow[1] });
      continue;
    }
    if (!currentFile) continue;
    const symbolRow = /^-\s+`([^`]+)`(.*)$/.exec(raw);
    if (!symbolRow) continue;
    entries.push({
      file: currentFile,
      symbol: symbolNameFromSignature(symbolRow[1]),
      text: `${symbolRow[1]}${symbolRow[2] ?? ""}`,
    });
  }
  return entries;
}

/** `async findWordsInProject(input: …)` → `findWordsInProject`; `interface Foo (8 members)` → `Foo`. */
function symbolNameFromSignature(signature: string): string | undefined {
  const match = /^(?:async\s+|abstract\s+|export\s+)*(?:function\s+|interface\s+|type\s+|class\s+|const\s+|enum\s+|let\s+|var\s+)?([A-Za-z_$][\w$]*)/
    .exec(signature.trim());
  return match?.[1];
}

async function readReferenceEntries(deps: FileFindingDeps): Promise<{ entries: ReferenceEntry[]; pages: number; detail?: string }> {
  const dir = deps.referenceDir ?? join(PROJECT_ROOT, "docs", "reference");
  let names: string[];
  try {
    const dirents = await readDevWorkspaceDirectory(dir);
    names = dirents
      .filter(d => d.isFile() && d.name.toLowerCase().endsWith(".md") && !REFERENCE_SKIP.has(d.name))
      .map(d => d.name)
      .sort();
  } catch {
    return { entries: [], pages: 0, detail: "docs/reference could not be read — run the reference generators." };
  }
  const entries: ReferenceEntry[] = [];
  let pages = 0;
  for (const name of names) {
    // Memoised by mtime — ~1MB of generated markdown parses once, not per query.
    const parsed = await memoiseByStat("fileFindingReference", join(dir, name), async () =>
      parseReferencePage(await readDevWorkspaceFile(join(dir, name), "utf8")));
    if (!parsed) continue;
    pages += 1;
    entries.push(...parsed);
  }
  return { entries, pages };
}

// ─── The skill ───────────────────────────────────────────────────────────────

/**
 * Answer "where is X / what exists about X" for one agency, optionally scoped
 * to one of its projects.
 *
 * Tenant first, then project — a foreign or unknown `projectId` throws
 * `project_not_found` before anything is read. The caller gates WHO may ask
 * (this module is pure retrieval, `scanDevDocs`-style); this module guards
 * WHOSE repository answers.
 *
 * Never touches the network unless a GitHub-mapped project's token resolves —
 * see the module header for the degrade ladder, and `result.searched` for
 * which rung answered.
 */
export async function findFiles(input: FindFilesInput, deps: FileFindingDeps = {}): Promise<FileFindingResult> {
  // Number.isFinite, not ??: NaN passes ?? and then poisons the clamp into
  // hits.slice(0, NaN) — zero results with no reason (found by adversarial
  // verify). A non-finite limit means the caller made a mistake; answer with
  // the default rather than with silence.
  const requestedLimit = Number.isFinite(input.limit as number) ? Math.floor(input.limit as number) : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));
  const terms = queryTerms(input.query);

  // Tenant check FIRST — before the empty-query early return, so a foreign
  // project id is refused identically however the rest of the call looks.
  const project = input.projectId?.trim() ? assertProject(input.agencyId, input.projectId) : null;

  if (terms.length === 0) {
    return {
      query: input.query ?? "",
      terms,
      hits: [],
      capped: false,
      limit,
      reason: "empty-query",
      detail: "Nothing searchable in the query — give it at least one word of two or more characters.",
      searched: {
        repo: { status: "none", detail: "Nothing was searched.", filesSearched: 0 },
        docs: { searched: false, total: 0, detail: "Nothing was searched." },
        reference: { searched: false, pages: 0, detail: "Nothing was searched." },
      },
    };
  }

  const candidates = new CandidateSet();

  // ── Repository ──
  const repo = await listRepoFiles(input.agencyId, project, deps);
  for (const path of repo.paths) {
    const base = basename(path).toLowerCase();
    const lower = path.toLowerCase();
    for (const term of terms) {
      if (base.includes(term)) {
        candidates.record("repo", path, term, "path", basenameWeight(base, term, WEIGHTS.repoPathBasename), basename(path));
      } else if (lower.includes(term)) {
        candidates.record("repo", path, term, "path", WEIGHTS.repoPath, path);
      }
    }
  }
  for (const dir of repo.directories) {
    const lower = dir.toLowerCase();
    for (const term of terms) {
      if (lower.includes(term)) {
        candidates.record("repo", dir, term, "path", WEIGHTS.mapDirectory, `${dir}/ — top-level directory recorded by the last Map`);
      }
    }
  }

  // ── Docs library ──
  let docsReport: FileFindingResult["searched"]["docs"];
  if (deps.includeInternalSources === false) {
    docsReport = { searched: false, total: 0, detail: "Aqua's internal docs are outside this project grant." };
  } else {
    try {
      const index = await (deps.scanDocs ?? scanDevDocs)();
      for (const entry of index.entries) {
        const title = entry.title.toLowerCase();
        const relPath = entry.relPath.toLowerCase();
        for (const term of terms) {
          if (title.includes(term)) {
            candidates.record("docs", entry.relPath, term, "doc-title", WEIGHTS.docTitle, entry.title, entry.title);
          } else if (relPath.includes(term)) {
            candidates.record("docs", entry.relPath, term, "path", WEIGHTS.docPath, entry.relPath, entry.title);
          }
        }
      }
      docsReport = { searched: true, total: index.total };
    } catch (error) {
      docsReport = {
        searched: false,
        total: 0,
        detail: `The docs library could not be scanned (${error instanceof Error ? error.message : "unknown error"}).`,
      };
    }
  }

  // ── Generated reference ──
  const reference = deps.includeInternalSources === false
    ? { entries: [] as ReferenceEntry[], pages: 0, detail: "Aqua's internal reference is outside this project grant." }
    : await readReferenceEntries(deps);
  const referencePathsMatched = new Set<string>();
  for (const entry of reference.entries) {
    const symbol = entry.symbol?.toLowerCase() ?? "";
    const text = entry.text.toLowerCase();
    for (const term of terms) {
      if (symbol && symbol.includes(term)) {
        candidates.record("reference", entry.file, term, "symbol", WEIGHTS.symbol, entry.symbol!);
      } else if (contentMatches(text, term)) {
        candidates.record("reference", entry.file, term, "content", WEIGHTS.content, entry.text);
      }
      // The file's own path answers too, once per file+term.
      const pathKey = `${entry.file}\u0000${term}`;
      if (!referencePathsMatched.has(pathKey)) {
        const base = basename(entry.file).toLowerCase();
        const lower = entry.file.toLowerCase();
        if (base.includes(term)) {
          referencePathsMatched.add(pathKey);
          candidates.record("reference", entry.file, term, "path", basenameWeight(base, term, WEIGHTS.referencePathBasename), basename(entry.file));
        } else if (lower.includes(term)) {
          referencePathsMatched.add(pathKey);
          candidates.record("reference", entry.file, term, "path", WEIGHTS.referencePath, entry.file);
        }
      }
    }
  }

  const ranked = candidates.ranked();
  return {
    query: input.query,
    terms,
    hits: ranked.slice(0, limit),
    capped: ranked.length > limit,
    limit,
    searched: {
      repo: {
        status: repo.status,
        detail: repo.detail,
        filesSearched: repo.paths.length + repo.directories.length,
      },
      docs: docsReport,
      reference: {
        searched: reference.pages > 0,
        pages: reference.pages,
        ...(reference.detail ? { detail: reference.detail } : {}),
      },
    },
  };
}

// ─── The world — what the skill can see, before any question is asked ────────

/** What one project's RECORDED map says its repository half would be. No network. */
export type FileFindingWorldRepo =
  /** A mapped GitHub repository — the full tree answers when a token resolves at query time. */
  | "github"
  /** A blank-repository project — the local working tree answers. */
  | "workspace"
  /** The last Map failed; only docs and the reference would answer. */
  | "map-error"
  /** Never mapped — press Map. Only docs and the reference would answer. */
  | "unmapped";

export interface FileFindingWorldProject {
  id: string;
  name: string;
  repo: FileFindingWorldRepo;
}

export interface FileFindingWorld {
  /** Markdown docs the library can answer from. `detail` set when the scan failed. */
  docs: { total: number; detail?: string };
  /** Generated symbol-reference pages. `detail` set when the directory is unreadable. */
  reference: { pages: number; detail?: string };
  /** THIS agency's projects, each with what its recorded map says. Tenant-scoped. */
  projects: FileFindingWorldProject[];
}

function worldRepoStatus(project: DevProject): FileFindingWorldRepo {
  const repoMap = project.map?.repo;
  if (!repoMap) return "unmapped";
  if (repoMap.error) return "map-error";
  if (repoMap.source === "workspace" || !project.repository) return "workspace";
  return "github";
}

/**
 * The skill's view of the world for one agency, with no question asked yet —
 * what a consumer briefs FROM before its first find. This is what replaced the
 * Librarian's business-snapshot briefing (`buildAssistantBusinessContext`):
 * the Librarian's world is docs, reference pages and projects, not clients and
 * pipelines.
 *
 * Deliberately cheap and network-free: docs and reference counts are local
 * (and cached by mtime), and each project reports only what its RECORDED map
 * says — the token ladder is not walked until an actual `findFiles` call.
 */
export async function fileFindingWorld(agencyId: string, deps: FileFindingDeps = {}): Promise<FileFindingWorld> {
  let docs: FileFindingWorld["docs"];
  try {
    const index = await (deps.scanDocs ?? scanDevDocs)();
    docs = { total: index.total };
  } catch (error) {
    docs = {
      total: 0,
      detail: `The docs library could not be scanned (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }
  const reference = await readReferenceEntries(deps);
  return {
    docs,
    reference: { pages: reference.pages, ...(reference.detail ? { detail: reference.detail } : {}) },
    projects: listDevProjects(agencyId).map(project => ({
      id: project.id,
      name: project.name,
      repo: worldRepoStatus(project),
    })),
  };
}

// ─── One plain-text form, for prompts ────────────────────────────────────────

/**
 * The result as deterministic plain text, for dropping into any assistant's
 * context. One shape for every consumer, so the Librarian and the editor AI
 * describe the same finding the same way — the "one skill under both" half of
 * Ed's ask made visible.
 */
export function fileFindingBrief(result: FileFindingResult): string {
  const lines: string[] = [];
  const where = [
    `repo: ${result.searched.repo.status}`,
    result.searched.docs.searched ? `docs: ${result.searched.docs.total}` : "docs: unavailable",
    result.searched.reference.searched ? `reference: ${result.searched.reference.pages} pages` : "reference: unavailable",
  ].join(" · ");
  lines.push(`FILE FINDING — "${result.query}" — ${result.hits.length} hit${result.hits.length === 1 ? "" : "s"}${result.capped ? ` (capped at ${result.limit})` : ""} [${where}]`);
  if (result.reason === "empty-query") {
    lines.push(result.detail ?? "Nothing searchable in the query.");
    return lines.join("\n");
  }
  if (result.hits.length === 0) {
    lines.push("Nothing matched. Not found is only meaningful for what was actually searched — see the sources above.");
  }
  result.hits.forEach((hit, index) => {
    const why = hit.reasons.map(reason => `${reason.kind}: ${reason.detail}`).join("; ");
    lines.push(`${index + 1}. ${hit.path} [${hit.source}]${hit.title && hit.title !== hit.path ? ` — ${hit.title}` : ""} — ${why}`);
  });
  return lines.join("\n");
}
