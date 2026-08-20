// Dev Console doc EDITS smoke — the write half of the in-app docs surface.
//
// The read half (`readDevDoc`) is well covered in smoke-dev-docs.test.ts:
// traversal, absolute paths, non-markdown, directories, missing files and
// vendor dirs are all pinned there. The write half — the half that can destroy
// work — inherited none of it: nothing in scripts/ imported `devDocEdits`, so
// deleting the root-confinement check would have left the suite green while
// `../../../.ssh/notes.md` became writable.
//
// This file mirrors those read-side cases against `saveDevDoc`, and adds the
// attribution contract: the ledger is keyed by the RESOLVED path, so one file
// cannot end up with two histories under two spellings.
//
// Isolation: `PROJECT_ROOT` is `resolve(process.cwd())` captured when
// `devDocs.ts` loads, and the ledger lives at `<root>/.data/dev-doc-edits.json`.
// `process.chdir(sandbox)` before the module is required therefore redirects
// BOTH the writes and the ledger into a temp tree — the real repo and the real
// `.data/` are never touched. Hence `require`, not `import`: `import` hoists and
// would beat the chdir.

process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import type { SessionPayload } from "../src/server/types";

const require_ = createRequire(import.meta.url);

// ─── sandbox ────────────────────────────────────────────────────────────────

const originalCwd = process.cwd();
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-docedits-"));
const OUTSIDE = mkdtempSync(join(tmpdir(), "aqua-outside-"));

mkdirSync(join(SANDBOX, "docs", "context"), { recursive: true });
mkdirSync(join(SANDBOX, "node_modules", "pkg"), { recursive: true });
writeFileSync(join(SANDBOX, "docs", "a.md"), "# A\n\noriginal a\n", "utf8");
writeFileSync(join(SANDBOX, "docs", "context", "state.md"), "# State\n", "utf8");
writeFileSync(join(SANDBOX, "notes.txt"), "not markdown\n", "utf8");
writeFileSync(join(SANDBOX, "node_modules", "pkg", "README.md"), "# vendor\n", "utf8");
writeFileSync(join(OUTSIDE, "secret.md"), "# secret\n", "utf8");

process.chdir(SANDBOX);

const edits = require_("../src/lib/server/dev/devDocEdits") as typeof import("../src/lib/server/dev/devDocEdits");
const { saveDevDoc, docHistory, recentDocEdits } = edits;

const LEDGER = join(SANDBOX, ".data", "dev-doc-edits.json");
const session = { email: "ed@aquacrm.test", role: "agency-owner" } as unknown as SessionPayload;

const readLedgerRaw = (): { relPath: string; author: string; at: number }[] =>
  existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, "utf8")) as never) : [];

const clearLedger = (): void => {
  if (existsSync(LEDGER)) rmSync(LEDGER);
};

before(() => {
  assert.ok(existsSync(join(SANDBOX, "docs", "a.md")), "sandbox doc must exist");
});

