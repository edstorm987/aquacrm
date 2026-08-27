// THE REPO WRITE PATH — create, save, publish.
//
//   Ed, blocked live: "its not letting me add new files folders... dont think
//   publishing works either"
//
// Before this, a repository-backed project could be READ everywhere and
// WRITTEN nowhere: the files route 409'd (correctly — local disk is not the
// repo), the "+" was disabled with "create the file there and publish", and
// nothing implemented the creating or the publishing. What is under test is
// the GitHub alternative that refusal always pointed at: a save is a commit on
// the project's draft branch, a new file or folder is a committed blob (or a
// .gitkeep), and publish opens — or finds — the branch's pull request.
//
// Everything runs through the words editor's proven machinery. `publishEdits`
// is the REAL one in every commit test here, running against the stateful
// fake GitHub below — the fake that tracks refs, commit ancestry and (new for
// this file) the CONTENTS each commit put where, and enforces the
// fast-forward rule the way GitHub does. A stub that returned
// `published: true` would pass every test while the real code lost an edit.
//
// The properties that are load-bearing:
//
// 1. THE DRAFT BRANCH IS THE TRUTH once it exists. The current copy is read
//    from the branch tip, so the second save is judged against the first —
//    reading base instead is the lost-update bug the words editor already
//    met and fixed.
// 2. THE FINGERPRINT FROM READ TIME is re-checked against what is actually
//    there at save time. A mismatch refuses; it never overwrites.
// 3. THE SAME PATH RULES as local disk: hidden paths cannot be written or
//    created, traversal dies at normalisation, and nothing reaches GitHub
//    when a path is refused.
// 4. NOTHING IS COMMITTED without `confirm === true`, and the pull request is
//    opened once and REUSED — pressing publish twice is boring.
//
// No network anywhere: reads are injected deps over the fake's state, commits
// go through the real publishEdits with only the socket replaced, and the
// route tests exercise only the paths that return before a request is made.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import { readFileSync } from "node:fs";

import {
  createRepoPath,
  normalizeRepoPath,
  openProjectPullRequest,
  saveRepoFile,
  type RepoWriteDeps,
} from "../src/engines/editor/server/repoWrite";
import { SourceEditUnavailable, editBranchName } from "../src/engines/editor/server/sourceEdit";
import { openPullRequest, publishEdits, type PublishRequest } from "../src/engines/editor/server/publish";
import { hashFile } from "../src/engines/editor/server/codeAdapter";
import { MAX_EDITABLE_BYTES } from "../src/engines/editor/server/fileTree";
import type { RepoFile } from "../src/engines/editor/server/githubSource";
import { POST } from "../src/app/api/portal/dev/repo-write/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { DevProject } from "../src/server/types";

const CANVAS_FILE = new URL("../src/components/editing/EditorCodeCanvas.tsx", import.meta.url);
const EDITOR_FILE = new URL("../src/engines/editor/DevEditor.tsx", import.meta.url);
const ROUTE_FILE = new URL("../src/app/api/portal/dev/repo-write/route.ts", import.meta.url);
const FILES_ROUTE = new URL("../src/app/api/portal/site-editor/files/route.ts", import.meta.url);

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
 * The stateful fake GitHub, extended: it now remembers WHAT each commit put
 * WHERE, not just that a commit happened.
 *
 * Its predecessor (smoke-editor-words-publish.test.ts) tracked refs and
 * commit ancestry and enforced the fast-forward rule — which is what caught
 * every second edit 422ing. This file's subject is whole-file writes, where
 * the dangerous failure is a save that silently REVERTS an earlier one — and
 * only a fake that can answer "what does this path hold at this branch tip?"
 * can catch that. So trees record their file contents, commits point at their
 * trees, and a snapshot walks the ancestry exactly like git does.
 *
 * It also answers the two pull-request calls, statefully: a second open for
 * the same head is refused the way GitHub refuses it (422), which is what
 * forces `openPullRequest`'s find-and-reuse path to actually run.
 */
