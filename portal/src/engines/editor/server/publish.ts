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

// ─── Pull requests ───────────────────────────────────────────────────────────
//
// The engine already commits to a BRANCH rather than the default branch, which
// is the half of the flow that protects production. This is the other half:
// open a pull request for that branch (so it gets a preview deployment and can
// be looked at), then merge it when it is ready.
//
// Deliberately two separate calls. "Publish" meaning "merge to main without
// anybody seeing it" is exactly the accident this shape prevents — a preview
// exists in between, and the merge is its own decision.

export interface PullRequestRef {
  number: number;
  url: string;
  state: string;
  merged: boolean;
  /** True when GitHub says the branch is already merged / nothing to open. */
  existing?: boolean;
}

/**
 * Open a pull request from `branch` into `base`, or return the open one.
 *
 * GitHub refuses a duplicate PR for the same head, so an existing one is
 * looked up and returned rather than surfaced as an error — pressing the
 * button twice should be boring.
 */
export async function openPullRequest(input: {
  repository: string;
  branch: string;
  base: string;
  title: string;
  body?: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<PullRequestRef> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const repo = `/repos/${input.repository}`;
  const owner = input.repository.split("/")[0];

  try {
    const created = await githubJson<{ number: number; html_url: string; state: string; merged: boolean }>(
      fetchImpl, input.token, `${repo}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({ title: input.title, body: input.body ?? "", head: input.branch, base: input.base }),
      },
    );
    return { number: created.number, url: created.html_url, state: created.state, merged: Boolean(created.merged) };
  } catch (error) {
    // Already open for this head — find it and hand it back.
    const open = await githubJson<Array<{ number: number; html_url: string; state: string }>>(
      fetchImpl, input.token, `${repo}/pulls?head=${encodeURIComponent(`${owner}:${input.branch}`)}&state=open`,
    ).catch(() => []);
    if (open.length) {
      return { number: open[0].number, url: open[0].html_url, state: open[0].state, merged: false, existing: true };
    }
    throw error;
  }
}

/**
 * Merge a pull request.
 *
 * `confirm` is checked for exactly `true`, the same rule the publish path
 * uses: a stray truthy value from a query string must never be able to merge
 * to the default branch — on this project that is what triggers a production
 * deploy.
 */
export async function mergePullRequest(input: {
  repository: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
  confirm?: boolean;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ merged: boolean; message: string }> {
  if (input.confirm !== true) {
    return { merged: false, message: "Dry run — nothing was merged. Confirm to merge this pull request." };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const result = await githubJson<{ merged?: boolean; message?: string }>(
    fetchImpl, input.token, `/repos/${input.repository}/pulls/${input.number}/merge`,
    { method: "PUT", body: JSON.stringify({ merge_method: input.method ?? "squash" }) },
  );
  return { merged: Boolean(result.merged), message: result.message ?? "Merged." };
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

  // Refused outright rather than partially published: half of a change that
  // spans a component and its page is a broken website, found by a visitor.
  //
  // Checked BEFORE the empty-plan case, and that order is the point. A plan
  // where every edit was rejected has no files, so the empty branch used to
  // answer first and say "Nothing to publish." — which is what somebody saw
  // when their branch had moved under them or their line had been edited by
  // somebody else. Both are things they need to be told, and both read as "the
  // editor did nothing, try again", which is exactly the wrong conclusion. The
  // detail was carried in `rejected` all along; now the summary agrees with it.
  if (plan.rejected.length) {
    return {
      published: false, branch, files, rejected: plan.rejected,
      summary: `Not published — ${plan.rejected.length} edit${plan.rejected.length === 1 ? "" : "s"} could not be applied. Re-map and try again.`,
    };
  }

  if (!plan.files.length) {
    return { published: false, branch, files, rejected: plan.rejected, summary };
  }

  if (request.confirm !== true) {
    return { published: false, branch, files, rejected: plan.rejected, summary: `Dry run · would change ${summary}` };
  }

  const fetchImpl = request.fetchImpl ?? fetch;
  const { token } = request;
  const repo = `/repos/${target.repository}`;

  // A branch is CREATED from the mapped commit, not from whatever HEAD is now:
  // the edits were made against that tree and belong on top of it. But once the
  // branch EXISTS, every further commit builds on ITS tip — building a second
  // commit from `baseSha` again gives it the same parent as the first, which is
  // not a descendant of the branch head, and the non-forced ref update below
  // would rightly refuse it (GitHub 422, "not a fast forward"). That is exactly
  // how the second words edit on every project used to fail.
  const existing = await githubJson<{ object?: { sha: string } }>(fetchImpl, token, `${repo}/git/ref/heads/${branch}`)
    .catch(() => null);
  let parentSha = existing?.object?.sha;
  if (!parentSha) {
    await githubJson(fetchImpl, token, `${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: target.baseSha }),
    });
    parentSha = target.baseSha;
  }

  // One tree and one commit, so every file lands together or none does. Both
  // are built from the branch tip, so successive edits chain instead of each
  // claiming to be the first.
  const tree = await githubJson<{ sha: string }>(fetchImpl, token, `${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parentSha,
      tree: plan.files.map(file => ({
        path: file.file, mode: "100644", type: "blob", content: file.contents,
      })),
    }),
  });

  const commit = await githubJson<{ sha: string }>(fetchImpl, token, `${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: request.message, tree: tree.sha, parents: [parentSha] }),
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
