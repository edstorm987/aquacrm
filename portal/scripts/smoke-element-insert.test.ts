// ─── PHASE 7 — INSERTING AN ELEMENT WRITES REAL CODE ─────────────────────────
//
//   Ed: "the visual editor has like a component library like adding in a
//   section or something will actually add the correct code it all gets put
//   in right"
//
// Before this, the element library was browse-and-select: on an Aqua-hosted
// portal an insert mutated the portal document (correct there, untouched
// here), and on a repository-backed website it did nothing at all — the
// library sentence honestly said "not wired yet". This file pins the wiring:
//
//   EMIT    — `elements/emit.ts` renders a block definition as plain,
//             structural JSX/HTML with its registry defaults filled in. No
//             imports, no identifiers, no framework guesses — code that
//             compiles in ANY page file, derived ONLY from what the registry
//             declares. Deterministic, because the preview and the commit
//             must be the same text.
//   PLACE   — `server/sourceInsert.ts` decides whether the chosen gap can
//             take it, by asking `sourceMatch.contextAt` at the end of the
//             anchor line. `unknown` REFUSES. Never a guess into JSX: one
//             wrong gap is a build error on a client's website.
//   COMMIT  — `repoWrite.insertElementIntoRepo` previews without writing,
//             then commits THROUGH `saveRepoFile` — the same draft branch,
//             branch-first read, fingerprint refusal, branch lock and honest
//             "draft branch, not the site" summary the code canvas already
//             proved. Nothing here is a second write path.
//
// The stateful fake GitHub below is the smoke-repo-write one (itself extended
// from smoke-editor-words-publish), grown a `readTree` answer so the target
// picker can be driven. Same rule as its ancestors: commits go through the
// REAL `publishEdits` with only the socket replaced, because a stub that
// returned `published: true` would pass while the real code lost an edit.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import { readFileSync } from "node:fs";

import { emitElementCode, emitElementSource, emitKindForFile } from "../src/engines/editor/elements/emit";
import { getElementDefinition } from "../src/engines/editor/elements/registry";
import { ensureWebsiteElements } from "../src/engines/editor/elements/websiteElements";
import { planSourceInsert } from "../src/engines/editor/server/sourceInsert";
import {
  createRepoPath,
  insertElementIntoRepo,
  listInsertTargets,
  saveRepoFile,
  type RepoWriteDeps,
} from "../src/engines/editor/server/repoWrite";
import { editBranchName } from "../src/engines/editor/server/sourceEdit";
import { openPullRequest, publishEdits, type PublishRequest } from "../src/engines/editor/server/publish";
import { hashFile } from "../src/engines/editor/server/codeAdapter";
import type { RepoFile } from "../src/engines/editor/server/githubSource";
import { POST } from "../src/app/api/portal/dev/repo-write/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { DevProject } from "../src/server/types";
import type { BlockDefinition } from "../src/engines/editor/elements/definition";

const EDITOR_FILE = new URL("../src/engines/editor/DevEditor.tsx", import.meta.url);
const PANEL_FILE = new URL("../src/components/editing/ElementInsertPanel.tsx", import.meta.url);

// ─── The project and the repository it points at ─────────────────────────────