function fakeGitHub(baseFiles: Record<string, string> = BASE_FILES, baseSha = "sha_base") {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  /** branch name → the commit sha it points at. */
  const refs = new Map<string, string>([["main", baseSha]]);
  /** commit sha → parents + the tree it carries. */
  const commits = new Map<string, { parents: string[]; tree: string }>([[baseSha, { parents: [], tree: "tree_base" }]]);
  /** tree sha → the file contents that tree ADDS over its base. */
  const trees = new Map<string, Record<string, string>>([["tree_base", { ...baseFiles }]]);
  /** tree sha → the commit its `base_tree` named (publishEdits passes the parent commit). */
  const treeBase = new Map<string, string>();
  const pulls: Array<{ number: number; head: string; state: string; url: string }> = [];
  let treeCount = 0;
  let commitCount = 0;

  /** Every file visible at a commit, walked through ancestry like git. */
  const snapshotAt = (commitSha: string): Record<string, string> => {
    const commit = commits.get(commitSha);
    if (!commit) throw new Error(`fake: unknown commit ${commitSha}`);
    const base = treeBase.get(commit.tree);
    const parent = base ? snapshotAt(base) : {};
    return { ...parent, ...(trees.get(commit.tree) ?? {}) };
  };

  /** Is `ancestor` reachable from `sha` by walking parents? */
  const isAncestor = (ancestor: string, sha: string): boolean => {
    const queue = [sha];
    const seen = new Set<string>();
    while (queue.length) {
      const current = queue.pop()!;
      if (current === ancestor) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(commits.get(current)?.parents ?? []));
    }
    return false;
  };

  /** What real `readRepoHeadSha` answers, off the fake's state. 404s like GitHub. */
  const headSha = (ref: string): string => {
    const tip = refs.get(ref);
    if (!tip) throw new Error(`GitHub request failed (404). Branch ${ref} not found`);
    return tip;
  };

  /**
   * What real `readRepoFile` answers, off the fake's state. A directory
   * resolves the way the contents API resolves one — as something that is
   * there but is not a readable file — and a missing path throws a 404,
   * because "exists" and "cannot be read" are different answers and the
   * create path turns on the difference.
   */
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
      });
      return json({ sha });
    }
    if (method === "PATCH" && path.includes("/git/refs/heads/")) {
      const branch = path.split("/git/refs/heads/")[1];
      const current = refs.get(branch);
      if (!current) return json({ message: "Reference does not exist" }, 422);
      // THE rule: a non-forced update must be a fast-forward.
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
      return json(pulls
        .filter(pr => pr.head === head && pr.state === "open")
        .map(pr => ({ number: pr.number, html_url: pr.url, state: pr.state })));
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };

  return { impl, calls, refs, commits, pulls, snapshotAt, headSha, fileAt };
}

/**
 * The dep set: reads answered off the fake's state, commits through the REAL
 * `publishEdits` and pull requests through the REAL `openPullRequest`, each
 * with only the socket replaced. `reads` and `published` record what was asked
 * for, so "did it read the branch?" and "what token did it carry?" are
 * assertable.
 */
function deps(files: Record<string, string> = BASE_FILES) {
  const github = fakeGitHub(files);
  const reads: Array<{ ref: string; path: string }> = [];
  const published: PublishRequest[] = [];
  const value: RepoWriteDeps & {
    github: ReturnType<typeof fakeGitHub>;
    reads: typeof reads;
    published: typeof published;
  } = {
    githubToken: "token_from_the_vault",
    readFile: async (source, path) => {
      reads.push({ ref: source.ref, path });
      return github.fileAt(source.ref, path);
    },
    readHeadSha: async source => github.headSha(source.ref),
    publish: async request => {
      published.push(request);
      return publishEdits({ ...request, fetchImpl: github.impl });
    },
    openPr: async input => openPullRequest({ ...input, fetchImpl: github.impl }),
    github,
    reads,
    published,
  };
  return value;
}

const V2 = PAGE.replace("We build things", "We build better things");
const V3 = PAGE.replace("We build things", "We build the best things");

// ─── Paths, before anything else ─────────────────────────────────────────────

