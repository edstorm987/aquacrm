// WORDS → SOURCE → A COMMIT.
//
//   Ed: "i get the exact text i can change it on the right menu"
//       "the edits you make on dev editor when published just go to git its so
//        simple."
//
// Before this, the right menu's words edit rewrote the LOADED page through the
// Aqua Tag and died on reload, and `patch.ts` → `publish.ts` — the path that
// would have persisted it — was reached by nothing but its own tests. Verified
// rather than taken on trust: grep for `planPatches`/`publishEdits` across
// `src/` finds one hit each, both inside their own modules.
//
// What is under test is the whole loop and, more importantly, everything it
// REFUSES. The dangerous failure here is not "the edit did not save"; it is a
// commit to a client's website on a line nobody looked at, or a `{` typed into
// a heading that stops the site building. So most of what follows asserts a
// refusal, and several assert that nothing was written at all.
//
// THREE properties are load-bearing:
//
// 1. FINDING IS A GUESS, AND SAYS SO. A tag selection carries no file and no
//    line (`AquaTagElement` has no such field, and `data-aqua-src` is stamped
//    by nothing), so the source is SEARCHED for the words. The result is a
//    list for a human to confirm — never one answer applied silently.
// 2. THE EDIT CANNOT BREAK THE BUILD. Splicing words into a line of JSX means
//    the characters that mean something to the compiler have to be refused,
//    and which ones they are depends on whether the words sit in JSX text or
//    inside a quoted attribute.
// 3. NOTHING IS WRITTEN WITHOUT `confirm === true`, and a branch that moved
//    since the search is refused rather than committed on top of.
//
// No network anywhere. Every GitHub call is an injected dep; the route tests
// exercise only the paths that return before a request is ever made.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import { readFile } from "node:fs/promises";

import {
  MAX_CANDIDATES,
  MIN_SEARCHABLE_CHARS,
  contextAt,
  findTextInSource,
  replaceTextInLine,
  textSearchPattern,
  unsafeCharactersFor,
} from "../src/engines/editor/server/sourceMatch";
import { applyPatch, type PatchPlan } from "../src/engines/editor/server/patch";
import { hashLine, type SiteRegistry } from "../src/engines/editor/server/registry";
import {
  SOURCE_SCAN_FILE_CAP,
  SourceEditUnavailable,
  editBranchName,
  findWordsInProject,
  publishWordsEdit,
  type SourceEditDeps,
} from "../src/engines/editor/server/sourceEdit";
import { publishEdits, type PublishOutcome, type PublishRequest, type PullRequestRef } from "../src/engines/editor/server/publish";
import type { RepoFile, RepoHead } from "../src/engines/editor/server/githubSource";
import { POST } from "../src/app/api/portal/dev/source-edit/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { DevProject } from "../src/server/types";

const EDITOR_FILE = new URL("../src/engines/editor/DevEditor.tsx", import.meta.url);
const ROUTE_FILE = new URL("../src/app/api/portal/dev/source-edit/route.ts", import.meta.url);
const FILES_ROUTE = new URL("../src/app/api/portal/site-editor/files/route.ts", import.meta.url);

// ─── The page a real edit starts from ────────────────────────────────────────

const PAGE = [
  `export default function Home() {`,
  `  return (`,
  `    <main>`,
  `      <h1 className="text-4xl">We build things</h1>`,
  `      <p title="We build things, properly">A tagline that is longer</p>`,
  `      <span>{heading}</span>`,
  `    </main>`,
  `  );`,
  `}`,
].join("\n");

