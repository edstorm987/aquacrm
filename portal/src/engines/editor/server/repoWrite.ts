import "server-only";

import { MAX_EDITABLE_BYTES, describeFile, isHiddenPath } from "./fileTree";
import { hashFile } from "./codeAdapter";
import { mergePullRequest, openPullRequest, publishEdits, type PullRequestRef } from "./publish";
import {
  compareRepoRefs,
  listBranchPullRequests,
  readRepoFile,
  readRepoHeadSha,
  readRepoTree,
  type RepoFile,
} from "./githubSource";
import { isMappableFile } from "./registry";
import { planSourceInsert, type InsertAnchor } from "./sourceInsert";
import { editBranchName, sourceEditTarget, type SourceEditDeps } from "./sourceEdit";
import type { DevProject } from "@/server/types";

/**
 * The WRITE path for a repository-backed project: save a file, create a file
 * or folder, publish the branch as a pull request.
 *
 * This is the build Ed was blocked on. The files route rightly refuses to
 * write a repo-backed project to this server's disk ("committed and published,
 * not written to this workspace") — but nothing implemented the committing.
 * The + was disabled, the code canvas's save 409'd, and "publish" was a word
 * in an error message with no code behind it.
 *
 * Nothing here talks to GitHub itself. Every commit goes through
 * `publishEdits` and every pull request through `openPullRequest` — the same
 * machinery the words editor proved, with the same three rules: dry run by
 * default, a branch and never the default branch, no force-pushes. This
 * module's own job is only what a WHOLE-FILE write adds on top:
 *
 *   • THE DRAFT BRANCH IS THE TRUTH once it exists (the lost-update rule from
 *     `sourceEdit.ts`): the current copy is read from the branch tip when the
 *     branch exists, from the base ref only before the first commit. Reading
 *     base once the branch has moved would silently revert earlier saves.
 *   • THE FINGERPRINT FROM READ TIME is re-checked against what the branch or
 *     base ACTUALLY holds at save time. A mismatch refuses with the same
 *     "someone else changed this" honesty the local disk path has — never a
 *     last-write-wins overwrite.
 *   • THE SAME PATH RULES as the local path: hidden paths (`.env`, `.git/`…)
 *     cannot be written OR created, traversal is refused by normalising first,
 *     and only files the reader itself calls editable can be saved.
 *
 * Git cannot hold an empty directory, so "create a folder" commits
 * `<folder>/.gitkeep` — and callers are given the honest note to show rather
 * than pretending otherwise.
 */

/** Reuses the words editor's dep seams — same fakes drive both in tests. */
export type RepoWriteDeps = SourceEditDeps;

export type RepoWriteRefusal = {
  ok: false;
  reason:
    | "bad-path"
    | "not-editable"
    | "too-large"
    | "unreadable"
    | "stale-fingerprint"
    | "no-change"
    | "exists"
    | "nothing-to-publish"
    | "pull-request-failed"
    // ── the element-insert path (phase 7) ──
    | "not-mappable"
    | "empty-code"
    | "line-missing"
    | "unknown-context"
    | "no-safe-end"
    // ── the in-editor merge + revert (phase 14) ──
    | "no-pull-request"
    | "merge-failed"
    | "nothing-to-revert";
  error: string;
};

/** The wording both write shapes share with the local files route. */
const STALE_MESSAGE =
  "This file changed since you opened it. Reopen it and make the change again — saving now would overwrite somebody else's work.";

// ─── Paths ───────────────────────────────────────────────────────────────────

export type RepoPathCheck = { ok: true; path: string } | { ok: false; error: string };

/**
 * Normalise, then refuse — the same order the local route uses, because `..`
 * can be spelled many ways and the only reliable question is where the path
 * lands. There is no filesystem here to `realpath` against; a git path is
 * exactly its segments, so refusing `..`, empty segments and backslashes IS
 * the whole normalisation.
 */
