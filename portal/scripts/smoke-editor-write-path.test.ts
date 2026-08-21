// DEV EDITOR — the write path.
//
// This is the one genuinely destructive thing the editor can do, and this tree
// carries uncommitted work from several places at once. So the guards are
// pinned here rather than trusted: losing somebody's unsaved work is not
// recoverable, and a regression that removes one of these would be silent.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describeFile, MAX_EDITABLE_BYTES } from "../src/engines/editor/server/fileTree";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const route = readFileSync(join(ROOT, "src", "app", "api", "portal", "site-editor", "files", "route.ts"), "utf8");

describe("editor write path — the guards", () => {
  it("exists as a POST on the files route", () => {
    assert.match(route, /export async function POST\(/);
    assert.match(route, /writeFile\(/, "it actually writes");
  });

  it("is founder + Dev Mode only — stricter than reading", () => {
    // Reading is an agency-role concern; rewriting the repository is not.
    assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(route, /devDocsAccessible\(session\)/);
  });

  it("checks the request origin, like every other mutating portal route", () => {
    assert.match(route, /headers\.get\("origin"\)/);
  });

  it("confines the target to ROOT rather than pattern-matching for ..", () => {
    assert.match(route, /safePath\(requested\)/);
  });

  it("REFUSES a save whose fingerprint no longer matches the file on disk", () => {
    // The single most important guard: this working tree holds uncommitted
    // work, and a last-write-wins editor would destroy it.
    assert.match(route, /staleFingerprint: true/);
    assert.match(route, /body\.fingerprint !== hashFile\(current\)/);
  });

  it("refuses to write anything the reader does not call editable", () => {
    assert.match(route, /if \(!described\.editable\)/);
  });

  it("does not write to disk for a repository-backed project", () => {
    // Those changes are committed and published, not written to this server.
    assert.match(route, /project\?\.repository/);
  });

  it("says so plainly when the filesystem is read-only", () => {
    // On a read-only deployment this is expected, not a crash.
    assert.match(route, /readOnlyFilesystem: true/);
    assert.match(route, /EROFS/);
  });
});

describe("editor write path — what may be edited", () => {
  it("allows ordinary source files", () => {
    for (const path of ["src/app/page.tsx", "docs/notes.md", "vercel.json", ".npmrc"]) {
      assert.equal(describeFile(path, 1_000).editable, true, `${path} should be editable`);
    }
  });

  it("does not allow editing an image or a binary", () => {
    assert.equal(describeFile("public/logo.png", 1_000).editable, false);
    assert.equal(describeFile("public/font.woff2", 1_000).editable, false);
  });

  it("does not allow editing something too large, but still reads it", () => {
    const big = describeFile("data/dump.json", MAX_EDITABLE_BYTES + 1);
    assert.equal(big.editable, false);
    assert.equal(big.readable, true);
  });
});
