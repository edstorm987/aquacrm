import "server-only";

import { MAX_IMAGE_PREVIEW_BYTES, describeFile, imageContentType, isHiddenPath } from "./fileTree";
import { hashFile } from "./codeAdapter";

/**
 * A repository read straight from GitHub, for code mode.
 *
 * The whole repository, not a curated subset. The point of code mode is that
 * it behaves like GitHub's own editor — if a file is in the repo it is in the
 * tree, and anything less means somebody hits the one file the editor decided
 * not to show and goes back to their terminal.
 *
 * Nothing here writes. Saving goes through the shared editing engine and its
 * publish path, which dry-runs by default, commits to a branch, and never
 * force-pushes.
 */

const GITHUB_API = "https://api.github.com";

export interface GitHubRepoSource {
  repository: string;
  ref: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export class GitHubNotConfigured extends Error {
  constructor() {
    // Ed's rule: everything editor-wise lives in the editor. The editor's
    // Settings tab carries an inline Connect GitHub panel (_DevEditorSetup →
    // GitHubConnectPanel) that saves AND auth-checks the token on the spot —
    // never send somebody out to the Company page for an editor concern.
    super("Connect GitHub in the editor's Settings tab — the Connect GitHub panel saves and checks the token right there — to browse and edit a repository here.");
    this.name = "GitHubNotConfigured";
  }
}

/** A typed GitHub refusal, so callers never infer semantics from prose. */
export class GitHubRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`GitHub request failed (${status}). ${message}`.trim());
    this.name = "GitHubRequestError";
  }
}

export function isGitHubNotFound(error: unknown): boolean {
  return error instanceof GitHubRequestError && error.status === 404;
}