export function normalizeRepoPath(requested: string): RepoPathCheck {
  const raw = requested.trim();
  if (!raw || raw.includes("\0") || raw.includes("\\")) {
    return { ok: false, error: "That path cannot be used." };
  }
  const segments = raw.split("/").filter(segment => segment !== "" && segment !== ".");
  if (!segments.length) return { ok: false, error: "Give it a name." };
  if (segments.includes("..")) return { ok: false, error: "That path cannot be used." };
  const path = segments.join("/");
  // The same refusals the tree and the local write path enforce: `.env` in a
  // repository is still a credential file, wherever the write lands.
  if (isHiddenPath(path)) return { ok: false, error: "That location is not editable here." };
  return { ok: true, path };
}

/** GitHub said 404 — the ref or the path is genuinely not there. */
function isMissingOnGitHub(error: unknown): boolean {
  return error instanceof Error && /\(404\)/.test(error.message);
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "That repository could not be read.";
}

// ─── One write at a time per branch, in-process ──────────────────────────────
//
// The fingerprint check and the commit are several awaits apart, and Next
// serves concurrent requests in one process — the same window the local files
// route closes with its per-path lock. Serialised per BRANCH rather than per
// path because every commit moves the same branch tip: two saves to different
// files racing past each other would still fight over the ref (publishEdits'
// non-forced update turns the loser into a refusal, but a queue turns it into
// a success).

const writeLocks = new Map<string, Promise<unknown>>();

function withBranchLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const result = previous.then(run, run);
  const settled = result.then(() => undefined, () => undefined);
  writeLocks.set(key, settled);
  void settled.finally(() => {
    if (writeLocks.get(key) === settled) writeLocks.delete(key);
  });
  return result;
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

export interface SaveRepoFileInput {
  agencyId: string;
  project: DevProject;
  path: string;
  contents: string;
  /** The fingerprint the canvas read the file at — `hashFile` of its contents. */
  fingerprint: string;
  /** Nothing is committed unless this is exactly `true`. */
  confirm?: boolean;
  message?: string;
}

export type SaveRepoFileResult =
  | {
      ok: true;
      path: string;
      branch: string;
      repository: string;
      /** False on a dry run — `confirm` was not exactly `true`. */
      published: boolean;
      commitSha?: string;
      /** Of the NEW contents — what the canvas should hold for its next save. */
      fingerprint: string;
      summary: string;
    }
  | RepoWriteRefusal;

/**
 * Put one edited file's contents on the project's draft branch, as a commit.
 *
 * Not "save to the site": the branch is a draft until its pull request is
 * merged, and callers should say so in as many words.
 */