function file(path: string, contents: string) {
  return { path, contents };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("finding the words in the source", () => {
  it("finds the exact line and hands back the hash applyPatch will check", () => {
    const found = findTextInSource({ files: [file("app/page.tsx", PAGE)], text: "We build things" });
    assert.equal(found.ok, true);
    if (!found.ok) return;
    const first = found.candidates[0];
    assert.equal(first.file, "app/page.tsx");
    assert.equal(first.line, 4);
    // The RAW line, indentation included — that is what a patch replaces.
    assert.equal(first.lineText, `      <h1 className="text-4xl">We build things</h1>`);
    assert.equal(first.column, 6);
    assert.equal(
      first.expectedHash,
      hashLine(first.lineText),
      "the hash must be of the whole raw line, because that is what applyPatch hashes",
    );
  });

  it("survives the newline a formatter puts in the middle of a heading", () => {
    // The needle is DOM textContent, so HTML has already collapsed the break.
    // A plain indexOf would miss this, which is most real headings.
    const wrapped = [
      `      <h1>`,
      `        We build`,
      `        things`,
      `      </h1>`,
      `      <h2>We build   things</h2>`,
    ].join("\n");
    const found = findTextInSource({ files: [file("a.tsx", wrapped)], text: "We build things" });
    assert.equal(found.ok, true);
    if (!found.ok) return;
    // The h2 matches: its run of spaces collapses. The h1's split across THREE
    // lines does not, and is honestly reported as unfindable rather than
    // half-matched.
    assert.deepEqual(found.candidates.map(item => item.line), [5]);
  });

  it("a found candidate round-trips through applyPatch untouched", () => {
    const found = findTextInSource({ files: [file("app/page.tsx", PAGE)], text: "We build things" });
    assert.equal(found.ok, true);
    if (!found.ok) return;
    const candidate = found.candidates[0];
    const spliced = replaceTextInLine({
      lineText: candidate.lineText,
      originalText: "We build things",
      newText: "We make things",
    });
    assert.equal(spliced.ok, true);
    if (!spliced.ok) return;

    const registry: SiteRegistry = {
      repository: "acme/site", ref: "main", commitSha: "abc123", mappedAt: 0,
      files: ["app/page.tsx"], nodes: {}, skipped: [],
    };
    const result = applyPatch({
      registry,
      headSha: "abc123",
      contents: PAGE,
      patch: {
        file: candidate.file,
        line: candidate.line,
        expectedHash: candidate.expectedHash,
        newLine: spliced.newLine,
      },
    });
    assert.equal(result.ok, true, "the search and the patcher must agree about the line and its hash");
    if (!result.ok) return;
    assert.match(result.file.contents, /<h1 className="text-4xl">We make things<\/h1>/);
    assert.match(result.file.contents, /^ {6}<h1/m, "indentation survives");
  });

  it("refuses text too short to mean anything", () => {
    const found = findTextInSource({ files: [file("a.tsx", PAGE)], text: "Hi" });
    assert.equal(found.ok, false);
    if (found.ok) return;
    assert.equal(found.reason, "too-short");
    assert.match(found.detail, /Dev mode/);
    assert.ok(MIN_SEARCHABLE_CHARS >= 3);
  });

  it("counts characters, not whitespace, when deciding it is too short", () => {
    const found = findTextInSource({ files: [file("a.tsx", "  a b  ")], text: "a b" });
    assert.equal(found.ok, false);
    if (found.ok) return;
    assert.equal(found.reason, "too-short", "'a b' is two real characters however it is spaced");
  });

  it("refuses when the words are nowhere, and says what that usually means", () => {
    const found = findTextInSource({ files: [file("a.tsx", PAGE)], text: "Something else entirely" });
    assert.equal(found.ok, false);
    if (found.ok) return;
    assert.equal(found.reason, "not-found");
    assert.match(found.detail, /database|variable/, "the common cause is named rather than left as a mystery");
  });

  it("refuses rather than offering a picker nobody can choose from", () => {
    const many = Array.from({ length: MAX_CANDIDATES + 5 }, () => `<p>Repeated words here</p>`).join("\n");
    const found = findTextInSource({ files: [file("a.tsx", many)], text: "Repeated words here" });
    assert.equal(found.ok, false);
    if (found.ok) return;
    assert.equal(found.reason, "too-many");
  });

  it("refuses a needle longer than a heading could ever be", () => {
    const found = findTextInSource({ files: [file("a.tsx", PAGE)], text: "x".repeat(2_001) });
    assert.equal(found.ok, false);
    if (found.ok) return;
    assert.equal(found.reason, "too-long");
  });

  it("puts the likeliest line first and never hides a dynamic one", () => {
    const source = [
      `<div>{"Pick me" + suffix}</div>`,
      `<h1>Pick me</h1>`,
      `<meta content="a much much much longer attribute that also says Pick me somewhere" />`,
    ].join("\n");
    const found = findTextInSource({ files: [file("a.tsx", source)], text: "Pick me" });
    assert.equal(found.ok, true);
    if (!found.ok) return;
    assert.equal(found.candidates[0].line, 2, "the tight literal line ranks first");
    assert.equal(found.candidates.length, 3, "the dynamic line is ranked down, never dropped");
    assert.equal(found.candidates.at(-1)?.kind, "dynamic");
  });

  it("counts repeats on one line without listing that line twice", () => {
    const found = findTextInSource({
      files: [file("a.tsx", `<p>Same words and Same words</p>`)],
      text: "Same words",
    });
    assert.equal(found.ok, true);
    if (!found.ok) return;
    assert.equal(found.candidates.length, 1);
    assert.equal(found.candidates[0].occurrences, 2);
  });

  it("escapes regex characters in the words instead of running them", () => {
    const pattern = textSearchPattern("Price (from) $5.00 +VAT");
    assert.ok(pattern.test("Price (from) $5.00 +VAT"));
    assert.equal(pattern.test("Price from 5x00 xVAT"), false);
  });

  it("searches across files and reports each one it found", () => {
    const found = findTextInSource({
      files: [file("a.tsx", "<h1>Shared words</h1>"), file("b.tsx", "<h2>Shared words</h2>")],
      text: "Shared words",
    });
    assert.equal(found.ok, true);
    if (!found.ok) return;
    assert.deepEqual(found.candidates.map(item => item.file).sort(), ["a.tsx", "b.tsx"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("splicing the new words into a line without breaking it", () => {
  const jsxLine = `      <h1 className="text-4xl">We build things</h1>`;

  it("changes only the words and leaves the whole line otherwise intact", () => {
    const result = replaceTextInLine({ lineText: jsxLine, originalText: "We build things", newText: "We fix things" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.newLine, `      <h1 className="text-4xl">We fix things</h1>`);
  });

  it("refuses characters that would stop the site building", () => {
    for (const bad of ["<b>bold</b>", "{value}", "a > b"]) {
      const result = replaceTextInLine({ lineText: jsxLine, originalText: "We build things", newText: bad });
      assert.equal(result.ok, false, `${bad} must be refused in JSX text`);
      if (result.ok) continue;
      assert.equal(result.reason, "unsafe-text");
      assert.match(result.detail, /stop the site building/);
    }
  });

  it("still allows an apostrophe in body copy", () => {
    // The regression a blunt blocklist causes: refusing every quote means
    // nobody can write "Ed's site", which is most headings.
    const result = replaceTextInLine({ lineText: jsxLine, originalText: "We build things", newText: `Ed's "best" work` });
    assert.equal(result.ok, true, "quotes are ordinary characters in JSX text");
  });

  it("knows the words are inside an attribute and refuses only what would end it", () => {
    const attr = `      <p title="We build things, properly">Tagline</p>`;
    const bad = replaceTextInLine({ lineText: attr, originalText: "We build things, properly", newText: `He said "no"` });
    assert.equal(bad.ok, false, "a double quote would close the attribute early");
    if (!bad.ok) assert.match(bad.detail, /quoted value/);

    // …and the characters that are dangerous in JSX text are harmless here.
    const fine = replaceTextInLine({ lineText: attr, originalText: "We build things, properly", newText: "Cost < {5}" });
    assert.equal(fine.ok, true, "inside a string those are just characters");
    if (fine.ok) assert.equal(fine.newLine, `      <p title="Cost < {5}">Tagline</p>`);
  });

  it("is not fooled by an apostrophe earlier on the line", () => {
    // A naive "count the quotes" check treats everything after `Ed's` as
    // inside a string and gets the forbidden set exactly backwards.
    const line = `      <p title="Ed's place">We build things</p>`;
    assert.equal(contextAt(line, line.indexOf("We build things")), "jsx");
    assert.equal(contextAt(line, line.indexOf("Ed's place")), '"');
  });

  it("an apostrophe in bare JSX text does not invert the filter — the accept-attack, verbatim", () => {
    // THE DEFECT: the old machine treated ANY apostrophe as opening a string,
    // so in <h1>Don't stop believing</h1> everything after `Don'` was classed
    // as inside-a-string and the STRING set ["'","\\"] applied — which ACCEPTED
    // "<script>" and "{" into JSX text, the exact characters the module's own
    // header says break the build.
    const line = `<h1>Don't stop believing</h1>`;
    assert.equal(contextAt(line, line.indexOf("Don't"), "app/page.tsx"), "jsx", "text between tags is JSX text, apostrophe or no apostrophe");
    for (const attack of ["<script>alert(1)</script>", "Don't {stop} believing", "a } b"]) {
      const result = replaceTextInLine({
        lineText: line,
        originalText: "Don't stop believing",
        newText: attack,
        file: "app/page.tsx",
      });
      assert.equal(result.ok, false, `“${attack}” must be refused in JSX text`);
      if (!result.ok) {
        assert.equal(result.reason, "unsafe-text");
        assert.match(result.detail, /stop the site building/, "refused with the JSX explanation, not the string one");
      }
    }
    // …while the apostrophe itself stays an ordinary character to edit around.
    const fine = replaceTextInLine({
      lineText: line,
      originalText: "Don't stop believing",
      newText: "Don't stop me now",
      file: "app/page.tsx",
    });
    assert.equal(fine.ok, true, "the safe edit on the same line still goes through");
  });

  it("the mirror failure: markdown prose with an apostrophe is not 'inside a quoted value' — verbatim", () => {
    // THE DEFECT'S OTHER HALF: plain markdown "It's the best day" REFUSED a
    // legitimate edit, explaining that the words sat inside a quoted value.
    // In a markdown file there is no string context to be inside — the safe
    // set follows the FILE type, not a guessed quote.
    const result = replaceTextInLine({
      lineText: "It's the best day",
      originalText: "the best day",
      newText: "the very best day",
      file: "docs/notes.md",
    });
    assert.equal(result.ok, true, "markdown prose must not be refused as a quoted value");
    if (result.ok) assert.equal(result.newLine, "It's the very best day");
    // Quotes of every kind are ordinary characters there.
    const quoted = replaceTextInLine({
      lineText: "It's the best day",
      originalText: "the best day",
      newText: `the "best" day of Ed's year`,
      file: "docs/notes.md",
    });
    assert.equal(quoted.ok, true);
  });

  it("the safe set follows the FILE type where there is no code context at all", () => {
    assert.deepEqual(unsafeCharactersFor("markdown"), [], "nothing typed into markdown prose can stop a build");
    assert.deepEqual(unsafeCharactersFor("html"), ["<", ">"], "in HTML text braces are ordinary; angle brackets change the markup");
  });

  it("refuses honestly when it cannot determine the context, rather than guessing either set", () => {
    // A bare line in a .tsx file: JSX text a formatter wrapped across lines, or
    // a statement this machine does not recognise. Guessing "string" is the
    // accept-attack; guessing "jsx" refuses honest strings — so it guesses
    // neither and says so.
    const result = replaceTextInLine({
      lineText: "        Don't stop believing",
      originalText: "stop believing",
      newText: "stop dreaming",
      file: "app/page.tsx",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "unknown-context");
      assert.match(result.detail, /cannot determine the context/);
    }
  });

  it("reads an escaped delimiter as part of the string, not the end of it", () => {
    const line = `const t = "a \\" b" + "We build things";`;
    assert.equal(contextAt(line, line.indexOf("We build things")), '"');
  });

  it("names a different forbidden set for each place a word can sit", () => {
    assert.deepEqual(unsafeCharactersFor("jsx"), ["<", ">", "{", "}"]);
    assert.deepEqual(unsafeCharactersFor('"'), ['"', "\\"]);
    assert.deepEqual(unsafeCharactersFor("`"), ["`", "\\"]);
  });

  it("refuses a line break, which would split the line of source", () => {
    const result = replaceTextInLine({ lineText: jsxLine, originalText: "We build things", newText: "two\nlines" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsafe-text");
  });

  it("refuses when the same words appear twice on the one line", () => {
    const result = replaceTextInLine({
      lineText: `<p>Same words and Same words</p>`,
      originalText: "Same words",
      newText: "Other words",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "ambiguous-line");
      assert.match(result.detail, /which was clicked/);
    }
  });

  it("refuses when the words have already gone from that line", () => {
    const result = replaceTextInLine({ lineText: jsxLine, originalText: "Something removed", newText: "New" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not-on-line");
  });

  it("refuses an edit that changes nothing", () => {
    const result = replaceTextInLine({ lineText: jsxLine, originalText: "We build things", newText: "We build things" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no-change");
  });
});

// ─── The repository half, with every GitHub call injected ────────────────────

function repoProject(fields: Partial<DevProject> = {}): DevProject {
  return {
    id: "proj_words",
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

function tree(paths: string[], sha = "sha_head", truncated = false): RepoHead {
  return { sha, truncated, files: paths.map(path => ({ path })) };
}

function repoFile(path: string, contents: string): RepoFile {
  return { path, editable: true, contents, fingerprint: "fp" };
}

/**
 * A GitHub that answers without a network — and is STATEFUL, like the real one.
 *
 * The real `publishEdits` runs against this rather than being replaced by a
 * stub, because the refusals under test — a moved branch, a changed line — are
 * ITS refusals, and a stub that returned `published: request.confirm === true`
 * would pass every one of them while the real code committed. This also puts
 * the whole commit sequence under test: create the branch from the mapped
 * commit, one tree, one commit, and a non-forced ref update.
 *
 * Stateful because its predecessor was not, and that WAS the test gap: it
 * always 404'd the ref lookup and always accepted the PATCH, so it could only
 * model the FIRST edit on a project. The real GitHub remembers the branch and
 * refuses a non-fast-forward update — which is exactly what every second edit
 * hit while the code built each commit from `baseSha`, with the PR body then
 * claiming success. So this fake tracks refs and commit ancestry and enforces
 * the fast-forward rule the way GitHub does.
 */
function fakeGitHub() {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  /** branch name → the commit sha it points at. */
  const refs = new Map<string, string>();
  /** commit sha → its parents, so a ref update can be checked for fast-forward. */
  const commits = new Map<string, { parents: string[] }>();
  let treeCount = 0;
  let commitCount = 0;

  /** Is `ancestor` reachable from `sha` by walking parents? Equal counts. */
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
      return json({ sha: `tree_sha_${treeCount}` });
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      commitCount += 1;
      const sha = `commit_sha_${commitCount}`;
      commits.set(sha, { parents: Array.isArray(body.parents) ? body.parents.map(String) : [] });
      return json({ sha });
    }
    if (method === "PATCH" && path.includes("/git/refs/heads/")) {
      const branch = path.split("/git/refs/heads/")[1];
      const current = refs.get(branch);
      if (!current) return json({ message: "Reference does not exist" }, 422);
      // THE rule the old fake lacked: a non-forced update must be a
      // fast-forward — the new commit has to descend from the branch head.
      if (body.force !== true && !isAncestor(current, String(body.sha))) {
        return json({ message: "Update is not a fast forward" }, 422);
      }
      refs.set(branch, String(body.sha));
      return json({ ref: `refs/heads/${branch}` });
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };
  return { impl, calls, refs, commits };
}

/** A dep set that records what it was asked for, so "did it read that?" is assertable. */
function deps(input: {
  files?: Record<string, string>;
  head?: RepoHead;
  headSha?: string;
  openPr?: () => Promise<PullRequestRef>;
} = {}) {
  const files = input.files ?? { "app/page.tsx": PAGE };
  const readPaths: string[] = [];
  const published: PublishRequest[] = [];
  const github = fakeGitHub();
  const value: SourceEditDeps & {
    readPaths: string[];
    published: PublishRequest[];
    github: ReturnType<typeof fakeGitHub>;
  } = {
    githubToken: "token_from_the_vault",
    readTree: async () => input.head ?? tree(Object.keys(files)),
    readHeadSha: async () => input.headSha ?? (input.head ?? tree(Object.keys(files))).sha,
    readFile: async (_source, path) => {
      readPaths.push(path);
      const contents = files[path];
      if (contents === undefined) return { path, editable: false, reason: "Not here." };
      return repoFile(path, contents);
    },
    // The REAL publish, with only the socket replaced.
    publish: async (request: PublishRequest): Promise<PublishOutcome> => {
      published.push(request);
      return publishEdits({ ...request, fetchImpl: github.impl });
    },
    openPr: input.openPr ?? (async () => ({ number: 7, url: "https://github.com/acme/site/pull/7", state: "open", merged: false })),
    readPaths,
    published,
    github,
  };
  return value;
}

describe("searching a project's repository", () => {
  it("reads only the files words can come out of", async () => {
    const dependencies = deps({
      files: {
        "app/page.tsx": PAGE,
        "docs/readme.md": "# We build things",
        "src/server/secretish.ts": "const label = 'We build things';",
        "public/logo.png": "binary",
      },
    });
    const found = await findWordsInProject(
      { agencyId: "agency_1", project: repoProject(), text: "We build things" },
      dependencies,
    );
    assert.deepEqual(
      dependencies.readPaths.sort(),
      ["app/page.tsx", "docs/readme.md"],
      "isMappableFile is the filter — a .ts server file is never fetched, let alone offered as a place to edit copy",
    );
    assert.deepEqual(
      found.candidates.map(item => `${item.file}:${item.line}`).sort(),
      ["app/page.tsx:4", "app/page.tsx:5", "docs/readme.md:1"],
      "the title attribute on line 5 carries the same words and is offered too — hiding it would mean the one place somebody edited is missing from the list",
    );
    assert.equal(found.commitSha, "sha_head");
    assert.equal(found.scanned, 2);
  });

  it("says when it stopped looking rather than pretending it looked everywhere", async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < SOURCE_SCAN_FILE_CAP + 5; index += 1) files[`p${index}.tsx`] = "<p>nothing</p>";
    const found = await findWordsInProject(
      { agencyId: "agency_1", project: repoProject(), text: "We build things" },
      deps({ files }),
    );
    assert.equal(found.cappedAt, SOURCE_SCAN_FILE_CAP);
    assert.equal(found.reason, "not-found");
  });

  it("reports a truncated tree, because 'not found' and 'not looked at' differ", async () => {
    const found = await findWordsInProject(
      { agencyId: "agency_1", project: repoProject(), text: "We build things" },
      deps({ head: tree(["app/page.tsx"], "sha_head", true) }),
    );
    assert.ok(found.skipped.some(item => /truncated/i.test(item.reason)));
  });

  it("reports a file it could not read instead of silently dropping it", async () => {
    const dependencies = deps({ files: { "app/page.tsx": PAGE, "app/broken.tsx": "" } });
    dependencies.readFile = async (_source, path) => {
      if (path === "app/broken.tsx") throw new Error("GitHub request failed (403).");
      return repoFile(path, PAGE);
    };
    const found = await findWordsInProject(
      { agencyId: "agency_1", project: repoProject(), text: "We build things" },
      dependencies,
    );
    assert.deepEqual(found.skipped, [{ file: "app/broken.tsx", reason: "GitHub request failed (403)." }]);
    assert.deepEqual(found.candidates.map(item => item.line), [4, 5], "the readable file still answered");
  });

  it("refuses a project with no repository, in words rather than an empty result", async () => {
    await assert.rejects(
      () => findWordsInProject(
        { agencyId: "agency_1", project: repoProject({ repository: "" }), text: "We build things" },
        deps(),
      ),
      (error: unknown) => error instanceof SourceEditUnavailable && error.code === "no-repository",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

async function findThenPublish(overrides: Partial<Parameters<typeof publishWordsEdit>[0]> = {}, dependencies = deps()) {
  const project = repoProject();
  const found = await findWordsInProject({ agencyId: "agency_1", project, text: "We build things" }, dependencies);
  const candidate = found.candidates[0];
  const result = await publishWordsEdit({
    agencyId: "agency_1",
    project,
    file: candidate.file,
    line: candidate.line,
    expectedHash: candidate.expectedHash,
    commitSha: found.commitSha,
    originalText: "We build things",
    newText: "We make things",
    ...overrides,
  }, dependencies);
  return { result, dependencies, candidate, found };
}

describe("successive edits on the SAME file keep each other", () => {
  // The lost-update found by adversarial verify (2026-08-21): publishWordsEdit
  // read the file at the BASE branch, so edit 2's tree carried main+edit-2 and
  // silently reverted edit 1 — chained commits, clean PR, success message,
  // first edit gone. The fake here is ref-aware and MATERIALIZES the branch
  // copy after each publish, which is exactly what the shipped fake could not
  // model and why the hole survived the suite.
  function branchAwareDeps() {
    const BRANCH = "aqua-editor/proj_words";
    const materialized = new Map<string, string>();
    const dependencies = deps();
    const baseRead = dependencies.readFile!;
    dependencies.readFile = async (source, path) => {
      if (source.ref === BRANCH) {
        const branchCopy = materialized.get(path);
        // Missing branch behaves like GitHub: the read THROWS (404), and the
        // caller falls back to base. Returning not-editable here would be a
        // different (wrong) contract.
        if (branchCopy === undefined) throw new Error("Not Found");
        return { path, editable: true, contents: branchCopy };
      }
      return baseRead(source, path);
    };
    const basePublish = dependencies.publish!;
    dependencies.publish = async request => {
      const outcome = await basePublish(request);
      if (outcome.published) {
        for (const planned of (request.plan as PatchPlan).files) materialized.set(planned.file, planned.contents);
      }
      return outcome;
    };
    return dependencies;
  }

  it("edit 2 on another line preserves edit 1 in the tree it publishes", async () => {
    const dependencies = branchAwareDeps();
    const first = await findThenPublish({ confirm: true }, dependencies);
    assert.equal(first.result.outcome.published, true);

    const project = repoProject();
    const found = await findWordsInProject({ agencyId: "agency_1", project, text: "A tagline that is longer" }, dependencies);
    const candidate = found.candidates[0];
    const second = await publishWordsEdit({
      agencyId: "agency_1",
      project,
      file: candidate.file,
      line: candidate.line,
      expectedHash: candidate.expectedHash,
      commitSha: found.commitSha,
      originalText: "A tagline that is longer",
      newText: "A sharper tagline",
      confirm: true,
    }, dependencies);
    assert.equal(second.outcome.published, true);

    const secondPlan = dependencies.published.at(-1)!.plan as PatchPlan;
    const contents = secondPlan.files[0].contents;
    assert.match(contents, /We make things/, "edit 1 must survive edit 2 — this is the lost-update");
    assert.match(contents, /A sharper tagline/, "edit 2 landed too");
  });

  it("edit 2 on the SAME line refuses honestly instead of silently reverting", async () => {
    const dependencies = branchAwareDeps();
    const first = await findThenPublish({ confirm: true }, dependencies);
    assert.equal(first.result.outcome.published, true);

    // FIND still reads main, so the candidate's hash describes main's copy of
    // line 4 — which the branch has since changed. Publishing against it must
    // refuse, not quietly restore main's line.
    const second = await findThenPublish({ confirm: true, newText: "We deliver things" }, dependencies);
    assert.equal(second.result.outcome.published, false, "a stale line is a refusal, never a silent revert");
    // Stronger than a rejected plan: the branch's copy no longer contains the
    // original words, so the refusal fires BEFORE any publish is attempted.
    assert.ok(second.result.refusal, "the refusal is named to the caller");
    assert.equal(dependencies.published.length, 1, "no second publish call was ever made");
  });
});

describe("committing the edit", () => {
  it("dry-runs by default and writes nothing", async () => {
    const { result, dependencies } = await findThenPublish();
    assert.equal(result.outcome.published, false);
    assert.equal(dependencies.published.length, 1);
    assert.notEqual(dependencies.published[0].confirm, true, "confirm must not be true unless it was asked for");
    assert.deepEqual(result.outcome.files[0], {
      file: "app/page.tsx",
      line: 4,
      before: `      <h1 className="text-4xl">We build things</h1>`,
      after: `      <h1 className="text-4xl">We make things</h1>`,
    });
    assert.equal(result.pullRequest, undefined, "a dry run does not open a pull request");
  });

  it("commits when confirmed, with the whole line rebuilt correctly", async () => {
    const { result, dependencies } = await findThenPublish({ confirm: true });
    assert.equal(result.outcome.published, true);
    assert.equal(result.outcome.commitSha, "commit_sha_1");
    const plan = dependencies.published[0].plan as PatchPlan;
    assert.deepEqual(plan.rejected, []);
    assert.equal(plan.files[0].contents.includes(`      <h1 className="text-4xl">We make things</h1>`), true);
    assert.equal(plan.files[0].contents.includes("We build things, properly"), true, "the rest of the file is untouched");
  });

  it("creates the branch from the mapped commit, writes one tree and one commit, and never forces", async () => {
    const { dependencies } = await findThenPublish({ confirm: true });
    const calls = dependencies.github.calls;
    const created = calls.find(call => call.method === "POST" && call.path.endsWith("/git/refs"));
    assert.equal(created?.body.ref, "refs/heads/aqua-editor/proj_words");
    assert.equal(created?.body.sha, "sha_head", "branched from the commit the edit was made against, not from whatever HEAD is now");

    const tree = calls.find(call => call.path.endsWith("/git/trees"));
    const entries = tree?.body.tree as Array<{ path: string; content: string }>;
    assert.equal(entries.length, 1, "one tree, so the file lands whole or not at all");
    assert.equal(entries[0].path, "app/page.tsx");
    assert.match(entries[0].content, /We make things/);

    const commits = calls.filter(call => call.path.endsWith("/git/commits"));
    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0].body.parents, ["sha_head"]);
    assert.match(String(commits[0].body.message), /app\/page\.tsx:4/);

    const update = calls.find(call => call.method === "PATCH");
    assert.equal(update?.body.force, false, "a rejected update means re-map, never overwrite");
  });

  it("the SECOND edit on a project stacks on the first — it used to 422 as a non-fast-forward, every time", async () => {
    // THE DEFECT: every commit was built from `target.baseSha` — base_tree AND
    // parent — so edit 2's commit had the same parent as edit 1's instead of
    // descending from it, GitHub refused the non-forced ref update, and the PR
    // body claimed success anyway. This test fails on that code.
    const dependencies = deps();
    const project = repoProject();

    const one = await findWordsInProject({ agencyId: "agency_1", project, text: "We build things" }, dependencies);
    const first = await publishWordsEdit({
      agencyId: "agency_1", project,
      file: one.candidates[0].file, line: one.candidates[0].line,
      expectedHash: one.candidates[0].expectedHash, commitSha: one.commitSha,
      originalText: "We build things", newText: "We make things", confirm: true,
    }, dependencies);
    assert.equal(first.outcome.published, true);
    assert.equal(first.outcome.commitSha, "commit_sha_1");

    const two = await findWordsInProject({ agencyId: "agency_1", project, text: "A tagline that is longer" }, dependencies);
    const second = await publishWordsEdit({
      agencyId: "agency_1", project,
      file: two.candidates[0].file, line: two.candidates[0].line,
      expectedHash: two.candidates[0].expectedHash, commitSha: two.commitSha,
      originalText: "A tagline that is longer", newText: "A tagline that is better", confirm: true,
    }, dependencies);
    assert.equal(second.outcome.published, true, "the second edit must land — a 422 here is the build-from-baseSha bug back again");
    assert.equal(second.outcome.commitSha, "commit_sha_2");

    // The chain, explicitly: edit 2 builds ON THE BRANCH TIP, not on main again.
    const calls = dependencies.github.calls;
    const trees = calls.filter(call => call.path.endsWith("/git/trees"));
    assert.equal(trees[0].body.base_tree, "sha_head", "edit 1 builds on the mapped commit");
    assert.equal(trees[1].body.base_tree, "commit_sha_1", "edit 2 builds on the branch head, never on baseSha again");
    const commitCalls = calls.filter(call => call.path.endsWith("/git/commits"));
    assert.deepEqual(commitCalls[0].body.parents, ["sha_head"]);
    assert.deepEqual(commitCalls[1].body.parents, ["commit_sha_1"], "each commit's parent is the commit before it");
    assert.equal(dependencies.github.refs.get("aqua-editor/proj_words"), "commit_sha_2", "the branch ends on the second commit");
    assert.equal(
      calls.filter(call => call.method === "POST" && call.path.endsWith("/git/refs")).length,
      1,
      "the branch is created once; the second edit finds it and uses its tip",
    );
    // Still no force anywhere: a REAL non-fast-forward after this fix is a
    // genuine conflict and must surface, not be overwritten.
    for (const patch of calls.filter(call => call.method === "PATCH")) {
      assert.equal(patch.body.force, false);
    }
  });

  it("the fake GitHub itself refuses a non-fast-forward — a fake without the rule can only model the first edit", async () => {
    // Guards the fake, so nobody simplifies it back into the stub that hid the
    // defect: always-404 the lookup, always-accept the PATCH.
    const github = fakeGitHub();
    const call = async (method: string, path: string, body: unknown) =>
      github.impl(`https://api.github.com${path}`, { method, body: JSON.stringify(body) });

    await call("POST", "/repos/acme/site/git/refs", { ref: "refs/heads/aqua-editor/x", sha: "root" });
    await call("POST", "/repos/acme/site/git/commits", { message: "1", tree: "t", parents: ["root"] });   // commit_sha_1
    const forward = await call("PATCH", "/repos/acme/site/git/refs/heads/aqua-editor/x", { sha: "commit_sha_1", force: false });
    assert.equal(forward.status, 200, "a descendant of the head is a fast-forward");

    await call("POST", "/repos/acme/site/git/commits", { message: "2", tree: "t", parents: ["root"] });   // commit_sha_2 — sibling, not descendant
    const refused = await call("PATCH", "/repos/acme/site/git/refs/heads/aqua-editor/x", { sha: "commit_sha_2", force: false });
    assert.equal(refused.status, 422, "a sibling built from the same base is NOT a fast-forward, and GitHub says so");

    const lookup = await call("GET", "/repos/acme/site/git/ref/heads/aqua-editor/x", undefined);
    assert.equal(((await lookup.json()) as { object: { sha: string } }).object.sha, "commit_sha_1", "the refused update moved nothing");
  });

  it("never touches the branch at all on a dry run", async () => {
    const { dependencies } = await findThenPublish();
    assert.deepEqual(dependencies.github.calls, [], "not one GitHub request is made until confirm is true");
  });

  it("commits to a branch, never to the branch the project reads", async () => {
    const { result } = await findThenPublish({ confirm: true });
    assert.equal(result.baseBranch, "main");
    assert.notEqual(result.branch, "main");
    assert.match(result.branch, /^aqua-editor\//);
    assert.equal(editBranchName(repoProject({ id: "a b/c" })), "aqua-editor/a-b-c");
  });

  it("opens a pull request, because a branch nobody sees is not published", async () => {
    const { result } = await findThenPublish({ confirm: true });
    assert.equal(result.pullRequest?.url, "https://github.com/acme/site/pull/7");
  });

  it("does not call a landed commit a failure when only the pull request fails", async () => {
    const dependencies = deps({ openPr: async () => { throw new Error("no permission to open pull requests"); } });
    const { result } = await findThenPublish({ confirm: true }, dependencies);
    assert.equal(result.outcome.published, true, "the commit is in; re-doing the edit would double it");
    assert.equal(result.pullRequest, undefined);
  });

  it("skips the pull request when the caller says not to", async () => {
    const { result } = await findThenPublish({ confirm: true, openPullRequest: false });
    assert.equal(result.outcome.published, true);
    assert.equal(result.pullRequest, undefined);
  });

  it("refuses when the branch moved between finding and saving", async () => {
    // The whole reason FIND hands back a commitSha and PUBLISH takes it again.
    const dependencies = deps({ headSha: "sha_someone_else_pushed" });
    const { result } = await findThenPublish({ confirm: true }, dependencies);
    assert.equal(result.outcome.published, false);
    assert.equal(dependencies.published[0].plan.rejected[0].rejection.reason, "registry-stale");
    assert.match(result.outcome.rejected[0].rejection.detail, /Re-map before editing/);
    // Not "Nothing to publish." A plan where every edit was rejected has no
    // files, and the empty-plan branch used to answer first — so the one thing
    // the operator needed to know was replaced by a sentence meaning the
    // opposite. See the note in publish.ts.
    assert.match(result.outcome.summary, /Not published/);
    assert.deepEqual(dependencies.github.calls, [], "and nothing was written");
  });

  it("refuses when that one line changed, even though the branch did not", async () => {
    const dependencies = deps();
    const { result } = await findThenPublish({ confirm: true, expectedHash: hashLine("something else entirely") }, dependencies);
    assert.equal(result.outcome.published, false);
    assert.equal(dependencies.published[0].plan.rejected[0].rejection.reason, "line-changed");
  });

  it("refuses unsafe words without going near GitHub", async () => {
    const dependencies = deps();
    const { result } = await findThenPublish({ confirm: true, newText: "We {make} things" }, dependencies);
    assert.equal(result.refusal?.reason, "unsafe-text");
    assert.equal(dependencies.published.length, 0, "publish is never reached, so nothing can be written");
  });

  it("refuses a file that never came from a candidate", async () => {
    const dependencies = deps();
    const { result } = await findThenPublish({ confirm: true, file: "src/server/secrets.ts" }, dependencies);
    assert.equal(result.refusal?.reason, "unknown-file");
    assert.equal(dependencies.published.length, 0);
  });

  it("refuses a line that has gone since it was found", async () => {
    const dependencies = deps();
    const { result } = await findThenPublish({ confirm: true, line: 900 }, dependencies);
    assert.equal(result.refusal?.reason, "line-missing");
    assert.equal(dependencies.published.length, 0);
  });

  it("carries the vault's token to publish and never invents one", async () => {
    const { dependencies } = await findThenPublish({ confirm: true });
    assert.equal(dependencies.published[0].token, "token_from_the_vault");
  });

  it("refuses to publish for a project with no repository", async () => {
    await assert.rejects(
      () => publishWordsEdit({
        agencyId: "agency_1",
        project: repoProject({ repository: "" }),
        file: "app/page.tsx", line: 4, expectedHash: "x", commitSha: "y",
        originalText: "We build things", newText: "We make things", confirm: true,
      }, deps()),
      (error: unknown) => error instanceof SourceEditUnavailable && error.code === "no-repository",
    );
  });

  it("refuses when no connection holds a token", async () => {
    const saved = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      await assert.rejects(
        () => findWordsInProject(
          { agencyId: `agency_no_token_${Date.now()}`, project: repoProject(), text: "We build things" },
          { readTree: async () => tree(["app/page.tsx"]) },
        ),
        (error: unknown) => error instanceof SourceEditUnavailable && error.code === "no-token",
      );
    } finally {
      if (saved === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = saved;
    }
  });
});

// ─── The route, in process, offline ──────────────────────────────────────────

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Words Co", slug: `words-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@words.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "words-operator-pass",
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
  candidates?: unknown[];
  refusal?: { reason: string };
}

async function post(token: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/source-edit",
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) },
  ) as never)));
  return { status: response.status, body: await response.json() as RouteBody };
}

async function localProject(agencyId: string, userId: string, fields: Partial<DevProject> = {}) {
  return saveDevProject({
    agencyId,
    actorUserId: userId,
    name: "Local project",
    ...fields,
  } as never);
}

describe("the endpoint", () => {
  it("refuses a request from another origin", async () => {
    const { token } = await founder();
    const result = await post(token, { action: "find", project: "x" }, { origin: "https://evil.test" });
    assert.equal(result.status, 403);
    assert.match(result.body.error ?? "", /origin/i);
  });

  it("needs a project", async () => {
    const { token } = await founder();
    const result = await post(token, { action: "find", text: "We build things" });
    assert.equal(result.status, 400);
  });

  it("cannot be pointed at another agency's project", async () => {
    const a = await founder();
    const b = await founder();
    const mine = await localProject(a.agency.id, a.userId, { repository: "acme/site" });
    const result = await post(b.token, { action: "find", project: mine.id, text: "We build things" });
    assert.equal(result.status, 404, "tenant is checked before project, so a real id from elsewhere is simply not found");
  });

  it("says plainly that a project with no repository has nowhere to commit", async () => {
    const { token, agency, userId } = await founder();
    const project = await localProject(agency.id, userId, { repository: "" });
    const result = await post(token, { action: "find", project: project.id, text: "We build things" });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "no-repository");
    assert.match(result.body.error ?? "", /Dev mode/);
  });

  it("points at the connections screen when there is no token", async () => {
    const saved = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const { token, agency, userId } = await founder();
      const project = await localProject(agency.id, userId, { repository: "acme/site" });
      const result = await post(token, { action: "find", project: project.id, text: "We build things" });
      assert.equal(result.status, 409);
      assert.equal(result.body.code, "no-token");
    } finally {
      if (saved === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = saved;
    }
  });

  it("will not publish without a place to publish to", async () => {
    const { token, agency, userId } = await founder();
    const project = await localProject(agency.id, userId, { repository: "acme/site" });
    const result = await post(token, { action: "publish", project: project.id, newText: "x" });
    assert.equal(result.status, 400, "a publish with no candidate is a bug, not a guess to be filled in");
  });

  it("keeps founder access through the owner capability baseline without Dev Mode", async () => {
    const { token, agency, userId } = await founder();
    const project = await localProject(agency.id, userId, { repository: "" });
    // Deliberately NOT wrapped in withDevMode.
    const saved = process.env.PORTAL_DEV_MODE;
    process.env.PORTAL_DEV_MODE = "false";
    try {
      const response = await withSession(token, () => POST(new Request(
        "http://localhost/api/portal/dev/source-edit",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "find", project: project.id, text: "abc" }) },
      ) as never));
      assert.equal(response.status, 409);
    } finally {
      if (saved === undefined) delete process.env.PORTAL_DEV_MODE; else process.env.PORTAL_DEV_MODE = saved;
    }
  });

  it("takes the repository, the ref and the token from the record, never from the body", async () => {
    const source = await readFile(ROUTE_FILE, "utf-8");
    for (const field of ["body.token", "body.repository", "body.ref", "body.agencyId"]) {
      assert.equal(source.includes(field), false, `${field} must never be read — the record and the vault are the only sources`);
    }
    assert.match(source, /requireDevProjectAccess/, "tenant and project resolution use the canonical access helper");
    assert.equal(/export async function GET/.test(source), false, "POST only — a GET could be triggered cross-site");
  });
});

// ─── What the screen now claims ──────────────────────────────────────────────

describe("the panel tells the truth about what saved", () => {
  it("no longer says publishing is not built", async () => {
    const source = await readFile(EDITOR_FILE, "utf-8");
    assert.equal(
      source.includes("Writing them back to the repository is the publish step, which is not built yet."),
      false,
      "that sentence was true before this change and is now a lie for the words",
    );
    assert.match(source, /<WordsSourceSave/, "the save panel is actually mounted, not just written");
    assert.match(source, /only the words can be saved back to the repository so far/,
      "styling and images still do not persist and the panel must keep saying so");
  });

  it("keeps a project with no repository honest instead of showing a dead button", async () => {
    const source = await readFile(EDITOR_FILE, "utf-8");
    assert.match(source, /No project is selected, so there is no repository to save to\./);
    assert.match(source, /This project has no repository\./);
    assert.match(source, /Aqua-hosted portal/);
  });

  it("searches for the words the page had, not the ones being typed", async () => {
    const source = await readFile(EDITOR_FILE, "utf-8");
    assert.match(source, /setWordsOriginal/, "the needle has to be held still while the preview patch rewrites the element");
    assert.match(source, /originalWords: wordsOriginal/, "the panel is handed the held-still needle, not the draft");
  });

  it("leaves the local-disk backstop exactly where it was", async () => {
    // A repository-backed project must never be written to this server's tree.
    const source = await readFile(FILES_ROUTE, "utf-8");
    assert.match(source, /if \(project\?\.repository\) \{/);
    assert.match(source, /backed by a repository — changes are committed and published/);
  });
});
