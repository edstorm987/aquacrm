import "server-only";

import type { PatchPlan, PatchedFile } from "./patch";

/**
 * Putting an approved set of edits onto GitHub.
 *
 * Three rules hold regardless of what the caller asks for:
 *
 *   1. A dry run is the default. Publishing happens only when the caller says
 *      so in as many words, because the cost of an accidental write here is a
 *      commit on a live client website.
 *   2. It commits to a branch, never straight to the default branch. A branch
 *      can be reviewed, redeployed as a preview, and abandoned; a bad commit
 *      on main is already live.
 *   3. It only ever adds commits. Nothing force-pushes, amends, rebases or
 *      deletes — history that can be rewritten is history nobody can trust,
 *      and this runs on repositories Ed did not necessarily make.
 */

const GITHUB_API = "https://api.github.com";

export interface PublishTarget {
  /** `owner/repo`. */
  repository: string;
  /** The branch the edits were mapped from. */
  baseBranch: string;
  /** The commit the registry described. */
  baseSha: string;
}

export interface PublishRequest {
  target: PublishTarget;
  plan: PatchPlan;
  message: string;
  /** The branch to write to. Created from `baseSha` when it does not exist. */
  branch: string;
  /**
   * Nothing is written unless this is exactly `true`. Not a truthy check: a
   * stray string or a `1` from a query parameter must not be able to publish.
   */
  confirm?: boolean;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface PublishOutcome {
  /** False when this was a dry run — the default. */
  published: boolean;
  branch: string;
  /** Present only on a real publish. */
  commitSha?: string;
  files: Array<{ file: string; line: number; before: string; after: string }>;
  /** Anything the plan refused, carried through so it is never lost in a summary. */
  rejected: PatchPlan["rejected"];
  summary: string;
}

function describe(files: PatchedFile[]): PublishOutcome["files"] {
  return files.map(file => ({ file: file.file, line: file.line, before: file.before, after: file.after }));
}

async function githubJson<T>(fetchImpl: typeof fetch, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}). ${body.message ?? ""}`.trim());
  return body;
}

/**
 * Publishes, or describes exactly what publishing would do.
 *
 * The dry run returns the same shape as a real publish so the editor shows one
 * preview and the operator confirms the thing they actually read — rather than
 * approving a summary and getting something else.
 */
export async function publishEdits(request: PublishRequest): Promise<PublishOutcome> {
  const { plan, target, branch } = request;
  const files = describe(plan.files);
  const summary = plan.files.length
    ? `${plan.files.length} file${plan.files.length === 1 ? "" : "s"} on ${target.repository}@${branch}`
    : "Nothing to publish.";

  if (!plan.files.length) {
    return { published: false, branch, files, rejected: plan.rejected, summary };
  }

  // Refused outright rather than partially published: half of a change that
  // spans a component and its page is a broken website, found by a visitor.
  if (plan.rejected.length) {
    return {
      published: false, branch, files, rejected: plan.rejected,
      summary: `Not published — ${plan.rejected.length} edit${plan.rejected.length === 1 ? "" : "s"} could not be applied. Re-map and try again.`,
    };
  }

  if (request.confirm !== true) {
    return { published: false, branch, files, rejected: plan.rejected, summary: `Dry run · would change ${summary}` };
  }

  const fetchImpl = request.fetchImpl ?? fetch;
  const { token } = request;
  const repo = `/repos/${target.repository}`;

  // A branch is created from the mapped commit, not from whatever HEAD is now:
  // the edits were made against that tree and belong on top of it.
  const existing = await githubJson<{ object?: { sha: string } }>(fetchImpl, token, `${repo}/git/ref/heads/${branch}`)
    .catch(() => null);
  if (!existing?.object?.sha) {
    await githubJson(fetchImpl, token, `${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: target.baseSha }),
    });
  }

  // One tree and one commit, so every file lands together or none does.
  const tree = await githubJson<{ sha: string }>(fetchImpl, token, `${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: target.baseSha,
      tree: plan.files.map(file => ({
        path: file.file, mode: "100644", type: "blob", content: file.contents,
      })),
    }),
  });

  const commit = await githubJson<{ sha: string }>(fetchImpl, token, `${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: request.message, tree: tree.sha, parents: [target.baseSha] }),
  });

  // No force. A rejected update means the branch moved and this needs
  // re-mapping — overwriting it would discard whatever moved it.
  await githubJson(fetchImpl, token, `${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    published: true, branch, commitSha: commit.sha, files, rejected: [],
    summary: `Published ${summary} · ${commit.sha.slice(0, 7)}`,
  };
}