function repoProject(fields: Partial<DevProject> = {}): DevProject {
  return {
    id: "proj_insert",
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

const BRANCH = editBranchName(repoProject()); // aqua-editor/proj_insert

/** Multi-line JSX, so a safe anchor line actually exists. */
const PAGE = [
  "export default function Home() {",
  "  return (",
  "    <main>",
  "      <h1>We build things</h1>",
  "    </main>",
  "  );",
  "}",
].join("\n");

const NOTES = "# Notes\n\nSome prose.\n";
const INDEX = "<html>\n  <body>\n    <p>x</p>\n  </body>\n</html>\n";

const BASE_FILES: Record<string, string> = {
  "src/app/page.tsx": PAGE,
  "docs/notes.md": NOTES,
  "public/index.html": INDEX,
  "src/lib/util.ts": "export const x = 1;\n",
};

// ─── The stateful fake GitHub (lineage: smoke-repo-write.test.ts) ────────────

function fakeGitHub(baseFiles: Record<string, string> = BASE_FILES, baseSha = "sha_base") {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const refs = new Map<string, string>([["main", baseSha]]);
  const commits = new Map<string, { parents: string[]; tree: string }>([[baseSha, { parents: [], tree: "tree_base" }]]);
  const trees = new Map<string, Record<string, string>>([["tree_base", { ...baseFiles }]]);
  const treeBase = new Map<string, string>();
  const pulls: Array<{ number: number; head: string; state: string; url: string }> = [];
  let treeCount = 0;
  let commitCount = 0;

  const snapshotAt = (commitSha: string): Record<string, string> => {
    const commit = commits.get(commitSha);
    if (!commit) throw new Error(`fake: unknown commit ${commitSha}`);
    const base = treeBase.get(commit.tree);
    const parent = base ? snapshotAt(base) : {};
    return { ...parent, ...(trees.get(commit.tree) ?? {}) };
  };

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

  const headSha = (ref: string): string => {
    const tip = refs.get(ref);
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

  /** NEW for this file: what real `readRepoTree` answers, off the fake's state. */
  const treeAt = (ref: string) => ({
    sha: headSha(ref),
    truncated: false,
    files: Object.keys(snapshotAt(headSha(ref))).map(path => ({ path })),
  });

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

  return { impl, calls, refs, commits, pulls, snapshotAt, headSha, fileAt, treeAt };
}

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
    readTree: async source => github.treeAt(source.ref),
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

// ─── 1. THE EMITTER — a definition, said as source ───────────────────────────

describe("emitElementSource renders the registry's own defaults, deterministically", () => {
  it("hero: eyebrow, headline, subhead and the CTA pair, in field order", async () => {
    await ensureWebsiteElements();
    assert.deepEqual(emitElementSource(getElementDefinition("hero")!, "jsx"), [
      '<section data-aqua-element="hero">',
      "  <p>Welcome</p>",
      "  <h2>Build something beautiful</h2>",
      "  <p>A short tagline that explains the value proposition.</p>",
      '  <a href="#">Get started</a>',
      "</section>",
    ]);
  });

  it("pairs a url field with its label ONCE — the CTA words never emit twice", async () => {
    await ensureWebsiteElements();
    const hero = emitElementCode(getElementDefinition("hero")!, "jsx");
    assert.equal(hero.match(/Get started/g)?.length, 1, "ctaLabel emitted as a paragraph AND inside the anchor");
    // button: label + href collapse to one anchor, which then IS the element.
    assert.deepEqual(emitElementSource(getElementDefinition("button")!, "jsx"), [
      '<a data-aqua-element="button" href="#">Click me</a>',
    ]);
  });

  it("one piece of content IS the element — no wrapper around a lone paragraph", async () => {
    await ensureWebsiteElements();
    assert.deepEqual(emitElementSource(getElementDefinition("text")!, "jsx"), [
      '<p data-aqua-element="text">Add your copy here. Click to edit.</p>',
    ]);
    // The heading block's `text` field is its TITLE — the type carries the intent.
    assert.deepEqual(emitElementSource(getElementDefinition("heading")!, "jsx"), [
      '<h2 data-aqua-element="heading">Your headline</h2>',
    ]);
  });

  it("styling knobs emit NOTHING — a container is a wrapper and an honest comment", async () => {
    await ensureWebsiteElements();
    // grid's `gap: "24px"` is a text-typed field, but it is a measurement, not
    // words on a page. Emitting <p>24px</p> is the bug this pins out.
    assert.deepEqual(emitElementSource(getElementDefinition("grid")!, "jsx"), [
      '<section data-aqua-element="grid">',
      "  {/* Grid content */}",
      "</section>",
    ]);
    assert.deepEqual(emitElementSource(getElementDefinition("grid")!, "html"), [
      '<section data-aqua-element="grid">',
      "  <!-- Grid content -->",
      "</section>",
    ]);
  });

  it("skips arrays and objects rather than guessing markup for them", async () => {
    await ensureWebsiteElements();
    // testimonials carries an items[] default; only the title is emittable.
    assert.deepEqual(emitElementSource(getElementDefinition("testimonials")!, "jsx"), [
      '<h2 data-aqua-element="testimonials">Loved by founders</h2>',
    ]);
  });

  it("escapes the characters that would change the program", () => {
    const def = {
      type: "x-test",
      label: "Test",
      isContainer: false,
      defaultProps: { text: "Don't <stop> {believing} & more", ctaLabel: "Go", ctaHref: 'https://x.test/?a=1&b="q"' },
      fields: [
        { key: "text", label: "Text", type: "text" },
        { key: "ctaLabel", label: "CTA", type: "text" },
        { key: "ctaHref", label: "URL", type: "url" },
      ],
    } as unknown as BlockDefinition;
    const jsx = emitElementSource(def, "jsx").join("\n");
    assert.match(jsx, /Don't &lt;stop&gt; &#123;believing&#125; &amp; more/);
    assert.match(jsx, /href="https:\/\/x\.test\/\?a=1&amp;b=&quot;q&quot;"/);
    // …and in HTML, braces are ordinary characters.
    const html = emitElementSource(def, "html").join("\n");
    assert.match(html, /\{believing\}/);
  });

  it("names the file kinds, and refuses the rest", () => {
    assert.equal(emitKindForFile("src/app/page.tsx"), "jsx");
    assert.equal(emitKindForFile("src/Hero.jsx"), "jsx");
    assert.equal(emitKindForFile("docs/post.mdx"), "jsx");
    assert.equal(emitKindForFile("docs/notes.md"), "html");
    assert.equal(emitKindForFile("public/index.html"), "html");
    assert.equal(emitKindForFile("src/lib/util.ts"), null, "a .ts module cannot take markup");
    assert.equal(emitKindForFile("styles.css"), null);
  });
});

// ─── 2. THE INSERT POINT — refuse rather than guess into JSX ─────────────────

describe("planSourceInsert places code only where the context is known", () => {
  const hero = '<section data-aqua-element="hero">\n  <p>Hi</p>\n</section>';

  it("inserts after a complete JSX element line, matching its indentation", () => {
    const plan = planSourceInsert({ contents: PAGE, code: hero, anchor: { type: "after-line", line: 4 }, file: "src/app/page.tsx" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.line, 5);
    assert.deepEqual(plan.insertedLines, [
      '      <section data-aqua-element="hero">',
      "        <p>Hi</p>",
      "      </section>",
    ]);
    assert.equal(plan.anchorText, "      <h1>We build things</h1>");
    assert.equal(plan.followingText, "    </main>");
    assert.equal(plan.newContents.split("\n").length, PAGE.split("\n").length + 3);
  });

  it("REFUSES a statement line — `return (` is code, not a gap in the page", () => {
    for (const line of [1, 2, 6, 7]) {
      const plan = planSourceInsert({ contents: PAGE, code: hero, anchor: { type: "after-line", line }, file: "src/app/page.tsx" });
      assert.equal(plan.ok, false, `line ${line} must refuse`);
      if (plan.ok) continue;
      assert.equal(plan.reason, "unknown-context");
    }
  });

  it("REFUSES a blank line in a component file — the machine cannot read it", () => {
    const page = PAGE.replace("      <h1>We build things</h1>", "      <h1>We build things</h1>\n");
    const plan = planSourceInsert({ contents: page, code: hero, anchor: { type: "after-line", line: 5 }, file: "src/app/page.tsx" });
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.reason, "unknown-context");
  });

  it("REFUSES a line that ends inside an attribute string", () => {
    const page = ['<div>', '  <img alt="a caption that', '  keeps going" />', '</div>'].join("\n");
    const plan = planSourceInsert({ contents: page, code: "<p>Hi</p>", anchor: { type: "after-line", line: 2 }, file: "src/app/page.tsx" });
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.reason, "unknown-context");
  });

  it("REFUSES the END of a component file — after the last line is outside the page", () => {
    const plan = planSourceInsert({ contents: PAGE, code: hero, anchor: { type: "end" }, file: "src/app/page.tsx" });
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.reason, "no-safe-end");
  });

  it("REFUSES a line that does not exist, by name", () => {
    const plan = planSourceInsert({ contents: PAGE, code: hero, anchor: { type: "after-line", line: 99 }, file: "src/app/page.tsx" });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.equal(plan.reason, "line-missing");
      assert.match(plan.detail, /7 lines/);
    }
  });

  it("markdown takes an append, set off by a blank line, trailing newline intact", () => {
    const plan = planSourceInsert({ contents: NOTES, code: "<p>Hi</p>", anchor: { type: "end" }, file: "docs/notes.md" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.deepEqual(plan.insertedLines, ["", "<p>Hi</p>"]);
    assert.equal(plan.newContents, "# Notes\n\nSome prose.\n\n<p>Hi</p>\n");
  });

  it("markdown mid-file gets blank separation on BOTH sides", () => {
    const plan = planSourceInsert({ contents: "# A\nline one\nline two\n", code: "<p>Hi</p>", anchor: { type: "after-line", line: 2 }, file: "docs/notes.md" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.deepEqual(plan.insertedLines, ["", "<p>Hi</p>", ""]);
  });

  it("MDX prose takes a JSX block; MDX code lines refuse like source", () => {
    const prose = planSourceInsert({ contents: "# Post\n\nSome prose.\n", code: hero, anchor: { type: "after-line", line: 3 }, file: "docs/post.mdx" });
    assert.ok(prose.ok);
    const code = planSourceInsert({ contents: "import X from './x';\n\nProse.\n", code: hero, anchor: { type: "after-line", line: 1 }, file: "docs/post.mdx" });
    assert.equal(code.ok, false);
  });

  it("an HTML document's end means BEFORE </body>, indented as a sibling", () => {
    const plan = planSourceInsert({ contents: INDEX, code: "<p>Hi</p>", anchor: { type: "end" }, file: "public/index.html" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.deepEqual(plan.insertedLines, ["    <p>Hi</p>"]);
    assert.equal(plan.newContents, "<html>\n  <body>\n    <p>x</p>\n    <p>Hi</p>\n  </body>\n</html>\n");
  });

  it("an HTML fragment with no </body> appends after its last content", () => {
    const plan = planSourceInsert({ contents: "<p>a</p>\n<p>b</p>\n", code: "<p>Hi</p>", anchor: { type: "end" }, file: "partials/frag.html" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.newContents, "<p>a</p>\n<p>b</p>\n<p>Hi</p>\n");
  });

  it("refuses empty code and non-page files outright", () => {
    const empty = planSourceInsert({ contents: PAGE, code: "   \n  ", anchor: { type: "after-line", line: 4 }, file: "src/app/page.tsx" });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.reason, "empty-code");
    const ts = planSourceInsert({ contents: "export const x = 1;", code: "<p>Hi</p>", anchor: { type: "end" }, file: "src/lib/util.ts" });
    assert.equal(ts.ok, false);
  });
});

// ─── 3. THE COMMIT — preview writes nothing, confirm goes through save ───────

describe("insertElementIntoRepo", () => {
  const heroCode = () => emitElementCode(getElementDefinition("hero")!, "jsx");

  it("previews without touching GitHub's write API at all", async () => {
    await ensureWebsiteElements();
    const dependencies = deps();
    const result = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", code: heroCode(),
      anchor: { type: "after-line", line: 4 }, label: "Hero",
    }, dependencies);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.published, false);
    assert.equal(result.line, 5);
    assert.equal(result.fingerprint, hashFile(PAGE), "the preview's fingerprint is the CURRENT file — what confirm must carry back");
    assert.equal(result.insertedLines.length, 6);
    assert.match(result.summary, /confirm/i);
    assert.equal(dependencies.published.length, 0, "a preview must never reach publishEdits");
    assert.equal(dependencies.github.calls.length, 0, "…or the socket");
    // Branch-first, even for a read that falls back to base.
    assert.deepEqual(dependencies.reads[0], { ref: BRANCH, path: "src/app/page.tsx" });
  });

  it("confirm commits the EXACT previewed splice to the draft branch", async () => {
    await ensureWebsiteElements();
    const dependencies = deps();
    const input = {
      agencyId: "agency_1", project: repoProject(),
      path: "src/app/page.tsx", code: heroCode(),
      anchor: { type: "after-line", line: 4 } as const, label: "Hero",
    };
    const preview = await insertElementIntoRepo(input, dependencies);
    assert.ok(preview.ok && !preview.published);
    if (!preview.ok) return;

    const committed = await insertElementIntoRepo({ ...input, fingerprint: preview.fingerprint, confirm: true }, dependencies);
    assert.ok(committed.ok);
    if (!committed.ok) return;
    assert.equal(committed.published, true);
    assert.ok(committed.commitSha);
    assert.match(committed.summary, /draft branch/);

    const snapshot = dependencies.github.snapshotAt(dependencies.github.refs.get(BRANCH)!);
    const lines = snapshot["src/app/page.tsx"].split("\n");
    assert.deepEqual(lines.slice(4, 10), preview.insertedLines, "what landed is what was previewed");
    assert.equal(lines[3], "      <h1>We build things</h1>", "the anchor line survives untouched");
    // The commit names the element and the landing line.
    assert.match(dependencies.published[0].message, /insert Hero into src\/app\/page\.tsx:5/);
    // …and main never moved.
    assert.equal(dependencies.github.refs.get("main"), "sha_base");
  });

  it("the second insert chains on the branch tip — the draft is the truth", async () => {
    await ensureWebsiteElements();
    const dependencies = deps();
    const first = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      code: heroCode(), anchor: { type: "after-line", line: 4 }, label: "Hero",
      fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.ok(first.ok && first.published);

    // Preview 2 must read the BRANCH copy: its fingerprint is the branch's.
    const preview = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      code: emitElementCode(getElementDefinition("text")!, "jsx"),
      anchor: { type: "after-line", line: 4 }, label: "Text",
    }, dependencies);
    assert.ok(preview.ok);
    if (!preview.ok || !first.ok) return;
    assert.equal(preview.fingerprint, first.fingerprint, "the preview reads the branch tip, not base");

    const second = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      code: emitElementCode(getElementDefinition("text")!, "jsx"),
      anchor: { type: "after-line", line: 4 }, label: "Text",
      fingerprint: preview.fingerprint, confirm: true,
    }, dependencies);
    assert.ok(second.ok && second.published);
    const snapshot = dependencies.github.snapshotAt(dependencies.github.refs.get(BRANCH)!);
    assert.match(snapshot["src/app/page.tsx"], /data-aqua-element="hero"/);
    assert.match(snapshot["src/app/page.tsx"], /data-aqua-element="text"/);
  });

  it("a file that moved between preview and confirm REFUSES — never a silent overwrite", async () => {
    await ensureWebsiteElements();
    const dependencies = deps();
    const preview = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      code: heroCode(), anchor: { type: "after-line", line: 4 }, label: "Hero",
    }, dependencies);
    assert.ok(preview.ok);
    if (!preview.ok) return;

    // Somebody else saves the same file in between.
    const moved = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      contents: PAGE.replace("We build things", "We build other things"),
      fingerprint: hashFile(PAGE), confirm: true,
    }, dependencies);
    assert.ok(moved.ok);

    const result = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      code: heroCode(), anchor: { type: "after-line", line: 4 }, label: "Hero",
      fingerprint: preview.fingerprint, confirm: true,
    }, dependencies);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "stale-fingerprint");
    assert.match(result.error, /changed since you opened it/);
  });

  it("carries the planner's refusals through, with their reasons", async () => {
    await ensureWebsiteElements();
    const unsafe = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/app/page.tsx",
      code: heroCode(), anchor: { type: "after-line", line: 2 }, label: "Hero",
    }, deps());
    assert.equal(unsafe.ok, false);
    if (!unsafe.ok) assert.equal(unsafe.reason, "unknown-context");

    const notMappable = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "src/lib/util.ts",
      code: heroCode(), anchor: { type: "end" }, label: "Hero",
    }, deps());
    assert.equal(notMappable.ok, false);
    if (!notMappable.ok) assert.equal(notMappable.reason, "not-mappable");

    const traversal = await insertElementIntoRepo({
      agencyId: "agency_1", project: repoProject(), path: "../evil.tsx",
      code: heroCode(), anchor: { type: "end" }, label: "Hero",
    }, deps());
    assert.equal(traversal.ok, false);
    if (!traversal.ok) assert.equal(traversal.reason, "bad-path");
  });
});