after(() => {
  process.chdir(originalCwd);
  rmSync(SANDBOX, { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
});

// ─── 1. path confinement — the security property ────────────────────────────

describe("saveDevDoc — path confinement", () => {
  it("refuses a traversal escape, and writes nothing outside the project", async () => {
    const target = join(OUTSIDE, "secret.md");
    const beforeBytes = readFileSync(target, "utf8");

    await assert.rejects(
      () => saveDevDoc({ session, relPath: "../../etc/hosts.md", content: "pwned" }),
      /outside the project/,
    );
    // A relative path aimed straight at the sibling temp dir — the shape a
    // hand-edited `?doc=` would take.
    await assert.rejects(
      () => saveDevDoc({ session, relPath: relative(SANDBOX, target), content: "pwned" }),
      /outside the project/,
    );

    assert.equal(readFileSync(target, "utf8"), beforeBytes, "the outside file must be untouched");
    assert.ok(!existsSync(join(SANDBOX, "..", "etc")), "nothing created above the root");
  });

  it("refuses an ABSOLUTE path outside the project", async () => {
    await assert.rejects(
      () => saveDevDoc({ session, relPath: join(OUTSIDE, "secret.md"), content: "pwned" }),
      /outside the project/,
    );
    assert.equal(readFileSync(join(OUTSIDE, "secret.md"), "utf8"), "# secret\n");
  });

  it("refuses anything that is not markdown", async () => {
    await assert.rejects(
      () => saveDevDoc({ session, relPath: "notes.txt", content: "x" }),
      /markdown/,
    );
    await assert.rejects(
      () => saveDevDoc({ session, relPath: "package.json", content: "{}" }),
      /markdown/,
    );
    assert.equal(readFileSync(join(SANDBOX, "notes.txt"), "utf8"), "not markdown\n");
  });

  it("refuses vendor and build directories", async () => {
    for (const rel of [
      "node_modules/pkg/README.md",
      ".next/x.md",
      ".git/x.md",
      "dist/x.md",
      "build/x.md",
      "coverage/x.md",
      "docs/../node_modules/pkg/README.md",
    ]) {
      await assert.rejects(
        () => saveDevDoc({ session, relPath: rel, content: "x" }),
        /not editable/,
        `expected ${rel} to be refused`,
      );
    }
    assert.equal(readFileSync(join(SANDBOX, "node_modules", "pkg", "README.md"), "utf8"), "# vendor\n");
  });

  it("refuses a file that does not exist (this editor never creates docs)", async () => {
    await assert.rejects(
      () => saveDevDoc({ session, relPath: "docs/brand-new.md", content: "x" }),
      /no longer exists/,
    );
    assert.ok(!existsSync(join(SANDBOX, "docs", "brand-new.md")));
  });

  it("refuses content past the size ceiling", async () => {
    await assert.rejects(
      () => saveDevDoc({ session, relPath: "docs/a.md", content: "x".repeat(2_000_001) }),
      /too large/,
    );
    assert.ok(readFileSync(join(SANDBOX, "docs", "a.md"), "utf8").startsWith("# A"));
  });
});

// ─── 2. the optimistic-concurrency guard ────────────────────────────────────

describe("saveDevDoc — worker-edit guard", () => {
  it("refuses to save over a file that moved on disk since it was opened", async () => {
    const abs = join(SANDBOX, "docs", "a.md");
    writeFileSync(abs, "# A\n\nbase\n", "utf8");
    const staleMtime = Date.now() - 60_000;

    await assert.rejects(
      () => saveDevDoc({ session, relPath: "docs/a.md", content: "mine", expectedMtimeMs: staleMtime }),
      /changed on disk/,
    );
    assert.equal(readFileSync(abs, "utf8"), "# A\n\nbase\n", "a worker's edit must survive");
  });

  it("saves when the mtime it was handed still matches", async () => {
    const abs = join(SANDBOX, "docs", "a.md");
    writeFileSync(abs, "# A\n\nbase\n", "utf8");
    const first = await saveDevDoc({ session, relPath: "docs/a.md", content: "# A\n\nround one\n" });
    const second = await saveDevDoc({
      session,
      relPath: "docs/a.md",
      content: "# A\n\nround two\n",
      expectedMtimeMs: first.mtimeMs,
    });
    assert.equal(readFileSync(abs, "utf8"), "# A\n\nround two\n");
    assert.ok(second.sizeBytes > 0);
  });
});

// ─── 3. attribution: ONE file, ONE history ──────────────────────────────────

describe("doc edit ledger — canonical keys", () => {
  it("records the resolved repo-relative path, not the caller's spelling", async () => {
    clearLedger();
    await saveDevDoc({ session, relPath: "./docs/a.md", content: "# A\n\nvia dot slash\n" });
    await saveDevDoc({ session, relPath: "docs/./context/../a.md", content: "# A\n\nvia dot dot\n" });

    const ledger = readLedgerRaw();
    assert.equal(ledger.length, 2);
    for (const entry of ledger) {
      assert.equal(entry.relPath, "docs/a.md", "every spelling must be stored canonically");
    }
  });

  it("one file has ONE history however the path was spelled", async () => {
    clearLedger();
    await saveDevDoc({ session, relPath: "docs/a.md", content: "one\n", authorName: "Ed" });
    await saveDevDoc({ session, relPath: "docs/a.md", content: "two\n", authorName: "Ed" });
    await saveDevDoc({ session, relPath: "./docs/a.md", content: "three\n", authorName: "Ed" });

    const canonical = await docHistory("docs/a.md");
    const dotted = await docHistory("./docs/a.md");

    assert.equal(canonical.edits.length, 3, "all three saves belong to this file");
    assert.equal(
      dotted.edits.length,
      canonical.edits.length,
      "the same file asked for under another spelling must give the same history",
    );
    assert.equal(canonical.mtimeMs, dotted.mtimeMs);
  });

  it("does not mix in another file's edits", async () => {
    clearLedger();
    await saveDevDoc({ session, relPath: "docs/a.md", content: "a\n" });
    await saveDevDoc({ session, relPath: "docs/context/state.md", content: "# State\n\ns\n" });

    assert.equal((await docHistory("docs/a.md")).edits.length, 1);
    assert.equal((await docHistory("docs/context/state.md")).edits.length, 1);
  });

  it("flags a file a worker changed on disk after the last in-app edit", async () => {
    clearLedger();
    const abs = join(SANDBOX, "docs", "a.md");
    await saveDevDoc({ session, relPath: "docs/a.md", content: "mine\n" });
    assert.equal((await docHistory("docs/a.md")).changedOutsideApp, false, "our own save is not an outside change");

    // A worker rewrites it 10 minutes later, straight on disk.
    writeFileSync(abs, "worker wrote this\n", "utf8");
    const future = new Date(Date.now() + 600_000);
    utimesSync(abs, future, future);
    assert.equal((await docHistory("docs/a.md")).changedOutsideApp, true);
  });

  it("history for a file with no ledger entries is empty, not an error", async () => {
    clearLedger();
    const history = await docHistory("docs/context/state.md");
    assert.deepEqual(history.edits, []);
    assert.ok(history.mtimeMs > 0);
  });

  it("recentDocEdits is newest-first and clamps its limit", async () => {
    clearLedger();
    await saveDevDoc({ session, relPath: "docs/a.md", content: "first\n", note: "  why   one  " });
    await saveDevDoc({ session, relPath: "docs/context/state.md", content: "# State\n\nsecond\n" });

    const recent = await recentDocEdits(10);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].relPath, "docs/context/state.md", "newest first");
    assert.equal(recent[1].note, "why one", "the note is collapsed to one line");
    assert.ok(recent[0].at >= recent[1].at);

    assert.ok((await recentDocEdits(0)).length <= 1, "a zero limit clamps to at least 1");
    assert.ok((await recentDocEdits(9999)).length <= 100, "an absurd limit clamps to 100");
  });

  it("attributes the save to the signed-in user", async () => {
    clearLedger();
    await saveDevDoc({ session, relPath: "docs/a.md", content: "x\n", authorName: "Ed Hallam" });
    const [entry] = await recentDocEdits(1);
    assert.equal(entry.author, "Ed Hallam");
    assert.equal(entry.authorEmail, "ed@aquacrm.test");
  });
});