describe("repository paths are normalised, then refused", () => {
  it("normalises the spellings that mean the same place", () => {
    assert.deepEqual(normalizeRepoPath("src/app/page.tsx"), { ok: true, path: "src/app/page.tsx" });
    assert.deepEqual(normalizeRepoPath("./src//app/page.tsx"), { ok: true, path: "src/app/page.tsx" });
    assert.deepEqual(normalizeRepoPath(" src/app/page.tsx "), { ok: true, path: "src/app/page.tsx" });
    assert.deepEqual(normalizeRepoPath("src/app/"), { ok: true, path: "src/app" });
  });

  it("refuses traversal however it is spelled", () => {
    for (const path of ["../secrets", "src/../../x", "a/../../b", "src\\..\\x", "bad\0path"]) {
      const checked = normalizeRepoPath(path);
      assert.equal(checked.ok, false, `${JSON.stringify(path)} must be refused`);
    }
  });

  it("refuses the hidden paths — .env in a repository is still a credential file", () => {
    for (const path of [".env", "config/.env.production", ".git/config", ".data/portal-state.json"]) {
      const checked = normalizeRepoPath(path);
      assert.equal(checked.ok, false, `${path} must be refused`);
    }
    // …and the template that deliberately holds no values stays visible.
    assert.equal(normalizeRepoPath(".env.example").ok, true);
  });
});

// ─── SAVE ────────────────────────────────────────────────────────────────────

