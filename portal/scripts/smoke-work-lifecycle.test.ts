// THE WORK LIFECYCLE ON THE RIGHT SIDE — drafts, history, notes (phase 14).
//
//   Ed: "in the right side we also need notes and drafts version control logs
//   for the project in dev mode — they are all built just need throwing in"
//   and "saved drafts creates a branch or draft pr or something so it can be
//   resumed so its just super duper easy".
//
// The plan's rule, under test from both sides: THE REPOSITORY IS THE DRAFT
// STORE. A draft is the project's edit branch (`aqua-editor/<id>` — where
// every save already commits), a resume is reopening a changed file in the
// canvas, and publish is the branch's pull request. Nothing here invents a
// second draft store, and nothing here WRITES except a note.
//
// What is load-bearing:
//
// 1. THE STATE IS READ FROM WHAT THE WRITE PATH ACTUALLY CREATED. Every state
//    below is produced by the REAL `saveRepoFile` / `openProjectPullRequest`
//    over the stateful fake GitHub, then read back by `readDraftStatus`
//    through the REAL `compareRepoRefs` / `listBranchPullRequests` with only
//    the socket replaced. A stub status would pass while the panels lied.
// 2. THE FOUR STATES ARE SAID PLAINLY — no branch yet / commits waiting /
//    PR open at #N / merged — and no state's sentence ever contains the word
//    "saved": an edit that is only in the page is described as exactly that.
// 3. MERGED VS COMMITS cannot be told apart by aheadBy alone (a squash merge
//    leaves the branch forever ahead), so the discriminator is WHEN: commits
//    newer than the merge are a new round.
// 4. HISTORY IS ONE FEED WITH TWO HONEST SOURCES: draft-branch commits and
//    Dev Team check-ins, each labeled, and the commits half degrades to a
//    sentence — never a silently half-empty feed.
// 5. NOTES ARE A FIRST-CLASS PROJECT TAG on the thoughts ledger — and are
//    NEVER delivered to workers as instructions, in either reader.
//
// No network anywhere. The stateful fake GitHub is smoke-repo-write's
// (lineage: smoke-editor-words-publish → smoke-repo-write → here), extended
// with commit messages + dates, a compare endpoint and a state-aware pulls
// listing — because the lifecycle READS what the others only wrote.

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
// No test here ever wants the environment's real token ladder to answer.
delete process.env.GITHUB_TOKEN;

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The notes tests write a ledger — THEIR OWN, never Ed's real one. Same seam
// smoke-dev-thoughts uses; resolved per call, so setting it here covers the
// route too.
process.env.DEV_THOUGHTS_FILE = join(mkdtempSync(join(tmpdir(), "aqua-lifecycle-notes-")), "thoughts.json");

import {
  readDraftStatus,
  readWorkHistory,
  type WorkLifecycleDeps,
} from "../src/engines/editor/server/workLifecycle";
import {
  createRepoPath,
  mergeProjectPullRequest,
  openProjectPullRequest,
  revertMergedDraft,
  saveRepoFile,
  type MergeRevertDeps,
  type RepoWriteDeps,
} from "../src/engines/editor/server/repoWrite";
import { SourceEditUnavailable, editBranchName } from "../src/engines/editor/server/sourceEdit";
import { mergePullRequest, openPullRequest, publishEdits, type PublishRequest } from "../src/engines/editor/server/publish";
import { compareRepoRefs, listBranchPullRequests, type RepoFile } from "../src/engines/editor/server/githubSource";
import { hashFile } from "../src/engines/editor/server/codeAdapter";
import { POST } from "../src/app/api/portal/dev/lifecycle/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import {
  addThought,
  listThoughtsForProject,
  unacknowledgedCount,
  unreadFor,
} from "../src/lib/server/dev/devTeamThoughts";
import type { WorkerCheckIn } from "../src/lib/server/dev/devTeamWorkers";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { DevProject } from "../src/server/types";
import {
  EDITING_MODES,
  INSPECTOR_TABS,
  editingMode,
  inspectorTabsFor,
} from "../src/engines/editor/editing/modes";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const PANEL_FILE = "src/components/editing/WorkLifecyclePanel.tsx";
const EDITOR_FILE = "src/engines/editor/DevEditor.tsx";
const ROUTE_FILE = "src/app/api/portal/dev/lifecycle/route.ts";

/** Source with comments stripped, so prose about a rule never reads as code. */
const code = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

// ─── The project and the repository it points at ─────────────────────────────

function repoProject(fields: Partial<DevProject> = {}): DevProject {
  return {
    id: "proj_repo",
    agencyId: "agency_1",
    name: "Acme site",
    kind: "software",
    repository: "acme/site",
    ref: "main",
    createdAt: 0,
    updatedAt: 0,
    createdBy: "user_1",
    ...fields,
  } as DevProject;
}

const BRANCH = editBranchName(repoProject()); // aqua-editor/proj_repo

const PAGE = [
  `export default function Home() {`,
  `  return <main><h1>We build things</h1></main>;`,
  `}`,
].join("\n");

const BASE_FILES: Record<string, string> = { "src/app/page.tsx": PAGE };