export async function saveRepoFile(input: SaveRepoFileInput, deps: RepoWriteDeps = {}): Promise<SaveRepoFileResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);

  const checked = normalizeRepoPath(input.path);
  if (!checked.ok) return { ok: false, reason: "bad-path", error: checked.error };
  const path = checked.path;

  if (Buffer.byteLength(input.contents, "utf-8") > MAX_EDITABLE_BYTES) {
    return { ok: false, reason: "too-large", error: "That is too large to save here." };
  }
  const described = describeFile(path, Buffer.byteLength(input.contents, "utf-8"));
  if (!described.editable) {
    return { ok: false, reason: "not-editable", error: described.reason ?? "That file cannot be edited here." };
  }

  return withBranchLock(`${source.repository}#${branch}`, async () => {
    // THE DRAFT BRANCH IS THE TRUTH once it exists. Only a 404 — no branch, or
    // a path the branch genuinely lacks — falls back to the base ref; any
    // other failure refuses, because "the branch could not be read" and "the
    // branch does not exist" differ in exactly the way that loses an earlier
    // save if they are conflated.
    const read = deps.readFile ?? readRepoFile;
    let current: RepoFile;
    try {
      current = await read({ ...source, ref: branch }, path);
    } catch (branchError) {
      if (!isMissingOnGitHub(branchError)) return { ok: false as const, reason: "unreadable" as const, error: readError(branchError) };
      try {
        current = await read(source, path);
      } catch (baseError) {
        if (isMissingOnGitHub(baseError)) {
          return { ok: false as const, reason: "unreadable" as const, error: `${path} does not exist in ${source.repository}. Create it first.` };
        }
        return { ok: false as const, reason: "unreadable" as const, error: readError(baseError) };
      }
    }
    if (!current.editable || typeof current.contents !== "string") {
      return { ok: false as const, reason: "unreadable" as const, error: current.reason ?? "That file cannot be edited here." };
    }

    // The fingerprint from READ time against what is ACTUALLY there now. The
    // canvas holds `hashFile(contents)` from the GET; if the branch (or base)
    // no longer hashes to that, somebody committed in between.
    if (!input.fingerprint || hashFile(current.contents) !== input.fingerprint) {
      return { ok: false as const, reason: "stale-fingerprint" as const, error: STALE_MESSAGE };
    }
    if (current.contents === input.contents) {
      return { ok: false as const, reason: "no-change" as const, error: "Nothing has changed — that is exactly what the file already says." };
    }

    const baseSha = await (deps.readHeadSha ?? readRepoHeadSha)(source);
    const lines = (contents: string) => `${contents.split(/\r?\n/).length} lines`;
    const outcome = await (deps.publish ?? publishEdits)({
      target: { repository: source.repository, baseBranch: source.ref, baseSha },
      // A whole-file plan, built directly: `planPatches` is the line-edit
      // shape; a code-canvas save replaces the file it opened.
      plan: {
        files: [{ file: path, contents: input.contents, line: 1, before: lines(current.contents), after: lines(input.contents) }],
        rejected: [],
      },
      branch,
      message: input.message?.trim() || `Aqua Editor: save ${path}`,
      // Passed through, not coerced: `publishEdits` wants exactly `true`.
      confirm: input.confirm,
      token: source.token,
    });

    return {
      ok: true as const,
      path,
      branch,
      repository: source.repository,
      published: outcome.published,
      commitSha: outcome.commitSha,
      fingerprint: hashFile(input.contents),
      summary: outcome.published
        ? `On the draft branch ${branch} — publish opens the pull request.`
        : outcome.summary,
    };
  });
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export interface CreateRepoPathInput {
  agencyId: string;
  project: DevProject;
  path: string;
  kind: "file" | "folder";
  /** Optional template for a new file. A folder ignores it. */
  contents?: string;
  /** Nothing is committed unless this is exactly `true`. */
  confirm?: boolean;
}

export type CreateRepoPathResult =
  | {
      ok: true;
      created: "file" | "folder";
      /** What was asked for. */
      path: string;
      /** What was committed — `<path>/.gitkeep` for a folder. */
      committedPath: string;
      branch: string;
      repository: string;
      published: boolean;
      commitSha?: string;
      /** For a file: the fingerprint the canvas can open it at. */
      fingerprint?: string;
      /** The honest sentence for the UI to show. */
      note?: string;
      summary: string;
    }
  | RepoWriteRefusal;

/**
 * A new file is a blob committed to the draft branch at the requested path; a
 * new folder is `<path>/.gitkeep`, because git has no empty directories — a
 * fact the `note` states for the UI rather than pretending otherwise.
 */
