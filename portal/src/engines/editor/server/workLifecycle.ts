import "server-only";

import {
  compareRepoRefs,
  listBranchPullRequests,
  readRepoHeadSha,
  type BranchPullRequest,
  type RepoComparison,
} from "./githubSource";
import { editBranchName, sourceEditTarget, SourceEditUnavailable, type SourceEditDeps } from "./sourceEdit";
import { readCheckIns, type WorkerCheckIn } from "@/lib/server/dev/devTeamWorkers";
import type { DevProject } from "@/server/types";

/**
 * The work lifecycle, READ — the state behind the Drafts and History tabs
 * (dev-editor-finish.md phase 14).
 *
 * Ed: "saved drafts creates a branch or draft pr or something so it can be
 * resumed so its just super duper easy". The plan's rule, kept here: THE
 * REPOSITORY IS THE DRAFT STORE. A draft is the project's edit branch
 * (`aqua-editor/<id>`, the one every save already commits to), a resume is
 * reopening a changed file, and publish is the branch's pull request. This
 * module invents NO second draft store and writes NOTHING — it describes the
 * state that `repoWrite.ts` → `publishEdits` creates, so the panels can say it
 * plainly: no branch yet / commits waiting / PR open at #N / merged.
 *
 * The one honesty rule, stated once and enforced by shape: `line` is the ONLY
 * sentence the UI shows for the state, and no state's sentence ever contains
 * the word "saved" for something that is not a commit. An edit that lives only
 * in the page is the "none" state's problem to describe, and it says exactly
 * where such an edit lives: nowhere yet.
 */

export type WorkLifecycleDeps = SourceEditDeps & {
  compare?: typeof compareRepoRefs;
  listPrs?: typeof listBranchPullRequests;
  /** The Dev Team's check-in reader — injectable so tests never touch disk. */
  checkIns?: () => Promise<WorkerCheckIn[]>;
};

// ─── DRAFTS — the branch as the draft ────────────────────────────────────────

export type DraftState = "none" | "commits" | "pr-open" | "merged" | "empty";

export interface DraftStatus {
  state: DraftState;
  /** The one honest sentence for the state, written server-side and tested. */
  line: string;
  branch: string;
  repository: string;
  baseBranch: string;
  /** Commits the branch holds that base does not. 0 when state is "none". */
  aheadBy: number;
  /** Commits base gained since the branch left it — the re-map warning. */
  behindBy: number;
  /** The aggregate diff — what resuming has to offer. Newest state, per file. */
  files: RepoComparison["files"];
  /** The branch's commits, NEWEST first (GitHub answers oldest first). */
  commits: RepoComparison["commits"];
  /** The branch's pull request, when one exists — open or merged. */
  pullRequest?: { number: number; url: string; state: string; merged: boolean };
}

/** GitHub said 404 — the ref is genuinely not there. Same test repoWrite uses. */
function isMissingOnGitHub(error: unknown): boolean {
  return error instanceof Error && /\(404\)/.test(error.message);
}

/**
 * Where the project's draft stands, said plainly.
 *
 * Reads only: the branch head (does a draft exist?), the base…branch compare
 * (what does it hold?) and the pull-request list (`state=all`, because a
 * merged PR is the "merged" state and an open-only listing cannot see it).
 * Throws `SourceEditUnavailable` exactly like every other repository read —
 * a project with no repository has no git lifecycle, and the route says so.
 */