// ─── 4. THE TARGET PICKER ────────────────────────────────────────────────────

describe("listInsertTargets", () => {
  it("offers exactly the mappable files, from base before any branch exists", async () => {
    const result = await listInsertTargets({ agencyId: "agency_1", project: repoProject() }, deps());
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.readFrom, "main");
    assert.equal(result.branch, BRANCH);
    assert.deepEqual(result.files.sort(), ["docs/notes.md", "public/index.html", "src/app/page.tsx"]);
    assert.equal(result.files.includes("src/lib/util.ts"), false, "a .ts module is not a place for an element");
  });

  it("reads the draft branch once it exists — a page created there is a target", async () => {
    const dependencies = deps();
    const created = await createRepoPath({
      agencyId: "agency_1", project: repoProject(), path: "src/app/about.tsx",
      kind: "file", contents: "<div>\n</div>\n", confirm: true,
    }, dependencies);
    assert.ok(created.ok);
    const result = await listInsertTargets({ agencyId: "agency_1", project: repoProject() }, dependencies);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.readFrom, BRANCH);
    assert.ok(result.files.includes("src/app/about.tsx"));
  });
});

// ─── 5. THE ROUTE — the two-step is enforced at the door ─────────────────────

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Insert Co", slug: `insert-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@insert.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "insert-operator-pass",
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

