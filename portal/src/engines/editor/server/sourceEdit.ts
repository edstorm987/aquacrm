import "server-only";

import { isMappableFile, type SiteRegistry } from "./registry";
import { planPatches, type SourcePatch } from "./patch";
import { openPullRequest, publishEdits, type PublishOutcome, type PullRequestRef } from "./publish";
import { GitHubNotConfigured, readRepoFile, readRepoHeadSha, readRepoTree, type GitHubRepoSource } from "./githubSource";
import { devProjectGitHubToken } from "./devProjects";
import { findTextInSource, replaceTextInLine, type SourceTextCandidate } from "./sourceMatch";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import type { DevProject } from "@/server/types";

/**
 * A words edit, all the way to a commit.
 *
 * This is the missing caller. `registry.ts`, `patch.ts` and `publish.ts` were
 * all written, all tested, and reached by nothing but their own tests — so an
 * edit made in the right menu rewrote the loaded page through the tag and died
 * on reload. Ed:
 *
 *   "i get the exact text i can change it on the right menu"
 *   "the edits you make on dev editor when published just go to git its so
 *    simple."
 *
 * Two steps, deliberately separate, because the first one GUESSES:
 *
 *   FIND    — read the repository at its ref and list every line containing
 *             those words. Returns candidates and a `commitSha`. Decides
 *             nothing.
 *   PUBLISH — takes back ONE candidate a human picked, re-reads that one file,
 *             re-checks the line hash, and commits.
 *
 * Ed's own rule for anything that has to match one thing to another: guess,
 * then have a human confirm. Here it is not a preference, it is the only safe
 * shape — the text on the page is all we get (see `sourceMatch.ts` for why
 * there is no location to read), and applying the first guess silently means
 * committing to a client's website on a line nobody looked at.
 *
 * ── What this module refuses to do ──────────────────────────────────────────
 *
 * It never touches this server's disk. A repository-backed project is read
 * from GitHub and written to GitHub, which is the same rule the files route
 * enforces from the other side — that backstop exists because the "+" button
 * once created files inside AquaCRM's own tree.
 *
 * It never accepts a token, a repository or a ref from a request body. All
 * three come off the `DevProject` record, and the token itself resolves
 * per-request out of the encrypted vault through `devProjectGitHubToken`.
 *
 * It never commits to the default branch. That rule is `publish.ts`'s and it
 * is not weakened here — see `editBranchName` below.
 */

/**
 * How many files one FIND will read.
 *
 * There is no batch read on the GitHub API: the tree comes in one request and
 * then every file is its own. So a search costs roughly one request per
 * mappable file, and the cap is what stops a large repository turning one
 * click into a thousand of them. Anything beyond it is reported as skipped —
 * never silently dropped, because "we did not find it" and "we did not look"
 * are different answers and only one of them means the words are not there.
 */
export const SOURCE_SCAN_FILE_CAP = 400;

/** Files read at once. Enough to be quick, few enough not to trip rate limits. */
const SCAN_CONCURRENCY = 8;

export interface SourceEditDeps {
  readTree?: typeof readRepoTree;
  readFile?: typeof readRepoFile;
  readHeadSha?: typeof readRepoHeadSha;
  publish?: typeof publishEdits;
  openPr?: typeof openPullRequest;
  /**
   * Overrides vault/env token resolution — the same seam `mapProject.ts`
   * offers, for the same reason: without it this path cannot be driven at all
   * except by planting a real encrypted connection. Production passes none.
   */
  githubToken?: string;
  now?: number;
}

export class SourceEditUnavailable extends Error {
  readonly code: "no-repository" | "no-token";
  constructor(code: "no-repository" | "no-token", message: string) {
    super(message);
    this.code = code;
    this.name = "SourceEditUnavailable";
  }
}

/**
 * The repository this project's words live in.
 *
 * A project with a blank `repository` is the local working tree, and the local
 * working tree has no GitHub to commit to — that project's edits go through
 * the files route instead. Said as a typed refusal rather than a silent empty
 * result, because "nothing found" would read as "your words are not there".
 */
export function sourceEditTarget(agencyId: string, project: DevProject, deps: SourceEditDeps = {}): GitHubRepoSource {
  if (!project.repository) {
    throw new SourceEditUnavailable(
      "no-repository",
      "This project has no repository, so there is nothing to commit to. Give it one in Settings, or edit the files directly in Dev mode.",
    );
  }
  const token = deps.githubToken
    || devProjectGitHubToken(agencyId, project)
    || resolveIntegrationValues(agencyId, "github").token
    || process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new SourceEditUnavailable("no-token", new GitHubNotConfigured().message);
  return { repository: project.repository, ref: project.ref || "main", token };
}

// ─── FIND ────────────────────────────────────────────────────────────────────