export async function createRepoPath(input: CreateRepoPathInput, deps: RepoWriteDeps = {}): Promise<CreateRepoPathResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);

  const checked = normalizeRepoPath(input.path);
  if (!checked.ok) return { ok: false, reason: "bad-path", error: checked.error };
  const path = checked.path;
  const committedPath = input.kind === "folder" ? `${path}/.gitkeep` : path;
  // `<hidden>/.gitkeep` is still hidden — asked of the path that will land.
  if (isHiddenPath(committedPath)) return { ok: false, reason: "bad-path", error: "That location is not editable here." };

  const contents = input.kind === "folder" ? "" : input.contents ?? "";
  if (Buffer.byteLength(contents, "utf-8") > MAX_EDITABLE_BYTES) {
    return { ok: false, reason: "too-large", error: "That is too large to save here." };
  }
  // A new file must be one the editor would agree to open afterwards — the
  // same rule the local create path enforces.
  if (input.kind === "file" && !describeFile(path, Buffer.byteLength(contents, "utf-8")).editable) {
    return { ok: false, reason: "not-editable", error: "That file type cannot be edited here." };
  }

  return withBranchLock(`${source.repository}#${branch}`, async () => {
    // Does anything already live at that path? Asked branch-first for the same
    // reason a save reads branch-first: a file created two saves ago exists,
    // whatever base still says. A read that RESOLVES — even as "this is a
    // directory listing" — means something is there; only a 404 means free.
    const read = deps.readFile ?? readRepoFile;
    let occupied = false;
    try {
      await read({ ...source, ref: branch }, path);
      occupied = true;
    } catch (branchError) {
      if (!isMissingOnGitHub(branchError)) {
        // No branch yet — the base ref is the truth. Any other failure refuses.
        return { ok: false as const, reason: "unreadable" as const, error: readError(branchError) };
      }
      try {
        await read(source, path);
        occupied = true;
      } catch (baseError) {
        if (!isMissingOnGitHub(baseError)) return { ok: false as const, reason: "unreadable" as const, error: readError(baseError) };
      }
    }
    if (occupied) return { ok: false as const, reason: "exists" as const, error: "Something already exists there." };

    const baseSha = await (deps.readHeadSha ?? readRepoHeadSha)(source);
    const outcome = await (deps.publish ?? publishEdits)({
      target: { repository: source.repository, baseBranch: source.ref, baseSha },
      plan: {
        files: [{ file: committedPath, contents, line: 1, before: "(nothing)", after: input.kind === "folder" ? "an empty .gitkeep" : "a new file" }],
        rejected: [],
      },
      branch,
      message: `Aqua Editor: create ${committedPath}`,
      confirm: input.confirm,
      token: source.token,
    });

    return {
      ok: true as const,
      created: input.kind,
      path,
      committedPath,
      branch,
      repository: source.repository,
      published: outcome.published,
      commitSha: outcome.commitSha,
      ...(input.kind === "file" ? { fingerprint: hashFile(contents) } : {}),
      ...(input.kind === "folder"
        ? { note: "Git only keeps a folder that has a file in it, so the folder holds a .gitkeep file." }
        : {}),
      summary: outcome.published
        ? `Created ${committedPath} on the draft branch ${branch} — publish opens the pull request.`
        : outcome.summary,
    };
  });
}

// ─── PUBLISH ─────────────────────────────────────────────────────────────────

export type ProjectPullRequestResult =
  | { ok: true; branch: string; repository: string; baseBranch: string; pullRequest: PullRequestRef }
  | RepoWriteRefusal;

/**
 * Open — or find and hand back — the pull request for the project's draft
 * branch. Pressing the button twice is boring by design: `openPullRequest`
 * returns the open one rather than erroring on a duplicate.
 *
 * Merging stays a separate decision (`mergePullRequest`), because on this
 * deployment merging IS the production deploy.
 */
export async function openProjectPullRequest(
  input: { agencyId: string; project: DevProject },
  deps: RepoWriteDeps = {},
): Promise<ProjectPullRequestResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);

  // A pull request needs a branch to point at. Asking GitHub first turns "no
  // commits yet" into a sentence instead of a 422 from the PR endpoint.
  try {
    await (deps.readHeadSha ?? readRepoHeadSha)({ ...source, ref: branch });
  } catch (error) {
    if (isMissingOnGitHub(error)) {
      return { ok: false, reason: "nothing-to-publish", error: "Nothing is on the draft branch yet — save or create something first." };
    }
    return { ok: false, reason: "unreadable", error: readError(error) };
  }

  try {
    const pullRequest = await (deps.openPr ?? openPullRequest)({
      repository: source.repository,
      branch,
      base: source.ref,
      title: `Aqua Editor — ${input.project.name || input.project.id}`,
      body: "Files edited in the Aqua Dev Editor. Each save adds a commit to this branch. Merging is what puts it on the site.",
      token: source.token,
    });
    return { ok: true, branch, repository: source.repository, baseBranch: source.ref, pullRequest };
  } catch (error) {
    return { ok: false, reason: "pull-request-failed", error: readError(error) };
  }
}

// ─── MERGE, INSIDE THE EDITOR (phase 14) ─────────────────────────────────────
//
// Ed: "no everything inside the editor thats the whole point of it". So the
// merge is a control in the Drafts tab, not a link out to GitHub. It stays
// exactly as dangerous as it is — on this deployment a merge to the default
// branch IS the production deploy — which is why `mergePullRequest`'s
// confirm-exactly-true rule is passed through untouched, and the no-confirm
// call answers with the dry-run sentence instead of merging.