describe("saving a file to the draft branch", () => {
  it("dry-runs by default and writes nothing", async () => {
    const dependencies = deps();
    const result = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE),
    }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.published, false);
    assert.equal(dependencies.github.refs.has(BRANCH), false, "no branch was created");
    assert.equal(dependencies.github.calls.length, 0, "nothing reached GitHub at all");
  });

  it("the FIRST save creates the branch from the base head and commits the file", async () => {
    const dependencies = deps();
    const result = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.published, true);
    assert.equal(result.branch, BRANCH);
    assert.equal(result.fingerprint, hashFile(V2), "the canvas adopts the NEW fingerprint for its next save");
    assert.match(result.summary, /draft branch/, "the summary never claims more than a branch commit");

    const github = dependencies.github;
    const tip = github.refs.get(BRANCH);
    assert.ok(tip, "the branch exists");
    assert.deepEqual(github.commits.get(tip!)?.parents, ["sha_base"], "created from the base head, not from nowhere");
    assert.equal(github.snapshotAt(tip!)["src/app/page.tsx"], V2, "the branch tip holds the new contents");
    assert.equal(github.refs.get("main"), "sha_base", "the branch the project reads never moves");
  });

  it("the SECOND save chains on the branch tip — judged against the branch copy, not base", async () => {
    const dependencies = deps();
    const project = repoProject();
    const first = await saveRepoFile({
      agencyId: "agency_1", project,
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.equal(first.ok, true);

    // The fingerprint of the BRANCH copy — base still says PAGE. If the read
    // came from base this save would be refused as stale; if the commit built
    // from base this save would silently revert nothing-yet but a third would.
    const second = await saveRepoFile({
      agencyId: "agency_1", project,
      path: "src/app/page.tsx", contents: V3, fingerprint: hashFile(V2), confirm: true,
    }, dependencies);
    assert.equal(second.ok, true);
    if (!second.ok || !first.ok) return;
    assert.equal(second.published, true);

    const github = dependencies.github;
    const tip = github.refs.get(BRANCH)!;
    assert.deepEqual(github.commits.get(tip)?.parents, [first.commitSha], "commit 2 descends from commit 1");
    assert.equal(github.snapshotAt(tip)["src/app/page.tsx"], V3);
    assert.ok(dependencies.reads.some(read => read.ref === BRANCH), "the current copy was read from the branch tip");
  });

  it("a save carrying the BASE fingerprint is refused once the branch has moved on", async () => {
    const dependencies = deps();
    const project = repoProject();
    await saveRepoFile({
      agencyId: "agency_1", project,
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);

    const tipBefore = dependencies.github.refs.get(BRANCH);
    const stale = await saveRepoFile({
      agencyId: "agency_1", project,
      // A pane still holding main's copy: its fingerprint no longer matches
      // the branch tip. Refusing loses THIS edit, which is recoverable;
      // committing it would silently revert the first save, which is not.
      path: "src/app/page.tsx", contents: PAGE + "\n// late", fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.equal(stale.ok, false);
    if (stale.ok) return;
    assert.equal(stale.reason, "stale-fingerprint");
    assert.match(stale.error, /changed since you opened it/);
    assert.equal(dependencies.github.refs.get(BRANCH), tipBefore, "the branch tip did not move");
  });

  it("a wrong fingerprint is refused before anything reaches GitHub", async () => {
    const dependencies = deps();
    const result = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile("some other copy"), confirm: true,
    }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "stale-fingerprint");
    assert.equal(dependencies.github.calls.length, 0);
  });

  it("refuses hidden paths and traversal without going near GitHub", async () => {
    for (const path of [".env", "config/.env.local", ".git/config", "src/../../x", "..\\x"]) {
      const dependencies = deps();
      const result = await saveRepoFile({
        agencyId: "agency_1", project: repoProject(),
        path, contents: "x", fingerprint: hashFile("x"), confirm: true,
      }, dependencies);
      assert.equal(result.ok, false, `${JSON.stringify(path)} must be refused`);
      if (result.ok) continue;
      assert.equal(result.reason, "bad-path");
      assert.equal(dependencies.reads.length, 0, "not even read");
      assert.equal(dependencies.github.calls.length, 0);
    }
  });

  it("refuses a no-change save rather than committing an empty commit", async () => {
    const dependencies = deps();
    const result = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", contents: PAGE, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no-change");
    assert.equal(dependencies.github.calls.length, 0);
  });

  it("refuses a file the editor would not agree to open — an image, or something enormous", async () => {
    const image = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "public/logo.png", contents: "bytes", fingerprint: hashFile("bytes"), confirm: true,
    }, deps());
    assert.equal(image.ok, false);
    if (!image.ok) assert.equal(image.reason, "not-editable");

    const huge = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/big.ts", contents: "x".repeat(MAX_EDITABLE_BYTES + 1), fingerprint: "fp", confirm: true,
    }, deps());
    assert.equal(huge.ok, false);
    if (!huge.ok) assert.equal(huge.reason, "too-large");
  });

  it("says when the file does not exist, pointing at create instead of guessing", async () => {
    const result = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/missing.tsx", contents: "x", fingerprint: hashFile("x"), confirm: true,
    }, deps());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unreadable");
    assert.match(result.error, /Create it first/);
  });

  it("refuses a project with no repository, in words", async () => {
    await assert.rejects(
      () => saveRepoFile({
        agencyId: "agency_1", project: repoProject({ repository: "" }),
        path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
      }, deps()),
      (error: unknown) => error instanceof SourceEditUnavailable && error.code === "no-repository",
    );
  });

  it("carries the vault's token to publish and never invents one", async () => {
    const dependencies = deps();
    await saveRepoFile({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.equal(dependencies.published.length, 1);
    assert.equal(dependencies.published[0].token, "token_from_the_vault");
  });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────

describe("creating a file or folder on the draft branch", () => {
  it("a new file lands as a blob at the requested path", async () => {
    const dependencies = deps();
    const result = await createRepoPath({
      agencyId: "agency_1", project: repoProject(),
      path: "src/lib/helpers.ts", kind: "file", confirm: true,
    }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, "file");
    assert.equal(result.committedPath, "src/lib/helpers.ts");
    assert.equal(result.fingerprint, hashFile(""), "the canvas can open it at the fingerprint it was born with");

    const github = dependencies.github;
    const tip = github.refs.get(BRANCH)!;
    assert.equal(github.snapshotAt(tip)["src/lib/helpers.ts"], "");
    assert.equal(github.snapshotAt("sha_base")["src/lib/helpers.ts"], undefined, "base never sees it until the merge");
  });

  it("a new folder lands as path/.gitkeep, and SAYS so — git has no empty directories", async () => {
    const dependencies = deps();
    const result = await createRepoPath({
      agencyId: "agency_1", project: repoProject(),
      path: "src/assets", kind: "folder", confirm: true,
    }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, "folder");
    assert.equal(result.committedPath, "src/assets/.gitkeep");
    assert.match(result.note ?? "", /git only keeps a folder/i, "the UI gets the honest sentence, not a pretence");

    const tip = dependencies.github.refs.get(BRANCH)!;
    assert.equal(dependencies.github.snapshotAt(tip)["src/assets/.gitkeep"], "");
  });

  it("a create after a save CHAINS on the branch tip instead of starting again", async () => {
    const dependencies = deps();
    const project = repoProject();
    const saved = await saveRepoFile({
      agencyId: "agency_1", project,
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    const created = await createRepoPath({
      agencyId: "agency_1", project, path: "src/lib/helpers.ts", kind: "file", confirm: true,
    }, dependencies);
    assert.equal(saved.ok, true);
    assert.equal(created.ok, true);
    if (!saved.ok || !created.ok) return;

    const github = dependencies.github;
    const tip = github.refs.get(BRANCH)!;
    assert.deepEqual(github.commits.get(tip)?.parents, [saved.commitSha]);
    const snapshot = github.snapshotAt(tip);
    assert.equal(snapshot["src/app/page.tsx"], V2, "the earlier save survives the create");
    assert.equal(snapshot["src/lib/helpers.ts"], "");
  });

  it("refuses to create over something that already exists — file, or folder full of files", async () => {
    const overFile = await createRepoPath({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", kind: "file", confirm: true,
    }, deps());
    assert.equal(overFile.ok, false);
    if (!overFile.ok) assert.equal(overFile.reason, "exists");

    const overFolder = await createRepoPath({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app", kind: "folder", confirm: true,
    }, deps());
    assert.equal(overFolder.ok, false);
    if (!overFolder.ok) assert.equal(overFolder.reason, "exists");
  });

  it("sees a file created two saves ago — existence is asked of the BRANCH, not base", async () => {
    const dependencies = deps();
    const project = repoProject();
    const first = await createRepoPath({
      agencyId: "agency_1", project, path: "src/lib/helpers.ts", kind: "file", confirm: true,
    }, dependencies);
    assert.equal(first.ok, true);
    const again = await createRepoPath({
      agencyId: "agency_1", project, path: "src/lib/helpers.ts", kind: "file", confirm: true,
    }, dependencies);
    assert.equal(again.ok, false, "base does not know the file; the branch does, and the branch is the truth");
    if (!again.ok) assert.equal(again.reason, "exists");
  });

  it("refuses hidden locations — including a folder whose .gitkeep would land somewhere hidden", async () => {
    for (const attempt of [
      { path: ".env", kind: "file" as const },
      { path: "src/../.env", kind: "file" as const },
      { path: ".git", kind: "folder" as const },
    ]) {
      const dependencies = deps();
      const result = await createRepoPath({
        agencyId: "agency_1", project: repoProject(), ...attempt, confirm: true,
      }, dependencies);
      assert.equal(result.ok, false, `${attempt.kind} ${attempt.path} must be refused`);
      if (result.ok) continue;
      assert.equal(result.reason, "bad-path");
      assert.equal(dependencies.github.calls.length, 0);
    }
  });

  it("refuses a file type the editor could never open afterwards", async () => {
    const result = await createRepoPath({
      agencyId: "agency_1", project: repoProject(),
      path: "src/logo.png", kind: "file", confirm: true,
    }, deps());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not-editable");
  });

  it("dry-runs by default, like every other write in this engine", async () => {
    const dependencies = deps();
    const result = await createRepoPath({
      agencyId: "agency_1", project: repoProject(), path: "src/lib/helpers.ts", kind: "file",
    }, dependencies);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.published, false);
    assert.equal(dependencies.github.refs.has(BRANCH), false);
  });
});

// ─── PUBLISH ─────────────────────────────────────────────────────────────────

describe("publishing the draft branch as a pull request", () => {
  it("opens the pull request once, and the second press REUSES it", async () => {
    const dependencies = deps();
    const project = repoProject();
    await saveRepoFile({
      agencyId: "agency_1", project,
      path: "src/app/page.tsx", contents: V2, fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);

    const first = await openProjectPullRequest({ agencyId: "agency_1", project }, dependencies);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.pullRequest.number, 1);
    assert.notEqual(first.pullRequest.existing, true);
    assert.equal(first.branch, BRANCH);
    assert.equal(first.baseBranch, "main");

    const second = await openProjectPullRequest({ agencyId: "agency_1", project }, dependencies);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.pullRequest.number, 1, "the SAME pull request comes back");
    assert.equal(second.pullRequest.existing, true, "…and says it already existed");
    assert.equal(dependencies.github.pulls.length, 1, "GitHub holds exactly one");
  });

  it("refuses when nothing is on the draft branch yet — a PR needs a branch to point at", async () => {
    const dependencies = deps();
    const result = await openProjectPullRequest({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "nothing-to-publish");
    assert.match(result.error, /save or create something first/i);
    assert.equal(dependencies.github.pulls.length, 0);
  });

  it("refuses a project with no repository", async () => {
    await assert.rejects(
      () => openProjectPullRequest({ agencyId: "agency_1", project: repoProject({ repository: "" }) }, deps()),
      (error: unknown) => error instanceof SourceEditUnavailable && error.code === "no-repository",
    );
  });
});

// ─── The route, in process, offline ──────────────────────────────────────────

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Repo Co", slug: `repo-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@repo.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "repo-operator-pass",
  });
  return {
    agency,
    userId: user.id,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

interface RouteBody {
  ok?: boolean;
  error?: string;
  code?: string;
  reason?: string;
  href?: string;
}

async function post(token: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/repo-write",
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) },
  ) as never)));
  return { status: response.status, body: await response.json() as RouteBody };
}