export interface FindWordsResult {
  repository: string;
  ref: string;
  /** The commit the candidates describe. Handed back on publish to catch a moved branch. */
  commitSha: string;
  /** How many files were actually read. */
  scanned: number;
  /** Read attempts that produced nothing usable, each with a reason. Never silent. */
  skipped: Array<{ file: string; reason: string }>;
  /** True when the repository has more mappable files than the cap. */
  cappedAt?: number;
  candidates: SourceTextCandidate[];
  /** Set when nothing usable came back. The two are mutually exclusive. */
  reason?: "too-short" | "too-long" | "not-found" | "too-many";
  detail?: string;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Where in this project's source those words appear.
 *
 * Only `isMappableFile` paths are read — the same filter `mapProject` counts
 * with, so "mappable" means one thing in this engine. A `.ts` server file is
 * not searched, which is correct: words rendered on a page come out of JSX,
 * markdown or HTML, and reading the whole repository to find them would cost
 * several times as many requests for candidates nobody wants.
 */
export async function findWordsInProject(input: {
  agencyId: string;
  project: DevProject;
  text: string;
}, deps: SourceEditDeps = {}): Promise<FindWordsResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const head = await (deps.readTree ?? readRepoTree)(source);

  const mappable = head.files.map(file => file.path).filter(isMappableFile);
  const selected = mappable.slice(0, SOURCE_SCAN_FILE_CAP);
  const skipped: Array<{ file: string; reason: string }> = [];
  if (head.truncated) {
    skipped.push({ file: "(the repository tree)", reason: "GitHub truncated the file list, so part of the repository was never offered." });
  }

  const read = deps.readFile ?? readRepoFile;
  const files: Array<{ path: string; contents: string }> = [];
  const loaded = await mapWithConcurrency(selected, SCAN_CONCURRENCY, async path => {
    try {
      return { path, file: await read(source, path) };
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : "That file could not be read." };
    }
  });
  for (const entry of loaded) {
    if ("error" in entry && entry.error) { skipped.push({ file: entry.path, reason: entry.error }); continue; }
    const file = "file" in entry ? entry.file : null;
    if (!file?.editable || typeof file.contents !== "string") {
      skipped.push({ file: entry.path, reason: file?.reason ?? "That file could not be read as text." });
      continue;
    }
    files.push({ path: entry.path, contents: file.contents });
  }

  const base = {
    repository: source.repository,
    ref: source.ref,
    commitSha: head.sha,
    scanned: files.length,
    skipped,
    ...(mappable.length > SOURCE_SCAN_FILE_CAP ? { cappedAt: SOURCE_SCAN_FILE_CAP } : {}),
  };

  const search = findTextInSource({ files, text: input.text });
  if (!search.ok) return { ...base, candidates: [], reason: search.reason, detail: search.detail };
  return { ...base, candidates: search.candidates };
}

// ─── PUBLISH ─────────────────────────────────────────────────────────────────

/**
 * The branch a words edit lands on.
 *
 * One branch per project, so a run of small copy edits stacks into one branch
 * and one pull request rather than scattering a dozen. Never the default
 * branch: `publish.ts` rule 2 exists because a bad commit on `main` is already
 * live, and on this deployment a merge to `main` triggers a production deploy.
 */
export function editBranchName(project: DevProject): string {
  const slug = project.id.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
  return `aqua-editor/${slug}`;
}

export interface PublishWordsInput {
  agencyId: string;
  project: DevProject;
  /** The candidate a human picked, carried back unchanged from FIND. */
  file: string;
  line: number;
  /** `hashLine` of the whole raw line, as it was when found. */
  expectedHash: string;
  /** The commit FIND described. A different HEAD now means re-find. */
  commitSha: string;
  originalText: string;
  newText: string;
  /** Nothing is written unless this is exactly `true`. */
  confirm?: boolean;
  /** Open (or find) a pull request for the branch. A branch nobody sees is not published. */
  openPullRequest?: boolean;
  message?: string;
  actorUserId?: string;
}

export interface PublishWordsResult {
  outcome: PublishOutcome;
  branch: string;
  baseBranch: string;
  repository: string;
  pullRequest?: PullRequestRef;
  /** Set when the edit never reached the patch stage at all. */
  refusal?: { reason: string; detail: string };
}

/**
 * Commit one words edit.
 *
 * Every check that matters is `patch.ts`'s, reached by building the one-file
 * registry it expects rather than by re-deciding anything here:
 *
 *   • the registry is pinned to the commit FIND read, and `applyPatch` compares
 *     it to HEAD right now — so a branch that moved in between is refused with
 *     "re-map" rather than committed on top of somebody else's work;
 *   • the line hash is the one FIND recorded, so a line edited in the meantime
 *     is refused even when the branch has not moved;
 *   • `publishEdits` dry-runs unless `confirm === true`, creates the branch
 *     from the mapped commit, writes one tree and one commit, and never forces.
 */
