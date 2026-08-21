import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
  buildFileTree, describeFile, isHiddenPath, treeFiles, MAX_EDITABLE_BYTES,
} from "../src/engines/editor/server/fileTree.ts";

let engine: typeof import("../src/engines/editor/editing/engine");
let code: typeof import("../src/engines/editor/server/codeAdapter");
before(async () => {
  engine = await import("../src/engines/editor/editing/engine");
  code = await import("../src/engines/editor/server/codeAdapter");
});

describe("what the file tree refuses to show", () => {
  // Not a matter of taste. A code editor that happily opens `.env.local` in a
  // browser is a credential leak with a save button.
  it("never lists environment files", () => {
    for (const path of [".env", ".env.local", "apps/web/.env.production"]) {
      assert.ok(isHiddenPath(path), `${path} was listed`);
    }
  });

  it("never lists git internals or vendored trees", () => {
    for (const path of [".git/config", "node_modules/react/index.js", ".next/build.json", ".vercel/output"]) {
      assert.ok(isHiddenPath(path), `${path} was listed`);
    }
  });

  it("does list an env example, which holds no secrets", () => {
    assert.equal(isHiddenPath(".env.example"), false);
  });
});

describe("what can be opened", () => {
  it("opens the file types a site is made of", () => {
    for (const path of ["app/page.tsx", "styles/main.css", "package.json", "README.md", "vercel.yaml"]) {
      assert.ok(describeFile(path).editable, `${path} should open`);
    }
  });

  it("shows an image rather than refusing it", () => {
    // READABLE and EDITABLE are different questions. Answering one "no" used
    // to mean the pane rendered nothing, which is why most of the repository
    // looked invisible.
    const file = describeFile("public/logo.png");
    assert.equal(file.kind, "image");
    assert.equal(file.readable, true, "an image is shown as a preview");
    assert.equal(file.editable, false, "but not edited as characters");
  });

  it("refuses only genuine binaries, and says why rather than hiding them", () => {
    const file = describeFile("public/font.woff2");
    assert.equal(file.kind, "binary");
    assert.equal(file.readable, false);
    assert.match(file.reason ?? "", /not a text file/);
  });

  it("still READS a file too large to edit, rather than showing an empty pane", () => {
    const file = describeFile("data/dump.json", MAX_EDITABLE_BYTES + 1);
    assert.equal(file.readable, true, "a big file is still worth reading");
    assert.equal(file.editable, false, "it just cannot be edited here");
    assert.match(file.reason ?? "", /read-only/);
  });

  it("opens the file types the old web-only list refused", () => {
    // .npmrc, Dockerfile, a Python script and a lockfile all reported "not a
    // text file" and rendered nothing.
    for (const path of [".npmrc", "Dockerfile", "scripts/deploy.py", "pnpm-lock.yaml", ".gitignore"]) {
      assert.equal(describeFile(path).readable, true, `${path} should open`);
    }
  });
});

describe("the tree itself", () => {
  const tree = buildFileTree([
    { path: "app/page.tsx" },
    { path: "app/(site)/about/page.tsx" },
    { path: "components/Hero.tsx" },
    { path: "README.md" },
    { path: ".env.local" },
    { path: "node_modules/react/index.js" },
  ]);

  it("nests directories", () => {
    const app = tree.directories.find(directory => directory.name === "app");
    assert.ok(app);
    assert.ok(app!.directories.some(directory => directory.name === "(site)"));
  });

  it("drops everything hidden", () => {
    const paths = treeFiles(tree).map(file => file.path);
    assert.equal(paths.some(path => path.includes(".env")), false);
    assert.equal(paths.some(path => path.includes("node_modules")), false);
  });

  it("sorts directories and files alphabetically", () => {
    // What every editor does, and therefore the only ordering that will not
    // feel broken.
    const names = tree.directories.map(directory => directory.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  });

  it("keeps every real file", () => {
    assert.equal(treeFiles(tree).length, 4);
  });
});

describe("code mode is the same loop as the visual editor", () => {
  const files = [
    { path: "app/page.tsx", size: 40 },
    { path: "public/logo.png", size: 900 },
  ];
  const contents = new Map([["app/page.tsx", "<main>\n  <h1>Hello</h1>\n</main>"]]);

  function adapter(openPaths: string[] = [], commits: unknown[] = []) {
    return code.codeEditAdapter({
      repository: "milesymedia/site", ref: "main", baseSha: "abc123",
      listFiles: async () => files,
      readFile: async path => contents.get(path) ?? null,
      headSha: async () => "abc123",
      commit: async plan => { commits.push(plan); return { revision: "def456", summary: "Committed" }; },
      openPaths,
    });
  }

  it("lists every file, and marks the ones it cannot open", () => {
    return adapter().map().then(document => {
      assert.equal(document.targets.length, 2);
      const binary = document.targets.find(target => target.id.endsWith(".png"));
      assert.equal(binary?.kind, "indirect");
      // A .png is no longer "refused as binary" — it is previewable, so the
      // reason it carries is now about HOW it opens, not that it cannot.
      assert.match(binary?.definedAt ?? "", /preview|not a text file/);
    });
  });

  it("only reads the files actually opened", async () => {
    // Mapping a repository would otherwise mean fetching every file in it to
    // build a list nobody has looked at yet.
    const unopened = await adapter().map();
    assert.equal(unopened.targets.find(t => t.id === "app/page.tsx")?.value, undefined);
    const opened = await adapter(["app/page.tsx"]).map();
    assert.match(opened.targets.find(t => t.id === "app/page.tsx")?.value ?? "", /Hello/);
  });

  it("edits a whole file and publishes through the shared engine", async () => {
    const commits: unknown[] = [];
    const a = adapter(["app/page.tsx"], commits);
    const document = await a.map();
    const target = document.targets.find(t => t.id === "app/page.tsx")!;

    const dry = await engine.runEdits({
      adapter: a,
      intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "<main>\n  <h1>Changed</h1>\n</main>" }],
    });
    assert.equal(dry.published, false, "code mode must dry-run by default like everything else");
    assert.equal(commits.length, 0);

    const real = await engine.runEdits({
      adapter: a,
      intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "<main>\n  <h1>Changed</h1>\n</main>" }],
      confirm: true,
    });
    assert.equal(real.published, true);
    assert.equal(real.revision, "def456");
  });

  it("refuses a save when the file changed underneath", async () => {
    // The same protection the visual editor has, because it is the same
    // mechanism rather than a second one that resembles it.
    const a = adapter(["app/page.tsx"]);
    const outcome = await engine.runEdits({
      adapter: a,
      intents: [{ targetId: "app/page.tsx", expectedFingerprint: "stale", value: "anything" }],
      confirm: true,
    });
    assert.equal(outcome.published, false);
    assert.equal(outcome.rejected[0].reason, "target-changed");
  });

  it("will not let a binary be written through", async () => {
    const a = adapter();
    const outcome = await engine.runEdits({
      adapter: a,
      intents: [{ targetId: "public/logo.png", expectedFingerprint: "", value: "not really a png" }],
      confirm: true,
    });
    assert.equal(outcome.published, false);
    assert.equal(outcome.rejected[0].reason, "not-editable");
  });
});