async function project(agencyId: string, userId: string, fields: Partial<DevProject> = {}) {
  return saveDevProject({
    agencyId,
    actorUserId: userId,
    name: "Repo project",
    ...fields,
  } as never);
}

describe("the endpoint", () => {
  it("refuses a request from another origin", async () => {
    const { token } = await founder();
    const result = await post(token, { action: "publish", project: "x" }, { origin: "https://evil.test" });
    assert.equal(result.status, 403);
    assert.match(result.body.error ?? "", /origin/i);
  });

  it("needs a project", async () => {
    const { token } = await founder();
    const result = await post(token, { action: "publish" });
    assert.equal(result.status, 400);
  });

  it("cannot be pointed at another agency's project", async () => {
    const a = await founder();
    const b = await founder();
    const mine = await project(a.agency.id, a.userId, { repository: "acme/site" });
    const result = await post(b.token, { action: "publish", project: mine.id });
    assert.equal(result.status, 404, "tenant is checked before project, so a real id from elsewhere is simply not found");
  });

  it("keeps founder access through the owner capability baseline without Dev Mode", async () => {
    const { token, agency, userId } = await founder();
    const target = await project(agency.id, userId, { repository: "" });
    const saved = process.env.PORTAL_DEV_MODE;
    process.env.PORTAL_DEV_MODE = "false";
    try {
      const response = await withSession(token, () => POST(new Request(
        "http://localhost/api/portal/dev/repo-write",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish", project: target.id }) },
      ) as never));
      assert.equal(response.status, 409);
    } finally {
      if (saved === undefined) delete process.env.PORTAL_DEV_MODE; else process.env.PORTAL_DEV_MODE = saved;
    }
  });

  it("says plainly that a project with no repository has nowhere to commit", async () => {
    const { token, agency, userId } = await founder();
    const target = await project(agency.id, userId, { repository: "" });
    const result = await post(token, { action: "publish", project: target.id });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "no-repository");
  });

  it("points at the editor's Settings tab when there is no token", async () => {
    const saved = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const { token, agency, userId } = await founder();
      const target = await project(agency.id, userId, { repository: "acme/site" });
      const result = await post(token, { action: "publish", project: target.id });
      assert.equal(result.status, 409);
      assert.equal(result.body.code, "no-token");
      assert.equal(result.body.href, "/portal/dev-team/editor", "the fix lives in the editor, not on the Company page");
    } finally {
      if (saved === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = saved;
    }
  });

  it("a save needs the path, the contents and the fingerprint it was opened at", async () => {
    const { token, agency, userId } = await founder();
    const target = await project(agency.id, userId, { repository: "acme/site" });
    for (const body of [
      { action: "save", project: target.id },
      { action: "save", project: target.id, path: "src/a.ts", contents: "x" },
      { action: "save", project: target.id, path: "src/a.ts", fingerprint: "fp" },
    ]) {
      const result = await post(token, body);
      assert.equal(result.status, 400, `${JSON.stringify(body)} must be refused`);
    }
  });

  it("a create needs a path and a kind it recognises", async () => {
    const { token, agency, userId } = await founder();
    const target = await project(agency.id, userId, { repository: "acme/site" });
    const result = await post(token, { action: "create", project: target.id, path: "src/a.ts", kind: "symlink" });
    assert.equal(result.status, 400);
  });

  it("an unknown action is a 400, not a guess", async () => {
    // ── REWRITTEN for phase 14 (2026-08-22): "merge" became a REAL action ──
    // This pin's example of an unknown action used to be "merge" — pinning
    // that merging did not exist here. Ed's call moved it in ("no everything
    // inside the editor thats the whole point of it"), so merge now answers
    // as itself (smoke-work-lifecycle.test.ts owns its contract). The unknown
    // example is now "rebase": an action this route must NEVER grow, because
    // history that can be rewritten is history nobody can trust (publish.ts
    // rule 3) — if this 400 ever stops firing, that rule is being broken.
    const { token, agency, userId } = await founder();
    const target = await project(agency.id, userId, { repository: "acme/site" });
    const result = await post(token, { action: "rebase", project: target.id });
    assert.equal(result.status, 400);
  });

  it("takes the repository, the ref and the token from the record, never from the body", () => {
    const source = readFileSync(ROUTE_FILE, "utf8");
    for (const field of ["body.token", "body.repository", "body.ref", "body.agencyId"]) {
      assert.equal(source.includes(field), false, `${field} must never be read — the record and the vault are the only sources`);
    }
    assert.match(source, /requireDevProjectAccess/, "tenant and project resolution use the canonical access helper");
    assert.equal(/export async function GET/.test(source), false, "POST only — a GET could be triggered cross-site");
  });
});