/**
 * The stateful fake GitHub — smoke-repo-write's, extended AGAIN for reads.
 *
 * The predecessors tracked refs, ancestry, fast-forwards and contents; this
 * file's subject is DESCRIBING a branch, so the fake now also remembers each
 * commit's MESSAGE and a deterministic DATE (commit N is minute N), answers
 * `GET /compare/base...head` by walking its own ancestry the way git does,
 * and answers the pulls listing state-aware (`state=all` sees a merged PR;
 * `state=open` — the reuse path `openPullRequest` relies on — does not).
 * `mergePull` and `commitToBase` simulate the two things only a HUMAN or the
 * outside world does to this state: merging the PR, and base moving on.
 */
function fakeGitHub(baseFiles: Record<string, string> = BASE_FILES, baseSha = "sha_base") {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const refs = new Map<string, string>([["main", baseSha]]);
  const commits = new Map<string, { parents: string[]; tree: string; message: string; atMs: number }>([
    [baseSha, { parents: [], tree: "tree_base", message: "base", atMs: 0 }],
  ]);
  const trees = new Map<string, Record<string, string>>([["tree_base", { ...baseFiles }]]);
  const treeBase = new Map<string, string>();
  const pulls: Array<{ number: number; head: string; state: string; url: string; mergedAtMs?: number; updatedAtMs?: number }> = [];
  let treeCount = 0;
  let commitCount = 0;

  const snapshotAt = (commitSha: string): Record<string, string> => {
    const commit = commits.get(commitSha);
    if (!commit) throw new Error(`fake: unknown commit ${commitSha}`);
    const base = treeBase.get(commit.tree);
    const parent = base ? snapshotAt(base) : {};
    return { ...parent, ...(trees.get(commit.tree) ?? {}) };
  };

  const reachableFrom = (sha: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [sha];
    while (queue.length) {
      const current = queue.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(commits.get(current)?.parents ?? []));
    }
    return seen;
  };

  const isAncestor = (ancestor: string, sha: string): boolean => reachableFrom(sha).has(ancestor);

  // A "ref" is a branch name OR a commit sha, the way GitHub's contents and
  // compare APIs take either — the revert path reads files AT the fork sha.
  const headSha = (ref: string): string => {
    const tip = refs.get(ref) ?? (commits.has(ref) ? ref : undefined);
    if (!tip) throw new Error(`GitHub request failed (404). Branch ${ref} not found`);
    return tip;
  };

  const fileAt = (ref: string, path: string): RepoFile => {
    const snapshot = snapshotAt(headSha(ref));
    if (snapshot[path] !== undefined) {
      return { path, editable: true, contents: snapshot[path], fingerprint: hashFile(snapshot[path]) };
    }
    if (Object.keys(snapshot).some(existing => existing.startsWith(`${path}/`))) {
      return { path, editable: false, reason: "GitHub returned this file in a form the editor cannot read." };
    }
    throw new Error("GitHub request failed (404). Not Found");
  };

  /** Mark a PR merged (closed + merged_at), the way a human merging it would. */
  const mergePull = (number: number, atMs: number) => {
    const pr = pulls.find(item => item.number === number);
    if (!pr) throw new Error(`fake: no PR #${number}`);
    pr.state = "closed";
    pr.mergedAtMs = atMs;
    pr.updatedAtMs = atMs;
  };

  /** Somebody else lands a commit straight on a base ref. */
  const commitToBase = (ref: string, path: string, contents: string) => {
    commitCount += 1;
    treeCount += 1;
    const treeSha = `tree_sha_${treeCount}`;
    trees.set(treeSha, { [path]: contents });
    const parent = headSha(ref);
    treeBase.set(treeSha, parent);
    const sha = `commit_sha_${commitCount}`;
    commits.set(sha, { parents: [parent], tree: treeSha, message: `direct to ${ref}`, atMs: commitCount * 60_000 });
    refs.set(ref, sha);
    return sha;
  };

  const impl: typeof fetch = async (url, init) => {
    const path = String(url).replace("https://api.github.com", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method, path, body });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

    if (method === "GET" && path.includes("/git/ref/heads/")) {
      const branch = path.split("/git/ref/heads/")[1];
      const sha = refs.get(branch);
      return sha ? json({ object: { sha } }) : json({ message: "Not Found" }, 404);
    }
    if (method === "POST" && path.endsWith("/git/refs")) {
      const branch = String(body.ref).replace(/^refs\/heads\//, "");
      if (refs.has(branch)) return json({ message: "Reference already exists" }, 422);
      refs.set(branch, String(body.sha));
      return json({ ref: body.ref });
    }
    if (method === "POST" && path.endsWith("/git/trees")) {
      treeCount += 1;
      const sha = `tree_sha_${treeCount}`;
      const overlay: Record<string, string> = {};
      for (const entry of (body.tree as Array<{ path: string; content: string }> ?? [])) {
        overlay[entry.path] = entry.content;
      }
      trees.set(sha, overlay);
      treeBase.set(sha, String(body.base_tree));
      return json({ sha });
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      commitCount += 1;
      const sha = `commit_sha_${commitCount}`;
      commits.set(sha, {
        parents: Array.isArray(body.parents) ? body.parents.map(String) : [],
        tree: String(body.tree),
        message: String(body.message ?? ""),
        // Deterministic time: commit N happened at minute N.
        atMs: commitCount * 60_000,
      });
      return json({ sha });
    }
    if (method === "PATCH" && path.includes("/git/refs/heads/")) {
      const branch = path.split("/git/refs/heads/")[1];
      const current = refs.get(branch);
      if (!current) return json({ message: "Reference does not exist" }, 422);
      if (body.force !== true && !isAncestor(current, String(body.sha))) {
        return json({ message: "Update is not a fast forward" }, 422);
      }
      refs.set(branch, String(body.sha));
      return json({ ref: `refs/heads/${branch}` });
    }
    if (method === "POST" && path.endsWith("/pulls")) {
      const head = String(body.head);
      if (pulls.some(pr => pr.head === head && pr.state === "open")) {
        return json({ message: "A pull request already exists for this head" }, 422);
      }
      const number = pulls.length + 1;
      const pr = { number, head, state: "open", url: `https://github.com/acme/site/pull/${number}` };
      pulls.push(pr);
      return json({ number, html_url: pr.url, state: pr.state, merged: false });
    }
    if (method === "GET" && path.includes("/pulls?")) {
      const query = new URLSearchParams(path.split("?")[1]);
      const head = (query.get("head") ?? "").split(":")[1] ?? "";
      // State-aware, the way GitHub is: the default and "open" list open PRs
      // only; "all" is how the lifecycle sees a merged one.
      const state = query.get("state") ?? "open";
      return json(pulls
        .filter(pr => pr.head === head && (state === "all" || pr.state === state))
        .map(pr => ({
          number: pr.number,
          html_url: pr.url,
          state: pr.state,
          merged_at: pr.mergedAtMs ? new Date(pr.mergedAtMs).toISOString() : null,
          updated_at: pr.updatedAtMs ? new Date(pr.updatedAtMs).toISOString() : undefined,
        })));
    }
    if (method === "PUT" && /\/pulls\/\d+\/merge$/.test(path)) {
      // A SQUASH merge, the way this deployment merges: ONE new commit on the
      // base ref carrying the branch's content, the branch itself untouched —
      // which is exactly why base…branch stays ahead_by > 0 afterwards.
      const number = Number(path.match(/\/pulls\/(\d+)\/merge$/)![1]);
      const pr = pulls.find(item => item.number === number);
      if (!pr || pr.state !== "open") return json({ message: "Pull Request is not mergeable" }, 405);
      const branchName = pr.head;
      const branchTip = headSha(branchName);
      const mainTip = headSha("main");
      const baseSnapshot = snapshotAt(mainTip);
      const headSnapshot = snapshotAt(branchTip);
      const overlay: Record<string, string> = {};
      for (const [file, contents] of Object.entries(headSnapshot)) {
        if (baseSnapshot[file] !== contents) overlay[file] = contents;
      }
      treeCount += 1;
      const treeSha = `tree_sha_${treeCount}`;
      trees.set(treeSha, overlay);
      treeBase.set(treeSha, mainTip);
      commitCount += 1;
      const sha = `commit_sha_${commitCount}`;
      commits.set(sha, { parents: [mainTip], tree: treeSha, message: `squash #${number}`, atMs: commitCount * 60_000 });
      refs.set("main", sha);
      pr.state = "closed";
      pr.mergedAtMs = commitCount * 60_000;
      pr.updatedAtMs = commitCount * 60_000;
      return json({ merged: true, message: "Pull Request successfully merged" });
    }
    if (method === "GET" && path.includes("/compare/")) {
      const raw = path.split("/compare/")[1];
      const [basePart, headPart] = raw.split("...");
      const baseTip = headSha(decodeURIComponent(basePart));
      const headTip = headSha(decodeURIComponent(headPart));
      const fromBase = reachableFrom(baseTip);
      const fromHead = reachableFrom(headTip);
      // Commits on head that base lacks, oldest first — the way GitHub answers.
      const ahead = [...fromHead].filter(sha => !fromBase.has(sha))
        .sort((a, b) => commits.get(a)!.atMs - commits.get(b)!.atMs);
      const behind = [...fromBase].filter(sha => !fromHead.has(sha));
      // The fork point: the newest commit both sides can reach.
      const common = [...fromBase].filter(sha => fromHead.has(sha))
        .sort((a, b) => commits.get(b)!.atMs - commits.get(a)!.atMs);
      // `files` is the CONTENT diff between the two tips — GitHub's answer,
      // and the reason a squash-merged branch compares with EMPTY files while
      // its commits still count: the contents are equal, the shas are not.
      const baseSnapshot = snapshotAt(baseTip);
      const headSnapshot = snapshotAt(headTip);
      const files: Array<{ filename: string; status: string }> = [];
      for (const [file, contents] of Object.entries(headSnapshot)) {
        if (baseSnapshot[file] === undefined) files.push({ filename: file, status: "added" });
        else if (baseSnapshot[file] !== contents) files.push({ filename: file, status: "modified" });
      }
      for (const file of Object.keys(baseSnapshot)) {
        if (headSnapshot[file] === undefined) files.push({ filename: file, status: "removed" });
      }
      return json({
        ahead_by: ahead.length,
        behind_by: behind.length,
        merge_base_commit: common.length ? { sha: common[0] } : undefined,
        commits: ahead.map(sha => ({
          sha,
          html_url: `https://github.com/acme/site/commit/${sha}`,
          commit: {
            message: commits.get(sha)!.message,
            author: { name: "Aqua Editor", date: new Date(commits.get(sha)!.atMs).toISOString() },
          },
        })),
        files: files.map(file => ({ ...file, additions: 1, deletions: 0 })),
      });
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };

  return { impl, calls, refs, commits, pulls, snapshotAt, headSha, fileAt, mergePull, commitToBase };
}

