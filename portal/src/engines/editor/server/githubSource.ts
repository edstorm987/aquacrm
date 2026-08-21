import "server-only";

import { MAX_PREVIEW_BYTES, describeFile, imageContentType, isHiddenPath, isImagePath } from "./fileTree";
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
    super("Connect GitHub in Company → Connections to browse and edit a repository here.");
    this.name = "GitHubNotConfigured";
  }
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
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}). ${body.message ?? ""}`.trim());
  return body;
}

export interface RepoHead {
  sha: string;
  /** Set when GitHub truncated the tree, so the editor can say so. */
  truncated: boolean;
  files: Array<{ path: string; size?: number }>;
}

/**
 * The whole tree at a ref, in one request.
 *
 * `recursive=1` rather than walking directory by directory: a repository of
 * any size would otherwise be hundreds of round trips, and the editor would
 * feel broken long before it finished.
 */
export async function readRepoTree(source: GitHubRepoSource): Promise<RepoHead> {
  const branch = await githubJson<{ commit?: { sha?: string } }>(
    source, `/repos/${source.repository}/branches/${encodeURIComponent(source.ref)}`);
  const sha = branch.commit?.sha;
  if (!sha) throw new Error(`${source.repository} has no commit on ${source.ref}.`);

  const tree = await githubJson<{
    truncated?: boolean;
    tree?: Array<{ path: string; type: string; size?: number }>;
  }>(source, `/repos/${source.repository}/git/trees/${sha}?recursive=1`);

  const files = (tree.tree ?? [])
    .filter(entry => entry.type === "blob" && !isHiddenPath(entry.path))
    .map(entry => ({ path: entry.path, size: entry.size }));

  return { sha, truncated: Boolean(tree.truncated), files };
}

export interface RepoFile {
  path: string;
  editable: boolean;
  reason?: string;
  contents?: string;
  fingerprint?: string;
  size?: number;
  /** A `data:` URL for files that render as a picture instead of text. */
  preview?: string;
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
  if (!described.editable) {
    // An image is not editable, but it is showable. GitHub already handed the
    // bytes over as base64, so the preview costs nothing extra to build.
    if (
      isImagePath(path)
      && (file.size ?? 0) <= MAX_PREVIEW_BYTES
      && file.encoding === "base64"
      && typeof file.content === "string"
    ) {
      return {
        path,
        editable: false,
        reason: described.reason,
        size: file.size,
        preview: `data:${imageContentType(path)};base64,${file.content.replace(/\s/g, "")}`,
      };
    }
    return { path, editable: false, reason: described.reason, size: file.size };
  }

  if (file.encoding !== "base64" || typeof file.content !== "string") {
    return { path, editable: false, reason: "GitHub returned this file in a form the editor cannot read." };
  }

  const contents = Buffer.from(file.content, "base64").toString("utf-8");
  return {
    path,
    editable: true,
    contents,
    // The same hash the engine checks a save against, so what the editor holds
    // and what a save is judged on cannot drift apart.
    fingerprint: hashFile(contents),
    size: file.size,
  };
}