/** Seams for the phase-14 reads and the merge — same fakes drive the tests. */
export type MergeRevertDeps = RepoWriteDeps & {
  listPrs?: typeof listBranchPullRequests;
  merge?: typeof mergePullRequest;
  compare?: typeof compareRepoRefs;
};

export type MergeProjectResult =
  | {
      ok: true;
      branch: string;
      repository: string;
      /** False on the dry run — `confirm` was not exactly `true`. */
      merged: boolean;
      pullRequest: { number: number; url: string };
      message: string;
    }
  | RepoWriteRefusal;

/**
 * Merge the draft branch's OPEN pull request.
 *
 * Finds the PR itself (the operator confirms an action, not a number — a
 * number from the body could name somebody else's PR on the same repo). No
 * open PR is a refusal that says what to do instead, and an unconfirmed call
 * is a dry run, so the panel's two-step is enforced server-side too.
 */
export async function mergeProjectPullRequest(
  input: { agencyId: string; project: DevProject; confirm?: boolean },
  deps: MergeRevertDeps = {},
): Promise<MergeProjectResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);

  let open: { number: number; url: string } | undefined;
  try {
    const pulls = await (deps.listPrs ?? listBranchPullRequests)(source, branch);
    open = pulls.find(pull => pull.state === "open");
  } catch (error) {
    return { ok: false, reason: "unreadable", error: readError(error) };
  }
  if (!open) {
    return {
      ok: false,
      reason: "no-pull-request",
      error: "No pull request is open for the draft branch — publish first, then merge.",
    };
  }

  try {
    const outcome = await (deps.merge ?? mergePullRequest)({
      repository: source.repository,
      number: open.number,
      // Passed through, not coerced: `mergePullRequest` wants exactly `true`,
      // because on this deployment the merge IS the deploy.
      confirm: input.confirm,
      token: source.token,
    });
    return {
      ok: true,
      branch,
      repository: source.repository,
      merged: outcome.merged,
      pullRequest: { number: open.number, url: open.url },
      message: outcome.merged
        ? `Merged pull request #${open.number} — ${source.ref} now carries this draft. ${outcome.message}`.trim()
        : outcome.message,
    };
  } catch (error) {
    // GitHub said no — a conflict, a protection rule. The repository
    // disagrees; the sentence says what it said.
    return { ok: false, reason: "merge-failed", error: readError(error) };
  }
}

// ─── REVERT A MERGED DRAFT (phase 14) ────────────────────────────────────────

export type RevertPlanFile =
  | { path: string; action: "restore"; note: string }
  | { path: string; action: "skip-added"; note: string }
  | { path: string; action: "already"; note: string };

export type RevertDraftResult =
  | {
      ok: true;
      branch: string;
      repository: string;
      /** False on the preview pass — nothing was written. */
      published: boolean;
      files: RevertPlanFile[];
      commitShas: string[];
      summary: string;
    }
  | RepoWriteRefusal;

/**
 * Put the PRE-DRAFT contents of everything the merged draft changed back onto
 * the draft branch — as ordinary commits.
 *
 * THE REVERT IS ITSELF A DRAFT. Nothing here touches the base branch: the
 * restore commits land on `aqua-editor/<id>` through `saveRepoFile` (same
 * lock, same fingerprint rules), and putting them on the site is the same
 * publish → pull request → merge everything else goes through. That is the
 * loop closing, not a shortcut around it — a direct write to base is exactly
 * what this engine exists to refuse.
 *
 * Pre-draft means AT THE FORK POINT (the compare's merge base): what the file
 * said before this draft's first commit. A file the draft ADDED cannot be
 * deleted by this path (the publish machinery only writes contents), so it is
 * skipped WITH A NOTE rather than silently left as if handled.
 */