interface RouteBody { ok?: boolean; error?: string; code?: string; reason?: string }

async function post(token: string, body: unknown) {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/repo-write",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ) as never)));
  return { status: response.status, body: await response.json() as RouteBody };
}

describe("the insert actions on /api/portal/dev/repo-write", () => {
  it("an insert needs a path, code and exactly one insert point", async () => {
    const { token, agency, userId } = await founder();
    const target = await saveDevProject({ agencyId: agency.id, actorUserId: userId, name: "P", repository: "acme/site" } as never);
    for (const body of [
      { action: "insert", project: target.id, code: "<p>x</p>", anchor: { afterLine: 4 } },              // no path
      { action: "insert", project: target.id, path: "src/app/page.tsx", anchor: { afterLine: 4 } },      // no code
      { action: "insert", project: target.id, path: "src/app/page.tsx", code: "<p>x</p>" },              // no anchor
      { action: "insert", project: target.id, path: "src/app/page.tsx", code: "<p>x</p>", anchor: {} },
      { action: "insert", project: target.id, path: "src/app/page.tsx", code: "<p>x</p>", anchor: { afterLine: 0 } },
      { action: "insert", project: target.id, path: "src/app/page.tsx", code: "<p>x</p>", anchor: { afterLine: 1.5 } },
      { action: "insert", project: target.id, path: "src/app/page.tsx", code: "<p>x</p>", anchor: { afterLine: 4, atEnd: true } },
    ]) {
      const result = await post(token, body);
      assert.equal(result.status, 400, `${JSON.stringify(body)} must be refused`);
    }
  });

  it("confirming without the preview's fingerprint is a 400, not a commit", async () => {
    const { token, agency, userId } = await founder();
    const target = await saveDevProject({ agencyId: agency.id, actorUserId: userId, name: "P", repository: "acme/site" } as never);
    const result = await post(token, {
      action: "insert", project: target.id, path: "src/app/page.tsx",
      code: "<p>x</p>", anchor: { afterLine: 4 }, confirm: true,
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error ?? "", /[Pp]review first/);
  });

  it("says plainly that a project with no repository has nowhere to insert", async () => {
    const { token, agency, userId } = await founder();
    const target = await saveDevProject({ agencyId: agency.id, actorUserId: userId, name: "P", repository: "" } as never);
    const result = await post(token, { action: "insert-targets", project: target.id });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "no-repository");
  });
});