/** A named Dev Team check-in, for the history feed. */
function checkIn(name: string, status: string, at: number): WorkerCheckIn {
  return { name, status, plan: "dev-editor-finish", phase: "14", at };
}

/**
 * The dep set: writes through the REAL saveRepoFile/publishEdits/
 * openPullRequest, reads back through the REAL compareRepoRefs/
 * listBranchPullRequests — every one with only the socket replaced.
 */
function deps(files: Record<string, string> = BASE_FILES, checkIns: WorkerCheckIn[] = []) {
  const github = fakeGitHub(files);
  const published: PublishRequest[] = [];
  const value: RepoWriteDeps & WorkLifecycleDeps & MergeRevertDeps & { github: ReturnType<typeof fakeGitHub> } = {
    githubToken: "token_from_the_vault",
    readFile: async (source, path) => github.fileAt(source.ref, path),
    readHeadSha: async source => github.headSha(source.ref),
    publish: async request => {
      published.push(request);
      return publishEdits({ ...request, fetchImpl: github.impl });
    },
    openPr: async input => openPullRequest({ ...input, fetchImpl: github.impl }),
    compare: async (source, head) => compareRepoRefs({ ...source, fetchImpl: github.impl }, head),
    listPrs: async (source, branch) => listBranchPullRequests({ ...source, fetchImpl: github.impl }, branch),
    merge: async input => mergePullRequest({ ...input, fetchImpl: github.impl }),
    checkIns: async () => checkIns,
    github,
  };
  return value;
}