describe("reading a repository from GitHub", () => {
  let github: typeof import("../src/engines/editor/server/githubSource");
  before(async () => { github = await import("../src/engines/editor/server/githubSource"); });

  function fakeGitHub(responses: Record<string, unknown>) {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      const match = Object.keys(responses).find(key => String(url).includes(key));
      return { ok: Boolean(match), json: async () => match ? responses[match] : { message: "Not Found" } };
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it("lists the whole repository in one request", async () => {
    // Walking directory by directory would be hundreds of round trips, and the
    // editor would feel broken long before it finished.
    const { calls, fetchImpl } = fakeGitHub({
      "/branches/": { commit: { sha: "abc123" } },
      "/git/trees/": { tree: [
        { path: "app/page.tsx", type: "blob", size: 100 },
        { path: "src", type: "tree" },
        { path: ".env.local", type: "blob", size: 20 },
      ] },
    });
    const head = await github.readRepoTree({ repository: "o/r", ref: "main", token: "t", fetchImpl });
    assert.equal(head.sha, "abc123");
    assert.ok(calls.some(call => call.includes("recursive=1")));
    assert.deepEqual(head.files.map(file => file.path), ["app/page.tsx"], "directories and env files must not be listed");
  });

  it("reports a truncated tree rather than quietly listing half of it", async () => {
    // A silently half-listed repository is worse than an error: the missing
    // file looks like it does not exist.
    const { fetchImpl } = fakeGitHub({
      "/branches/": { commit: { sha: "abc" } },
      "/git/trees/": { truncated: true, tree: [] },
    });
    const head = await github.readRepoTree({ repository: "o/r", ref: "main", token: "t", fetchImpl });
    assert.equal(head.truncated, true);
  });

  it("decodes a file and fingerprints it the way the engine will check it", async () => {
    const { fetchImpl } = fakeGitHub({
      "/contents/": { encoding: "base64", content: Buffer.from("<h1>Hi</h1>").toString("base64"), size: 11 },
    });
    const file = await github.readRepoFile({ repository: "o/r", ref: "main", token: "t", fetchImpl }, "app/page.tsx");
    assert.equal(file.contents, "<h1>Hi</h1>");
    assert.equal(file.fingerprint, code.hashFile("<h1>Hi</h1>"));
  });

  it("refuses an env file even when asked for it directly", async () => {
    // `.env` in a browser with a save button is a credential leak, not a
    // feature — the tree filter is not the only line of defence.
    const { calls, fetchImpl } = fakeGitHub({});
    const file = await github.readRepoFile({ repository: "o/r", ref: "main", token: "t", fetchImpl }, ".env.local");
    assert.equal(file.editable, false);
    assert.equal(calls.length, 0, "it must not even ask GitHub for it");
  });

  it("says what to do when GitHub is not connected", async () => {
    const error = new github.GitHubNotConfigured();
    assert.match(error.message, /Connect GitHub in Company/);
  });
});