export async function publishWordsEdit(
  input: PublishWordsInput,
  deps: SourceEditDeps = {},
): Promise<PublishWordsResult> {
  const source = sourceEditTarget(input.agencyId, input.project, deps);
  const branch = editBranchName(input.project);
  const shell = { branch, baseBranch: source.ref, repository: source.repository };

  // FIND only ever offers mappable files, so publish accepts only those too.
  // Not a security boundary — this is the operator's own repository and their
  // own token — but the two halves agreeing means a `file` that never came
  // from a candidate cannot reach the patch stage at all.
  if (!isMappableFile(input.file)) {
    const detail = `${input.file} is not a file the words editor can change. Open it in Dev mode.`;
    return { ...shell, outcome: emptyOutcome(branch, detail), refusal: { reason: "unknown-file", detail } };
  }

  // THE DRAFT BRANCH IS THE TRUTH once it exists — the base only seeds the
  // FIRST edit. Edit 1 lives only on `aqua-editor/<project>`; splicing into the
  // BASE branch's copy and writing it wholesale onto the branch tip silently
  // reverted it (adversarial verify, 2026-08-21: edit 2 published main+edit-2
  // only — chained commits, clean PR, success message, first edit gone). Before
  // the fast-forward fix that path 422ed; honesty demands reading the branch's
  // own copy instead. A missing branch (first edit) throws and falls back to
  // base; any other unreadability is the same on both refs, so the fallback
  // cannot resurrect the lost-update path.
  const branchCopy = await (deps.readFile ?? readRepoFile)({ ...source, ref: branch }, input.file)
    .catch(() => null);
  const current = branchCopy && branchCopy.editable && typeof branchCopy.contents === "string"
    ? branchCopy
    : await (deps.readFile ?? readRepoFile)(source, input.file);
  if (!current.editable || typeof current.contents !== "string") {
    return {
      ...shell,
      outcome: emptyOutcome(branch, current.reason ?? "That file cannot be edited here."),
      refusal: { reason: "unreadable-file", detail: current.reason ?? "That file cannot be edited here." },
    };
  }

  const lines = current.contents.split(/\r?\n/);
  const lineText = lines[input.line - 1];
  if (typeof lineText !== "string") {
    return {
      ...shell,
      outcome: emptyOutcome(branch, `${input.file} no longer has a line ${input.line}.`),
      refusal: { reason: "line-missing", detail: `${input.file} no longer has a line ${input.line}. Find those words again.` },
    };
  }

  // Done here rather than inside `applyPatch` because splicing words into a
  // line is this feature's own problem — `patch.ts` takes a finished line and
  // must stay the general mechanism both the visual and the code editor share.
  const spliced = replaceTextInLine({ lineText, originalText: input.originalText, newText: input.newText, file: input.file });
  if (!spliced.ok) {
    return {
      ...shell,
      outcome: emptyOutcome(branch, spliced.detail),
      refusal: { reason: spliced.reason, detail: spliced.detail },
    };
  }

  const patch: SourcePatch = {
    file: input.file,
    line: input.line,
    expectedHash: input.expectedHash,
    newLine: spliced.newLine,
  };

  // Exactly the registry `applyPatch` expects, holding exactly the one file
  // this edit touches. `commitSha` is the one FIND read, so the staleness
  // check below is a real comparison rather than a tautology.
  const registry: SiteRegistry = {
    repository: source.repository,
    ref: source.ref,
    commitSha: input.commitSha,
    mappedAt: deps.now ?? Date.now(),
    files: [input.file],
    nodes: {},
    skipped: [],
  };

  const headSha = await (deps.readHeadSha ?? readRepoHeadSha)(source);
  const plan = planPatches({
    registry,
    headSha,
    patches: [patch],
    read: file => (file === input.file ? current.contents ?? null : null),
  });

  const outcome = await (deps.publish ?? publishEdits)({
    target: { repository: source.repository, baseBranch: source.ref, baseSha: input.commitSha },
    plan,
    branch,
    message: input.message?.trim() || defaultMessage(input),
    confirm: input.confirm === true,
    token: source.token,
  });

  if (!outcome.published || input.openPullRequest === false) return { ...shell, outcome };

  // A branch nobody looks at is not "published". The pull request is what gets
  // a preview deployment and a diff — merging it stays a separate decision
  // (`mergePullRequest`), because merging here IS the production deploy.
  try {
    const pullRequest = await (deps.openPr ?? openPullRequest)({
      repository: source.repository,
      branch,
      base: source.ref,
      title: `Aqua Editor — ${input.project.name || input.project.id}`,
      body: "Words edited in the Aqua Dev Editor. Each edit adds a commit to this branch.",
      token: source.token,
    });
    return { ...shell, outcome, pullRequest };
  } catch {
    // The commit landed; only the pull request did not. Saying "publish
    // failed" here would send somebody to re-do an edit that is already in.
    return { ...shell, outcome };
  }
}

function defaultMessage(input: PublishWordsInput): string {
  const words = input.newText.trim().replace(/\s+/g, " ").slice(0, 60);
  return `Aqua Editor: words in ${input.file}:${input.line}${words ? ` → “${words}”` : ""}`;
}

function emptyOutcome(branch: string, summary: string): PublishOutcome {
  return { published: false, branch, files: [], rejected: [], summary };
}