const V2 = PAGE.replace("We build things", "We build better things");
const V3 = PAGE.replace("We build things", "We build the best things");

async function save(dependencies: ReturnType<typeof deps>, contents: string, expected: string, message?: string) {
  const result = await saveRepoFile({
    agencyId: "agency_1", project: repoProject(),
    path: "src/app/page.tsx", contents, fingerprint: hashFile(expected), confirm: true, message,
  }, dependencies);
  assert.equal(result.ok, true, "the arrange step's save must land");
  return result;
}

// ─── The tabs: Dev-only, offered on every developer target ──────────────────

describe("the lifecycle tabs — declared on the developer ladder only", () => {
  it("drafts, history and notes are developer-depth tabs and no other mode's", () => {
    for (const tab of ["drafts", "history", "notes"]) {
      assert.ok(editingMode("developer").tabs.includes(tab), `developer must offer ${tab}`);
      for (const mode of EDITING_MODES) {
        if (mode.id === "developer") continue;
        assert.equal(mode.tabs.includes(tab), false, `${mode.id} must not offer ${tab}`);
      }
      assert.ok((INSPECTOR_TABS as readonly string[]).includes(tab), `${tab} must be a real rail tab`);
    }
  });

  it("rides the rail on EVERY developer target — a repo-less project is told in the panel, not by a vanishing tab", () => {
    for (const portalTarget of [true, false]) {
      for (const tagMapped of [true, false]) {
        // `surface` added 2026-08-22 (phase 9). The lifecycle trio is on the
        // DEPTH ladder, so it must be offered on either surface — walking both
        // is stronger than the single call this replaced.
        const tabs = [
          ...inspectorTabsFor("developer", { portalTarget, tagMapped, surface: "normal" }),
          ...inspectorTabsFor("developer", { portalTarget, tagMapped, surface: "website" }),
        ] as readonly string[];
        for (const tab of ["drafts", "history", "notes"]) {
          assert.ok(tabs.includes(tab), `developer must offer ${tab} (portalTarget=${portalTarget}, tagMapped=${tagMapped})`);
        }
      }
    }
  });
});

// ─── DRAFTS — the branch state, said plainly ─────────────────────────────────