export async function revertMergedDraft(
  input: { agencyId: string; project: DevProject; confirm?: boolean },
  deps: MergeRevertDeps = {},
): Promise<RevertDraftResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);

  // Only a MERGED draft reverts. An open PR is closed by not merging it; an
  // unmerged branch is abandoned by leaving it — both cheaper than commits.
  let merged = false;
  try {
    const pulls = await (deps.listPrs ?? listBranchPullRequests)(source, branch);
    if (pulls.some(pull => pull.state === "open")) {
      return {
        ok: false,
        reason: "no-pull-request",
        error: "A pull request is still open for this draft — merge it or close it before reverting.",
      };
    }
    merged = pulls.some(pull => pull.merged);
  } catch (error) {
    return { ok: false, reason: "unreadable", error: readError(error) };
  }
  if (!merged) {
    return {
      ok: false,
      reason: "nothing-to-revert",
      error: "Nothing merged from this draft yet — there is nothing on the site to take back.",
    };
  }

  // What the draft changed: the diff from its FORK POINT to its tip. Not
  // base…branch — after a squash merge those two are content-identical.
  let fork: string;
  try {
    fork = (await (deps.compare ?? compareRepoRefs)(source, branch)).mergeBaseSha;
    if (!fork) return { ok: false, reason: "unreadable", error: "GitHub did not name the draft's fork point." };
  } catch (error) {
    return { ok: false, reason: "unreadable", error: readError(error) };
  }
  let changed: Awaited<ReturnType<typeof compareRepoRefs>>;
  try {
    changed = await (deps.compare ?? compareRepoRefs)({ ...source, ref: fork }, branch);
  } catch (error) {
    return { ok: false, reason: "unreadable", error: readError(error) };
  }
  if (!changed.files.length) {
    return { ok: false, reason: "nothing-to-revert", error: "The merged draft changed no files." };
  }

  const read = deps.readFile ?? readRepoFile;
  const plan: Array<RevertPlanFile & { contents?: string; fingerprint?: string }> = [];
  for (const file of changed.files) {
    if (file.status === "added") {
      plan.push({
        path: file.path,
        action: "skip-added",
        note: "The draft ADDED this file. This path only writes contents — it cannot delete, so the file stays and is named here rather than pretended away.",
      });
      continue;
    }
    // The pre-draft copy, at the fork point…
    let before: RepoFile;
    try {
      before = await read({ ...source, ref: fork }, file.path);
    } catch (error) {
      return { ok: false, reason: "unreadable", error: `${file.path} could not be read at the fork point. ${readError(error)}` };
    }
    if (!before.editable || typeof before.contents !== "string") {
      return { ok: false, reason: "unreadable", error: before.reason ?? `${file.path} cannot be restored here.` };
    }
    // …against what is there NOW (draft-first, like every write).
    const current = await readDraftFirst(source, branch, file.path, deps);
    if ("ok" in current && current.ok === false) return current;
    const now = current as RepoFile;
    if (typeof now.contents === "string" && now.contents === before.contents) {
      plan.push({ path: file.path, action: "already", note: "Already says what it said before the draft." });
      continue;
    }
    plan.push({
      path: file.path,
      action: "restore",
      note: "Restores the pre-draft contents.",
      contents: before.contents,
      fingerprint: typeof now.contents === "string" ? hashFile(now.contents) : undefined,
    });
  }

  const shape = plan.map(({ path, action, note }) => ({ path, action, note } as RevertPlanFile));
  const restores = plan.filter(file => file.action === "restore");
  if (!restores.length) {
    const skipped = plan.filter(file => file.action === "skip-added").length;
    return {
      ok: true, branch, repository: source.repository, published: false, files: shape, commitShas: [],
      summary: skipped
        ? `Nothing this path can restore — ${skipped} file${skipped === 1 ? "" : "s"} the draft added stay${skipped === 1 ? "s" : ""} in place (each is named above with why).`
        : "Nothing to restore — everything already says what it said before the draft.",
    };
  }

  if (input.confirm !== true) {
    return {
      ok: true, branch, repository: source.repository, published: false, files: shape, commitShas: [],
      summary: `Nothing committed yet. Confirming restores ${restores.length} file${restores.length === 1 ? "" : "s"} on the draft branch — the revert is itself a draft, and publishing + merging it is what changes the site.`,
    };
  }

  const commitShas: string[] = [];
  for (const file of restores) {
    const saved = await saveRepoFile({
      agencyId: input.agencyId,
      project: input.project,
      path: file.path,
      contents: file.contents!,
      fingerprint: file.fingerprint ?? "",
      confirm: true,
      message: `Aqua Editor: revert ${file.path} to before the merged draft`,
    }, deps);
    if (!saved.ok) return saved;
    if (saved.commitSha) commitShas.push(saved.commitSha);
  }
  return {
    ok: true, branch, repository: source.repository, published: true, files: shape, commitShas,
    summary: `The revert is on the draft branch ${branch} — publish opens its pull request, and merging that is what changes the site.`,
  };
}