// ─── What the screens now claim ──────────────────────────────────────────────

describe("the code canvas saves repo projects to the branch, and says so", () => {
  const canvas = readFileSync(CANVAS_FILE, "utf8");

  it("routes a repo-backed save through repo-write, and only then", () => {
    assert.match(canvas, /repoBacked \? "\/api\/portal\/dev\/repo-write" : "\/api\/portal\/site-editor\/files"/);
    assert.match(canvas, /action: "save", project: projectId, path: open, contents: draft, fingerprint: file\.fingerprint, confirm: true/);
  });

  it("never claims a branch commit reached the site", () => {
    assert.match(canvas, /On the draft branch — publish opens the pull request/);
    assert.match(canvas, /saves commit here, not to the site/);
  });

  it("carries the Publish control, which opens or finds the branch's pull request", () => {
    assert.match(canvas, /action: "publish", project: projectId/);
    assert.match(canvas, /PR #\{pullRequest\.number\}/, "the PR link and state are shown, not just a toast");
  });
});

describe("the + creates files on a repo project instead of refusing", () => {
  const editor = readFileSync(EDITOR_FILE, "utf8");

  it("the disabled 'create the file there and publish' row is gone — this IS that path now", () => {
    assert.equal(editor.includes("This project is backed by a repository — create the file there and publish."), false);
    assert.match(editor, /action: "create", project: projectId, path, kind, confirm: true/);
  });

  it("is honest that a folder is really its .gitkeep", () => {
    assert.match(editor, /git only keeps a folder that has a file in it/);
  });

  it("announces the create so the tree re-reads — the same event a landed connection uses", () => {
    assert.match(editor, /window\.dispatchEvent\(new CustomEvent\(DEV_PROJECTS_CHANGED_EVENT\)\)/);
  });
});

describe("the files route shows the draft branch it writes come back on", () => {
  const filesRoute = readFileSync(FILES_ROUTE, "utf8");

  it("reads a repo-backed project's tree and files branch-first", () => {
    // Without this, a created file never appears and every reopened file
    // carries main's fingerprint — which the save path then rightly refuses,
    // forever. The draft branch is the truth once it exists.
    assert.match(filesRoute, /editBranchName\(project\)/);
    assert.match(filesRoute, /draftBranch/);
  });

  it("keeps the local-disk backstop exactly where it was", () => {
    assert.match(filesRoute, /if \(project\?\.repository\) \{/);
    assert.match(filesRoute, /backed by a repository — changes are committed and published/);
  });

  it("an explicit ?ref= still wins — the show-me-main affordance", () => {
    assert.match(filesRoute, /explicitRef/);
    assert.match(filesRoute, /project\.repository === repository && !explicitRef/);
  });
});