describe("readDraftStatus — the four states, read from what the write path created", () => {
  it("NO BRANCH: the honest zero — nothing exists until the first save, and it says where an edit lives", async () => {
    const dependencies = deps();
    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "none");
    assert.equal(status.branch, BRANCH);
    assert.equal(status.aheadBy, 0);
    assert.deepEqual(status.files, []);
    assert.deepEqual(status.commits, []);
    assert.match(status.line, /No draft yet/);
    assert.match(status.line, new RegExp(BRANCH.replace(/[/\\]/g, "\\$&")));
    assert.match(status.line, /lives only in this page/);
  });

  it("COMMITS WAITING: real saves become the files + commits the panel shows, newest commit first", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE, "first words");
    await save(dependencies, V3, V2, "second words");

    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "commits");
    assert.equal(status.aheadBy, 2);
    assert.match(status.line, /2 commits waiting on /);
    assert.match(status.line, /Publish opens the pull request/);
    // The aggregate diff — ONE row for the file both commits touched.
    assert.deepEqual(status.files.map(file => ({ path: file.path, status: file.status })),
      [{ path: "src/app/page.tsx", status: "modified" }]);
    // Newest first for display — GitHub answers oldest first and the module
    // is the one that has to flip it, so pin the order by message.
    assert.deepEqual(status.commits.map(commit => commit.message), ["second words", "first words"]);
    assert.equal(status.pullRequest, undefined);
  });

  it("PR OPEN: the existing publish control's PR is the state, with its number", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    const opened = await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(opened.ok, true);

    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "pr-open");
    assert.match(status.line, /Pull request #1 is open with 1 commit/);
    assert.match(status.line, /Merging it is what puts this on main/);
    assert.equal(status.pullRequest?.number, 1);
    assert.equal(status.pullRequest?.merged, false);
  });

  it("MERGED: a squash merge leaves the branch ahead forever — the WHEN is what says the work is in", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);          // commit at minute 1
    await save(dependencies, V3, V2);            // commit at minute 2
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    dependencies.github.mergePull(1, 150_000);   // merged between minutes 2 and 3

    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    // aheadBy is still 2 — the squash reality — and the state is STILL merged.
    assert.equal(status.aheadBy, 2);
    assert.equal(status.state, "merged");
    assert.match(status.line, /Merged — pull request #1 put this branch's work on main/);
    assert.equal(status.pullRequest?.merged, true);
  });

  it("…and a save AFTER the merge is a new round of commits waiting, not 'merged'", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    dependencies.github.mergePull(1, 90_000);    // merged between minutes 1 and 2
    await save(dependencies, V3, V2, "the new round"); // commit at minute 2 — AFTER the merge

    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "commits");
    assert.match(status.line, /waiting on /);
    // The previous round's PR is still named — history, not the state.
    assert.equal(status.pullRequest?.merged, true);
  });

  it("says when the base has MOVED under the draft — the re-map warning, not a hidden field", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    dependencies.github.commitToBase("main", "src/other.tsx", "export const x = 1;");

    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.behindBy, 1);
    assert.match(status.line, /main has moved 1 commit since/);
  });

  it("EMPTY: a branch pointing at base holds nothing — said as that, never as 'merged'", async () => {
    const dependencies = deps();
    dependencies.github.refs.set(BRANCH, "sha_base");
    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "empty");
    assert.match(status.line, /holds nothing main lacks/);
  });

  it("NEVER says 'saved' — in any state's sentence", async () => {
    // The honesty rule of the whole phase, checked against the REAL sentences:
    // "saved" belongs to nothing here, because a commit is a commit and a
    // page-only edit is a page-only edit.
    const dependencies = deps();
    const lines: string[] = [];
    lines.push((await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies)).line);
    await save(dependencies, V2, PAGE);
    lines.push((await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies)).line);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    lines.push((await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies)).line);
    dependencies.github.mergePull(1, 999_000);
    lines.push((await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies)).line);
    for (const line of lines) {
      assert.doesNotMatch(line, /\bsaved\b/i, `"${line}" claims something was saved`);
    }
  });

  it("refuses without a repository — the lifecycle lives in git, and says so", async () => {
    await assert.rejects(
      readDraftStatus({ agencyId: "agency_1", project: repoProject({ repository: "" }) }, deps()),
      (error: unknown) => error instanceof SourceEditUnavailable && error.code === "no-repository",
    );
  });

  it("a read failure that is NOT a 404 surfaces — it is never mistaken for 'no draft'", async () => {
    const dependencies = deps();
    dependencies.readHeadSha = async () => { throw new Error("GitHub request failed (401). Bad credentials"); };
    await assert.rejects(
      readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies),
      /401/,
    );
  });
});

// ─── HISTORY — one feed, two honest sources ──────────────────────────────────