// ─── INSERT AN ELEMENT (phase 7) ─────────────────────────────────────────────
//
// The element library stopped being browse-only: picking a block on a
// repository-backed target emits its source (`elements/emit.ts`), the operator
// chooses WHERE, previews the exact lines, and confirming commits them to the
// same draft branch every other write here uses. Nothing below invents a write
// path — the placement question is `sourceInsert.ts`'s (which REFUSES an
// unsafe gap rather than guessing into JSX), and the commit is literally
// `saveRepoFile`, so the branch-first read, the fingerprint rule, the branch
// lock and the honest "draft branch, not the site" summary all come along
// unchanged.

/** The branch-first read every write shape shares: the draft is the truth. */
async function readDraftFirst(
  source: ReturnType<typeof sourceEditTarget>,
  branch: string,
  path: string,
  deps: RepoWriteDeps,
): Promise<RepoFile | RepoWriteRefusal> {
  const read = deps.readFile ?? readRepoFile;
  try {
    return await read({ ...source, ref: branch }, path);
  } catch (branchError) {
    if (!isMissingOnGitHub(branchError)) return { ok: false, reason: "unreadable", error: readError(branchError) };
    try {
      return await read(source, path);
    } catch (baseError) {
      if (isMissingOnGitHub(baseError)) {
        return { ok: false, reason: "unreadable", error: `${path} does not exist in ${source.repository}. Create it first.` };
      }
      return { ok: false, reason: "unreadable", error: readError(baseError) };
    }
  }
}

export type InsertTargetsResult =
  | {
      ok: true;
      repository: string;
      branch: string;
      /** Which ref actually answered — the draft branch once it exists. */
      readFrom: string;
      /** Every file an element can go into, in tree order. */
      files: string[];
      /** GitHub truncated the tree — part of the repository was never offered. */
      truncated: boolean;
    }
  | RepoWriteRefusal;

/**
 * The files an element can be placed into — the picker's list.
 *
 * Read from the draft branch when it exists (a page created two saves ago is
 * a real target, whatever base says) and filtered by `isMappableFile`, the
 * same filter the words editor searches with — so "where an element can go"
 * and "where words are looked for" is one answer, not two.
 */
export async function listInsertTargets(
  input: { agencyId: string; project: DevProject },
  deps: RepoWriteDeps = {},
): Promise<InsertTargetsResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);
  const readTree = deps.readTree ?? readRepoTree;

  let head: Awaited<ReturnType<typeof readRepoTree>>;
  let readFrom = branch;
  try {
    head = await readTree({ ...source, ref: branch });
  } catch (branchError) {
    if (!isMissingOnGitHub(branchError)) return { ok: false, reason: "unreadable", error: readError(branchError) };
    try {
      head = await readTree(source);
      readFrom = source.ref;
    } catch (baseError) {
      return { ok: false, reason: "unreadable", error: readError(baseError) };
    }
  }

  return {
    ok: true,
    repository: source.repository,
    branch,
    readFrom,
    files: head.files.map(file => file.path).filter(isMappableFile),
    truncated: head.truncated,
  };
}

export interface InsertElementInput {
  agencyId: string;
  project: DevProject;
  path: string;
  /** The emitted element source — `emitElementCode` of the chosen definition. */
  code: string;
  anchor: InsertAnchor;
  /** Names the element in the commit message. Cosmetic, never parsed. */
  label?: string;
  /**
   * From the PREVIEW response. Optional on the preview call itself; the
   * confirm call must carry it back so a file that moved in between refuses
   * instead of committing an insert nobody saw.
   */
  fingerprint?: string;
  /** Nothing is committed unless this is exactly `true`. */
  confirm?: boolean;
}