// ─── 6. WHAT THE SCREENS CLAIM ───────────────────────────────────────────────

describe("the element library now inserts, and stays honest about where", () => {
  const editor = readFileSync(EDITOR_FILE, "utf8");
  const panel = readFileSync(PANEL_FILE, "utf8");

  it("the library mounts the insert panel with the selection's file+line as the suggestion", () => {
    assert.match(editor, /<ElementInsertPanel/);
    assert.match(editor, /elementType=\{selected\.type\}/);
    assert.match(editor, /sourceFocus=\{sourceFocus\}/);
  });

  it("previews before committing, and carries the fingerprint back", () => {
    assert.match(panel, /action: "insert", path: file, code, anchor: anchorPayload\(\), label: definition\?\.label \}\)/);
    assert.match(panel, /fingerprint: preview\.fingerprint,\n        confirm: true,/);
    assert.match(panel, /if \(!preview\) return;/, "commit must be unreachable without a preview");
  });

  it("never claims the site changed — the draft branch did", () => {
    assert.match(panel, /the site itself has not changed/);
    assert.match(panel, /not on the site until the pull request is merged/);
  });

  it("shows the server's refusal sentence verbatim rather than paraphrasing", () => {
    assert.match(panel, /setProblem\(apiResponseError\(payload,/);
    const helper = readFileSync(new URL("../src/lib/client/apiResponseError.ts", import.meta.url), "utf8");
    assert.ok(helper.indexOf("body.message") < helper.indexOf("body.error"), "human access message must beat the machine code");
  });
});