describe("readWorkHistory — commits and check-ins, one feed, each source named", () => {
  it("merges the two sources newest first, each entry labeled with what it is", async () => {
    const dependencies = deps(BASE_FILES, [checkIn("verifier", "auditing phase 14", 90_000)]);
    await save(dependencies, V2, PAGE, "first words");   // minute 1
    await save(dependencies, V3, V2, "second words");    // minute 2

    const history = await readWorkHistory({ agencyId: "agency_1", project: repoProject() }, dependencies);
    // Check-in at 90s sits between the two commits — the merge is BY TIME,
    // not commits-then-check-ins.
    assert.deepEqual(history.entries.map(entry => entry.source), ["commit", "check-in", "commit"]);
    assert.deepEqual(history.entries.map(entry => entry.title),
      ["second words", "verifier — auditing phase 14", "first words"]);
    const commit = history.entries[0];
    assert.ok(commit.source === "commit" && commit.sha && commit.detail.includes(BRANCH),
      "a commit entry names its sha and its branch");
    assert.equal(history.sources.commits.searched, true);
    assert.match(history.sources.commits.detail, /2 commits on /);
    // The check-ins half says WHAT IT IS — workers here, not commits there.
    assert.match(history.sources.checkIns.detail, /workers in this workspace, not commits on the project/);
  });

  it("degrades the commits half to a SENTENCE when there is no repository — the check-ins still answer", async () => {
    const dependencies = deps(BASE_FILES, [checkIn("worker-a", "building", 50_000)]);
    const history = await readWorkHistory({ agencyId: "agency_1", project: repoProject({ repository: "" }) }, dependencies);
    assert.equal(history.sources.commits.searched, false);
    assert.match(history.sources.commits.detail, /no repository/i);
    assert.deepEqual(history.entries.map(entry => entry.source), ["check-in"]);
  });

  it("an empty branch is 'no commits YET', not silence", async () => {
    const dependencies = deps();
    const history = await readWorkHistory({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(history.sources.commits.searched, true);
    assert.match(history.sources.commits.detail, /No draft branch yet .* commits appear after the first save/);
  });
});

// ─── MERGE — inside the editor, exactly as dangerous as it is ────────────────

describe("mergeProjectPullRequest — the in-editor merge, confirm-gated", () => {
  it("without confirm it is a DRY RUN — the PR stays open and base does not move", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);

    const result = await mergeProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.merged, false);
    assert.match(result.message, /Dry run — nothing was merged/);
    assert.equal(dependencies.github.pulls[0].state, "open");
    assert.equal(dependencies.github.refs.get("main"), "sha_base", "the base ref never moves on a dry run");
  });

  it("confirm merges: base gains the draft, the PR closes, and the STATUS reads merged — end to end", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);

    const result = await mergeProjectPullRequest({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.merged, true);
    assert.equal(result.pullRequest.number, 1);
    assert.match(result.message, /Merged pull request #1/);

    const github = dependencies.github;
    const mainTip = github.refs.get("main")!;
    assert.notEqual(mainTip, "sha_base", "the squash commit landed on main");
    assert.equal(github.snapshotAt(mainTip)["src/app/page.tsx"], V2, "main now carries the draft's contents");
    assert.equal(github.pulls[0].state, "closed");

    // …and the Drafts tab, read through the same fake, now says merged.
    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "merged");
  });

  it("with no open pull request it refuses with the way forward — publish first", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    const result = await mergeProjectPullRequest({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no-pull-request");
    assert.match(result.error, /publish first/);
  });
});

// ─── REVERT — the revert is itself a draft ───────────────────────────────────