async function githubJson<T>(source: GitHubRepoSource, path: string): Promise<T> {
  const response = await (source.fetchImpl ?? fetch)(`${GITHUB_API}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${source.token}`,
      "x-github-api-version": "2022-11-28",
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new GitHubRequestError(response.status, body.message ?? "");
  return body;
}

export interface RepoHead {
  sha: string;
  /** Set when GitHub truncated the tree, so the editor can say so. */
  truncated: boolean;
  files: Array<{ path: string; size?: number }>;
}

/**
 * The commit the ref points at, and nothing else.
 *
 * Split out of `readRepoTree` because the publish path asks this question on
 * its own — "has the branch moved since we read it?" — and answering it by
 * pulling the whole recursive tree costs a second request and a payload of
 * every path in the repository to look at one field.
 */
export async function readRepoHeadSha(source: GitHubRepoSource): Promise<string> {
  const branch = await githubJson<{ commit?: { sha?: string } }>(
    source, `/repos/${source.repository}/branches/${encodeURIComponent(source.ref)}`);
  const sha = branch.commit?.sha;
  if (!sha) throw new Error(`${source.repository} has no commit on ${source.ref}.`);
  return sha;
}

/**
 * The whole tree at a ref, in one request.
 *
 * `recursive=1` rather than walking directory by directory: a repository of
 * any size would otherwise be hundreds of round trips, and the editor would
 * feel broken long before it finished.
 */
export async function readRepoTree(source: GitHubRepoSource): Promise<RepoHead> {
  const sha = await readRepoHeadSha(source);

  const tree = await githubJson<{
    truncated?: boolean;
    tree?: Array<{ path: string; type: string; size?: number }>;
  }>(source, `/repos/${source.repository}/git/trees/${sha}?recursive=1`);

  const files = (tree.tree ?? [])
    .filter(entry => entry.type === "blob" && !isHiddenPath(entry.path))
    .map(entry => ({ path: entry.path, size: entry.size }));

  return { sha, truncated: Boolean(tree.truncated), files };
}

// ─── The draft branch, described (phase 14) ─────────────────────────────────
//
// Two more READS, for the work-lifecycle panels: "what does the draft branch
// hold that the base does not?" and "does the branch have a pull request?".
// Nothing here writes — the lifecycle tabs SHOW the state the write path
// (`repoWrite.ts` → `publishEdits`) creates; they never create it themselves.

export interface RepoComparison {
  /** Commits on the head that the base lacks. */
  aheadBy: number;
  /** Commits the base has gained since the branch left it. */
  behindBy: number;
  /**
   * The fork point — where the branch left the base. The revert path reads
   * pre-draft file contents AT this commit; blank when GitHub omitted it.
   */
  mergeBaseSha: string;
  /** Oldest first, the way GitHub answers — callers order for display. */
  commits: Array<{ sha: string; message: string; author: string; at: number; url: string }>;
  /** The aggregate CONTENT diff, per file — empty once a merge equalised them. */
  files: Array<{ path: string; status: string; additions: number; deletions: number }>;
}

/**
 * base…head — what the draft branch adds, and how far base has moved under it.
 *
 * One request answers both of the Drafts tab's questions (which files, which
 * commits), which matters because this renders on a tab click, not a build.
 */
export async function compareRepoRefs(source: GitHubRepoSource, head: string): Promise<RepoComparison> {
  const compared = await githubJson<{
    ahead_by?: number;
    behind_by?: number;
    merge_base_commit?: { sha?: string };
    commits?: Array<{ sha: string; html_url?: string; commit?: { message?: string; author?: { name?: string; date?: string } } }>;
    files?: Array<{ filename: string; status?: string; additions?: number; deletions?: number }>;
  }>(source, `/repos/${source.repository}/compare/${encodeURIComponent(source.ref)}...${encodeURIComponent(head)}`);

  return {
    aheadBy: compared.ahead_by ?? 0,
    behindBy: compared.behind_by ?? 0,
    mergeBaseSha: compared.merge_base_commit?.sha ?? "",
    commits: (compared.commits ?? []).map(entry => ({
      sha: entry.sha,
      message: entry.commit?.message ?? "",
      author: entry.commit?.author?.name ?? "",
      at: entry.commit?.author?.date ? Date.parse(entry.commit.author.date) : 0,
      url: entry.html_url ?? "",
    })),
    files: (compared.files ?? []).map(entry => ({
      path: entry.filename,
      status: entry.status ?? "modified",
      additions: entry.additions ?? 0,
      deletions: entry.deletions ?? 0,
    })),
  };
}

export interface BranchPullRequest {
  number: number;
  url: string;
  state: string;
  merged: boolean;
  updatedAt: number;
}

/**
 * Every pull request whose head is `branch`, whatever its state.
 *
 * `state=all` on purpose: the lifecycle line must say "merged" after a merge,
 * and the open-only listing `openPullRequest` uses cannot see a closed one.
 */
export async function listBranchPullRequests(source: GitHubRepoSource, branch: string): Promise<BranchPullRequest[]> {
  const owner = source.repository.split("/")[0];
  const rows = await githubJson<Array<{
    number: number; html_url?: string; state?: string; merged_at?: string | null; updated_at?: string;
  }>>(source, `/repos/${source.repository}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all`);
  return rows.map(row => ({
    number: row.number,
    url: row.html_url ?? "",
    state: row.state ?? "open",
    merged: Boolean(row.merged_at),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0,
  }));
}

export interface RepoFile {
  path: string;
  editable: boolean;
  readable?: boolean;
  kind?: "text" | "image" | "binary";
  reason?: string;
  contents?: string;
  /** A bounded data URL for a picture that can be shown but not edited. */
  dataUrl?: string;
  fingerprint?: string;
  size?: number;
}

/** One file's contents at a ref. */
export async function readRepoFile(source: GitHubRepoSource, path: string): Promise<RepoFile> {
  if (isHiddenPath(path)) {
    // Refused even if somebody asks for it directly. `.env` in a browser with
    // a save button is a credential leak, not a feature.
    return { path, editable: false, reason: "That file cannot be opened here." };
  }

  const file = await githubJson<{ content?: string; encoding?: string; size?: number }>(
    source, `/repos/${source.repository}/contents/${encodeURI(path)}?ref=${encodeURIComponent(source.ref)}`);

  const described = describeFile(path, file.size);
  if (described.kind === "image") {
    const encoded = file.encoding === "base64" && typeof file.content === "string"
      ? file.content.replace(/\s/g, "")
      : "";
    const estimatedBytes = encoded ? Math.floor((encoded.length * 3) / 4) : 0;
    const size = file.size ?? estimatedBytes;
    if (described.readable && encoded && size <= MAX_IMAGE_PREVIEW_BYTES) {
      return {
        path,
        editable: false,
        readable: true,
        kind: "image",
        reason: described.reason,
        size,
        dataUrl: `data:${imageContentType(path)};base64,${encoded}`,
      };
    }
    return {
      path,
      editable: false,
      readable: false,
      kind: "image",
      reason: described.readable
        ? "GitHub did not return this image in a form the editor can preview."
        : described.reason,
      size,
    };
  }
  if (!described.editable) {
    return {
      path,
      editable: false,
      readable: described.readable,
      kind: described.kind,
      reason: described.reason,
      size: file.size,
    };
  }

  if (file.encoding !== "base64" || typeof file.content !== "string") {
    return { path, editable: false, reason: "GitHub returned this file in a form the editor cannot read." };
  }

  const contents = Buffer.from(file.content, "base64").toString("utf-8");
  return {
    path,
    editable: true,
    readable: true,
    kind: "text",
    contents,
    // The same hash the engine checks a save against, so what the editor holds
    // and what a save is judged on cannot drift apart.
    fingerprint: hashFile(contents),
    size: file.size,
  };
}