export async function readDraftStatus(
  input: { agencyId: string; project: DevProject },
  deps: WorkLifecycleDeps = {},
): Promise<DraftStatus> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);
  const shell = { branch, repository: source.repository, baseBranch: source.ref };

  // Does the draft exist at all? A 404 is the honest "none" — anything else
  // (bad token, network) must surface as the error it is, never as "no draft".
  try {
    await (deps.readHeadSha ?? readRepoHeadSha)({ ...source, ref: branch });
  } catch (error) {
    if (isMissingOnGitHub(error)) {
      return {
        ...shell,
        state: "none",
        line: `No draft yet. The first save creates the draft branch ${branch} — until then an edit lives only in this page.`,
        aheadBy: 0,
        behindBy: 0,
        files: [],
        commits: [],
      };
    }
    throw error;
  }

  const [compared, pulls] = await Promise.all([
    (deps.compare ?? compareRepoRefs)(source, branch),
    (deps.listPrs ?? listBranchPullRequests)(source, branch),
  ]);

  // The pull request that DESCRIBES the branch now: an open one wins; with
  // none open, the most recently updated merged one is what "merged" means.
  const open = pulls.find(pull => pull.state === "open");
  const merged = pulls.filter(pull => pull.merged).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const describe = (pull: BranchPullRequest) =>
    ({ number: pull.number, url: pull.url, state: pull.state, merged: pull.merged });

  const body = {
    ...shell,
    aheadBy: compared.aheadBy,
    behindBy: compared.behindBy,
    files: compared.files,
    commits: [...compared.commits].reverse(),
  };
  const commitCount = `${compared.aheadBy} commit${compared.aheadBy === 1 ? "" : "s"}`;
  // Base moving under the draft is worth a clause, not a hidden field.
  const drift = compared.behindBy
    ? ` ${source.ref} has moved ${compared.behindBy} commit${compared.behindBy === 1 ? "" : "s"} since.`
    : "";

  if (open) {
    return {
      ...body,
      state: "pr-open",
      line: `Pull request #${open.number} is open with ${commitCount}. Merging it is what puts this on ${source.ref}.${drift}`,
      pullRequest: describe(open),
    };
  }

  // "Merged" versus "commits waiting" cannot be told apart by `aheadBy`
  // alone: a SQUASH merge (this deployment's default) leaves the branch's own
  // commits forever absent from base, so a fully-merged draft still compares
  // ahead. What tells them apart is WHEN — commits newer than the merge are a
  // new round of work; commits older than it are the ones the merge already
  // carried across.
  const newestCommitAt = compared.commits.reduce((newest, commit) => Math.max(newest, commit.at), 0);
  const mergedCoversTheWork = merged && (compared.aheadBy === 0 || merged.updatedAt >= newestCommitAt);

  if (mergedCoversTheWork) {
    return {
      ...body,
      state: "merged",
      line: `Merged — pull request #${merged.number} put this branch's work on ${source.ref}. The next save starts a new round.`,
      pullRequest: describe(merged),
    };
  }
  if (compared.aheadBy > 0) {
    return {
      ...body,
      state: "commits",
      line: `${commitCount} waiting on ${branch}. Publish opens the pull request.${drift}`,
      // The previous round's merged PR, when there was one — history, not state.
      ...(merged ? { pullRequest: describe(merged) } : {}),
    };
  }
  return {
    ...body,
    state: "empty",
    line: `The draft branch ${branch} exists but holds nothing ${source.ref} lacks.`,
  };
}

// ─── HISTORY — one feed, two honest sources ──────────────────────────────────

export type WorkHistoryEntry =
  | { source: "commit"; at: number; title: string; detail: string; sha: string; url: string }
  | { source: "check-in"; at: number; title: string; detail: string };

export interface WorkHistory {
  entries: WorkHistoryEntry[];
  /**
   * What each half of the feed IS, said per source — because the two are not
   * the same kind of fact. Commits are the project's draft branch on GitHub;
   * check-ins are the Dev Team's workers in THIS workspace, which is only the
   * same thing when the project is this workspace.
   */
  sources: {
    commits: { searched: boolean; detail: string };
    checkIns: { searched: boolean; detail: string };
  };
}

const HISTORY_CAP = 100;

/**
 * Commits on the draft branch and Dev Team check-ins, merged newest first.
 *
 * The commits half degrades honestly: a project with no repository (or no
 * token) still gets its check-ins, with `sources.commits.detail` carrying the
 * refusal sentence instead of the feed silently missing half its truth.
 */
export async function readWorkHistory(
  input: { agencyId: string; project: DevProject },
  deps: WorkLifecycleDeps = {},
): Promise<WorkHistory> {
  const entries: WorkHistoryEntry[] = [];

  let commits: WorkHistory["sources"]["commits"];
  try {
    const status = await readDraftStatus(input, deps);
    for (const commit of status.commits) {
      entries.push({
        source: "commit",
        at: commit.at,
        title: commit.message.split("\n")[0] || commit.sha.slice(0, 7),
        detail: `${commit.author || "unknown"} · ${commit.sha.slice(0, 7)} on ${status.branch}`,
        sha: commit.sha,
        url: commit.url,
      });
    }
    commits = {
      searched: true,
      detail: status.state === "none"
        ? `No draft branch yet on ${status.repository} — commits appear after the first save.`
        : `${status.commits.length} commit${status.commits.length === 1 ? "" : "s"} on ${status.branch} that ${status.baseBranch} does not have.`,
    };
  } catch (error) {
    // No repository / no token is a sentence, not an empty feed.
    const detail = error instanceof SourceEditUnavailable
      ? error.message
      : error instanceof Error ? error.message : "The repository could not be read.";
    commits = { searched: false, detail };
  }

  let checkIns: WorkHistory["sources"]["checkIns"];
  try {
    const rows = await (deps.checkIns ?? readCheckIns)();
    for (const row of rows) {
      entries.push({
        source: "check-in",
        at: row.at,
        title: `${row.name} — ${row.status}`,
        detail: [row.plan, row.phase].filter(Boolean).join(" · ") || "a Dev Team check-in",
      });
    }
    checkIns = {
      searched: true,
      detail: `${rows.length} Dev Team check-in${rows.length === 1 ? "" : "s"} — workers in this workspace, not commits on the project.`,
    };
  } catch (error) {
    checkIns = { searched: false, detail: error instanceof Error ? error.message : "Check-ins could not be read." };
  }

  entries.sort((a, b) => b.at - a.at);
  return { entries: entries.slice(0, HISTORY_CAP), sources: { commits, checkIns } };
}