export type InsertElementResult =
  | {
      ok: true;
      path: string;
      branch: string;
      repository: string;
      /** False on the preview pass — nothing was written. */
      published: boolean;
      commitSha?: string;
      /** 1-based line the insert starts on, in the new contents. */
      line: number;
      /** Exactly the lines that go in — the diff the operator confirms. */
      insertedLines: string[];
      /** The line the insert sits under. Null at a file top. */
      anchorText: string | null;
      /** The line that follows it. Null at a file end. */
      followingText: string | null;
      /**
       * Preview pass: the CURRENT file's fingerprint — send it back to
       * confirm. Committed: the new contents' fingerprint.
       */
      fingerprint: string;
      summary: string;
    }
  | RepoWriteRefusal;

/**
 * Put one element's emitted source into a file on the draft branch.
 *
 * Two calls by design, like the words editor: the first (no `confirm`) reads
 * the file, plans the splice and returns the exact inserted lines and a
 * fingerprint — it writes NOTHING. The second carries the fingerprint back
 * with `confirm: true` and commits through `saveRepoFile`, whose own re-read
 * and fingerprint check make the window between preview and confirm safe.
 */
export async function insertElementIntoRepo(
  input: InsertElementInput,
  deps: RepoWriteDeps = {},
): Promise<InsertElementResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);

  const checked = normalizeRepoPath(input.path);
  if (!checked.ok) return { ok: false, reason: "bad-path", error: checked.error };
  const path = checked.path;
  if (!isMappableFile(path)) {
    return {
      ok: false,
      reason: "not-mappable",
      error: `${path} is not a page file. Elements go into .tsx, .jsx, .mdx, .md and .html files — pick one of those.`,
    };
  }
  if (!input.code.trim()) {
    return { ok: false, reason: "empty-code", error: "There is no code to insert." };
  }
  if (Buffer.byteLength(input.code, "utf-8") > MAX_EDITABLE_BYTES) {
    return { ok: false, reason: "too-large", error: "That is too large to insert here." };
  }

  const current = await readDraftFirst(source, branch, path, deps);
  if ("ok" in current && current.ok === false) return current;
  const file = current as RepoFile;
  if (!file.editable || typeof file.contents !== "string") {
    return { ok: false, reason: "unreadable", error: file.reason ?? "That file cannot be edited here." };
  }

  const currentFingerprint = hashFile(file.contents);
  if (input.fingerprint && input.fingerprint !== currentFingerprint) {
    return { ok: false, reason: "stale-fingerprint", error: STALE_MESSAGE };
  }

  const plan = planSourceInsert({ contents: file.contents, code: input.code, anchor: input.anchor, file: path });
  if (!plan.ok) return { ok: false, reason: plan.reason, error: plan.detail };
  if (Buffer.byteLength(plan.newContents, "utf-8") > MAX_EDITABLE_BYTES) {
    return { ok: false, reason: "too-large", error: "That file would become too large to save here." };
  }

  const shape = {
    path,
    branch,
    repository: source.repository,
    line: plan.line,
    insertedLines: plan.insertedLines,
    anchorText: plan.anchorText,
    followingText: plan.followingText,
  };

  if (input.confirm !== true) {
    return {
      ok: true,
      ...shape,
      published: false,
      fingerprint: currentFingerprint,
      summary: `Nothing committed yet. This is exactly what would go into ${path} — confirm to put it on the draft branch.`,
    };
  }

  // The write IS a save: same lock, same re-read, same fingerprint refusal,
  // same honest summary. `saveRepoFile` re-reads the file itself, so a commit
  // that lands between the read above and the lock below is caught there.
  const saved = await saveRepoFile({
    agencyId: input.agencyId,
    project: input.project,
    path,
    contents: plan.newContents,
    fingerprint: currentFingerprint,
    confirm: true,
    message: `Aqua Editor: insert ${input.label?.trim() || "an element"} into ${path}:${plan.line}`,
  }, deps);
  if (!saved.ok) return saved;

  return {
    ok: true,
    ...shape,
    published: saved.published,
    commitSha: saved.commitSha,
    fingerprint: saved.fingerprint,
    summary: saved.summary,
  };
}