describe("revertMergedDraft — taking a merged draft back, through the same lifecycle", () => {
  /** save → publish → MERGE, the state a revert starts from. */
  async function mergedDraft(dependencies: ReturnType<typeof deps>) {
    await save(dependencies, V2, PAGE);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    const merged = await mergeProjectPullRequest({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);
    assert.equal(merged.ok, true, "the arrange step's merge must land");
  }

  it("previews first: the dry run names what would be restored and writes NOTHING", async () => {
    const dependencies = deps();
    await mergedDraft(dependencies);
    const branchTipBefore = dependencies.github.refs.get(BRANCH);
    const mainTipBefore = dependencies.github.refs.get("main");

    const result = await revertMergedDraft({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.published, false);
    assert.deepEqual(result.files.map(file => ({ path: file.path, action: file.action })),
      [{ path: "src/app/page.tsx", action: "restore" }]);
    assert.match(result.summary, /Nothing committed yet/);
    assert.match(result.summary, /the revert is itself a draft/);
    assert.equal(dependencies.github.refs.get(BRANCH), branchTipBefore, "the draft branch did not move");
    assert.equal(dependencies.github.refs.get("main"), mainTipBefore, "base did not move either");
  });

  it("confirm restores onto the DRAFT BRANCH — base untouched — and the loop continues: commits → publish → PR #2", async () => {
    const dependencies = deps();
    await mergedDraft(dependencies);
    const mainTipBefore = dependencies.github.refs.get("main")!;

    const result = await revertMergedDraft({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.published, true);
    assert.equal(result.commitShas.length, 1);
    assert.match(result.summary, /publish opens its pull request, and merging that is what changes the site/);

    const github = dependencies.github;
    // The restore is ON THE DRAFT BRANCH…
    assert.equal(github.snapshotAt(github.refs.get(BRANCH)!)["src/app/page.tsx"], PAGE, "the branch tip says what it said before the draft");
    // …and NEVER a direct write to base: main still carries the merged draft
    // until the revert's own PR is merged.
    assert.equal(github.refs.get("main"), mainTipBefore, "reverting never writes to the base branch");
    assert.equal(github.snapshotAt(mainTipBefore)["src/app/page.tsx"], V2);

    // The lifecycle reads it as a NEW ROUND, and publish opens PR #2.
    const status = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(status.state, "commits");
    const published = await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(published.ok, true);
    if (!published.ok) return;
    assert.equal(published.pullRequest.number, 2, "the revert gets its own pull request");
    const after = await readDraftStatus({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(after.state, "pr-open");
    assert.equal(after.pullRequest?.number, 2);
  });

  it("a file the draft ADDED is skipped WITH A NOTE — this path cannot delete, and says so", async () => {
    const dependencies = deps();
    const created = await createRepoPath({
      agencyId: "agency_1", project: repoProject(),
      path: "src/new-section.tsx", kind: "file", contents: "export const n = 1;\n", confirm: true,
    }, dependencies);
    assert.equal(created.ok, true);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    await mergeProjectPullRequest({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);

    const result = await revertMergedDraft({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.files.map(file => file.action), ["skip-added"]);
    assert.match(result.files[0].note, /cannot delete/);
    assert.match(result.summary, /stays in place/);
  });

  it("refuses while a pull request is still OPEN — merge it or close it first", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    const result = await revertMergedDraft({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no-pull-request");
    assert.match(result.error, /still open/);
  });

  it("refuses when nothing was ever merged — there is nothing on the site to take back", async () => {
    const dependencies = deps();
    await save(dependencies, V2, PAGE);
    const result = await revertMergedDraft({ agencyId: "agency_1", project: repoProject(), confirm: true }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "nothing-to-revert");
    assert.match(result.error, /Nothing merged/);
  });
});

// ─── NOTES — a first-class project tag on the thoughts ledger ────────────────

describe("project notes ride the thoughts ledger without becoming worker instructions", () => {
  it("listThoughtsForProject answers ONLY that project's notes", async () => {
    await addThought({ text: "note on A", author: "Ed", projectId: "proj_a" });
    await addThought({ text: "note on B", author: "Ed", projectId: "proj_b" });
    await addThought({ text: "a general worker note", author: "Ed" });

    const forA = await listThoughtsForProject("proj_a");
    assert.deepEqual(forA.map(note => note.text), ["note on A"]);
    assert.deepEqual((await listThoughtsForProject("proj_missing")), []);
  });

  it("a project note is NEVER delivered to a worker, and never lights the console badge", async () => {
    // The failure this pins: a note with no `worker` reads as "for everyone",
    // so without the projectId exclusion every worker would have been handed
    // Ed's editor notes as unread instructions.
    const before = (await unreadFor("worker-lifecycle-test")).length;
    const badgeBefore = await unacknowledgedCount();
    await addThought({ text: "editor note, not an instruction", author: "Ed", projectId: "proj_a" });
    assert.equal((await unreadFor("worker-lifecycle-test")).length, before);
    assert.equal(await unacknowledgedCount(), badgeBefore);
  });

  it("the OTHER reader — worker-thoughts.mjs — excludes project notes too", () => {
    // Two independent readers of one ledger; both must hold the rule.
    const mjs = read("scripts", "worker-thoughts.mjs");
    assert.match(mjs, /!t\.projectId &&/);
  });
});

// ─── The route — the same layered gate as every dev surface ─────────────────

let seq = 0;

async function founder(name = "Lifecycle Co") {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name, slug: `lifecycle-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@lifecycle.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "lifecycle-operator-pass",
  });
  return {
    agencyId: agency.id,
    userId: user.id,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

type RouteBody = {
  ok?: boolean; error?: string; code?: string;
  status?: { state: string };
  history?: { sources: { commits: { searched: boolean; detail: string } } };
  notes?: Array<{ text: string; author: string }>;
  note?: { text: string; author: string };
};

async function call(token: string, body: unknown): Promise<{ status: number; body: RouteBody }> {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/lifecycle",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ) as never)));
  return { status: response.status, body: await response.json() as RouteBody };
}

before(async () => {
  await ensureHydrated();
});

describe("the lifecycle route — gate, tenancy, and honest refusals", () => {
  it("keeps the owner baseline active without Dev Mode and still tenant-resolves the project", async () => {
    const home = await founder();
    const response = await withSession(home.token, () => POST(new Request(
      "http://localhost/api/portal/dev/lifecycle",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", project: "x" }) },
    ) as never));
    assert.equal(response.status, 404);
  });

  it("answers a foreign project id EXACTLY like an invented one", async () => {
    const home = await founder();
    const other = await founder("Other Co");
    const foreign = saveDevProject({ agencyId: other.agencyId, name: "Foreign", actorUserId: other.userId });

    const guessed = await call(home.token, { action: "status", project: foreign.id });
    const invented = await call(home.token, { action: "status", project: "proj_does_not_exist" });
    assert.equal(guessed.status, 404);
    assert.equal(invented.status, 404);
    assert.equal(guessed.body.error, invented.body.error);
  });

  it("status without a repository is the no-repository sentence, as a 409 — same shape as repo-write's", async () => {
    const home = await founder();
    const project = saveDevProject({ agencyId: home.agencyId, name: "No repo yet", actorUserId: home.userId });
    const { status, body } = await call(home.token, { action: "status", project: project.id });
    assert.equal(status, 409);
    assert.equal(body.code, "no-repository");
    assert.match(body.error ?? "", /no repository/i);
  });

  it("status with a repository but no token is the Connect-GitHub sentence — never a hang or a real call", async () => {
    const home = await founder();
    const project = saveDevProject({ agencyId: home.agencyId, name: "Repo, no token", repository: "acme/site", actorUserId: home.userId });
    const { status, body } = await call(home.token, { action: "status", project: project.id });
    assert.equal(status, 409);
    assert.equal(body.code, "no-token");
    assert.match(body.error ?? "", /Connect GitHub/);
  });

  it("history DEGRADES instead of refusing: the commits half is a sentence, the feed still answers", async () => {
    const home = await founder();
    const project = saveDevProject({ agencyId: home.agencyId, name: "No repo", actorUserId: home.userId });
    const { status, body } = await call(home.token, { action: "history", project: project.id });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.history?.sources.commits.searched, false);
    assert.match(body.history?.sources.commits.detail ?? "", /no repository/i);
  });

  it("add-note signs the SESSION user, lists per project, and refuses an empty note", async () => {
    const home = await founder();
    const mine = saveDevProject({ agencyId: home.agencyId, name: "Mine", actorUserId: home.userId });
    const sibling = saveDevProject({ agencyId: home.agencyId, name: "Sibling", actorUserId: home.userId });

    const added = await call(home.token, { action: "add-note", project: mine.id, text: "ship the drafts tab" });
    assert.equal(added.status, 200);
    // The author is who is SIGNED IN, resolved server-side — the browser
    // never gets to sign somebody else's name.
    assert.equal(added.body.note?.author, "Operator");

    const listed = await call(home.token, { action: "notes", project: mine.id });
    assert.deepEqual(listed.body.notes?.map(note => note.text), ["ship the drafts tab"]);
    const siblingListed = await call(home.token, { action: "notes", project: sibling.id });
    assert.deepEqual(siblingListed.body.notes, []);

    const empty = await call(home.token, { action: "add-note", project: mine.id, text: "   " });
    assert.equal(empty.status, 400);
  });

  it("names its actions when asked for nothing, and requires a project always", async () => {
    const home = await founder();
    const project = saveDevProject({ agencyId: home.agencyId, name: "P", actorUserId: home.userId });
    const nothing = await call(home.token, { action: undefined, project: project.id } as never);
    assert.equal(nothing.status, 400);
    assert.match(nothing.body.error ?? "", /status, history, notes/);
    const noProject = await call(home.token, { action: "status" });
    assert.equal(noProject.status, 400);
  });

  it("has no GET to widen — a draft's file list names unshipped work", async () => {
    const routeModule = await import("../src/app/api/portal/dev/lifecycle/route");
    assert.equal("GET" in routeModule, false);
    assert.match(read(ROUTE_FILE.split("/")[0], ...ROUTE_FILE.split("/").slice(1)), /POST only/);
  });
});

// ─── The screen: honesty pins over the panel and the mount ──────────────────

describe("the panels say the lifecycle honestly and reuse the one publish control", () => {
  const panel = read(...PANEL_FILE.split("/"));
  const editor = read(...EDITOR_FILE.split("/"));

  it("publish, merge and revert are all the EXISTING repo-write door — no second write path", () => {
    assert.match(panel, /REPO_WRITE_ENDPOINT = "\/api\/portal\/dev\/repo-write"/);
    assert.match(panel, /action: "publish"/);
    assert.match(panel, /action: "merge"/);
    assert.match(panel, /action: "revert"/);
    // The lifecycle endpoint itself is read-mostly: its only write is a note.
    const routeSource = code(read(...ROUTE_FILE.split("/")));
    assert.doesNotMatch(routeSource, /saveRepoFile|createRepoPath|publishEdits|openPullRequest|mergeProjectPullRequest|revertMergedDraft/);
  });

  it("merge lives INSIDE the editor — a confirm step, never a link out to GitHub", () => {
    // Ed: "no everything inside the editor thats the whole point of it".
    assert.match(panel, /Confirm merge/);
    assert.match(panel, /Confirm revert/);
    const stripped = code(panel);
    assert.doesNotMatch(stripped, /target="_blank"/, "no control may send the operator out to GitHub");
    assert.doesNotMatch(stripped, /github\.com/, "no hardcoded GitHub address either");
    // The dangerous pair sends confirm: true only from its second press; the
    // server dry-runs anything unconfirmed regardless.
    assert.match(panel, /action: "merge", project: projectId, confirm: true/);
  });

  it("shows the SERVER's state sentence verbatim — the panel never improves on it", () => {
    assert.match(panel, /\{status\.line\}/);
  });

  it("renders the one lifecycle ladder — page → branch → PR → merged", () => {
    for (const stage of ["In this page only", "On the draft branch", "Pull request open", "Merged — on the site"]) {
      assert.ok(panel.includes(stage), `the ladder lost "${stage}"`);
    }
  });

  it("resume is the editor's own open-a-file seam, wired from the Drafts tab", () => {
    assert.match(panel, /onOpenFile\(file\.path\)/);
    assert.match(editor, /<DraftsPanel projectId=\{projectId \?\? ""\} onOpenFile=\{onOpenFile\} \/>/);
    assert.match(editor, /<HistoryPanel projectId=\{projectId \?\? ""\} \/>/);
    assert.match(editor, /<NotesPanel projectId=\{projectId \?\? ""\} \/>/);
    // Opening = focusing the path into the code canvas, which Dev mode shows.
    assert.match(editor, /function openFileInCanvas\(path: string\) \{\s*\n\s*setSourceFocus\(\{ path \}\);/);
    // The Librarian's promised Open seam landed with the same mechanism.
    assert.match(editor, /<LibrarianPanel projectId=\{projectId\} onOpenFile=\{onOpenFile\} \/>/);
  });

  it("wears the editor's clothes — the skin module, never a --dt-* token", () => {
    assert.match(panel, /from "@\/components\/editing\/editorAiSkin"/);
    assert.doesNotMatch(panel, /--dt-[a-z]/);
  });

  it("the panel's OWN words never claim a save or a changed site", () => {
    // The server sentence is the only state sentence; the panel's static copy
    // must not add a "saved" of its own, and must keep the merge honest.
    const stripped = code(panel);
    assert.doesNotMatch(stripped, /\bSaved\b/);
    assert.match(panel, /Nothing reaches the site until its pull request is merged/);
  });
});
