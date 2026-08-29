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

import { describeFile, isHiddenPath, MAX_EDITABLE_BYTES } from "../src/engines/editor/server/fileTree";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const route = readFileSync(join(ROOT, "src", "app", "api", "portal", "site-editor", "files", "route.ts"), "utf8");
// The working-tree walk moved OUT of the route into a module MAP shares, so the
// two surfaces cannot drift apart about what is hidden. The guards below follow
// it rather than being deleted — see the note on the dot-directory case.
const walk = readFileSync(join(ROOT, "src", "engines", "editor", "server", "workspaceFiles.ts"), "utf8");

describe("editor write path — the guards", () => {
  it("exists as a POST on the files route", () => {
    assert.match(route, /export async function POST\(/);
    assert.match(route, /writeFile\(/, "it actually writes");
  });

  it("is founder + Dev Mode only — stricter than reading", () => {
    // Reading is an agency-role concern; rewriting the repository is not.
    //
    // This used to pin `requireRole(["agency-owner", "agency-manager"])` plus a
    // `devDocsAccessible(session)` call inline. The route now goes through the
    // shared `requireWholeWorkingTreeFounderAccess()`, which is STRICTER on both
    // counts — `agency-manager` is no longer admitted at all, and Dev Mode is an
    // explicit requirement rather than an implication. The old pin reported that
    // tightening as a regression, so assert the guarantee and its source.
    assert.match(route, /await requireWholeWorkingTreeFounderAccess\(\)/,
      "the write path no longer goes through the whole-working-tree founder gate");

    const gate = readFileSync(join(ROOT, "src", "lib", "server", "dev", "devProjectAccess.ts"), "utf8");
    const body = gate.slice(gate.indexOf("export async function requireWholeWorkingTreeFounderAccess"));
    const decl = body.slice(0, body.indexOf("\n}"));
    assert.match(decl, /actor\.user\.role !== "agency-owner"/, "the owner-only rule left the gate");
    assert.match(decl, /!devDocsAccessible\(actor\.session\)/, "the founder rule left the gate");
    assert.match(decl, /!canUseDevMode\(\)/, "Dev Mode is no longer required to rewrite the working tree");
    assert.match(decl, /throw new AccessControlError\(\s*403/, "the gate stopped refusing");
    // The tightening itself, stated so a future widening has to argue with it.
    assert.doesNotMatch(decl, /agency-manager/, "a manager can rewrite the working tree again");
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
    assert.match(route, /sentFingerprint !== fingerprintFor\(requested, current\)/);
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

  // ── The five defects an adversarial review found, each pinned so it
  //    cannot come back silently. Every one of these was live. ──────────────

  it("serialises writes per path, so two saves cannot both win the race", () => {
    // Was: the fingerprint check and the write are two awaits apart, and Next
    // serves concurrent requests in one process — so two saves both read the
    // same contents, both hash-matched, and both wrote. The second destroyed
    // the first and BOTH callers got ok:true.
    assert.match(route, /withWriteLock\(/);
    assert.match(route, /const writeLocks = new Map/);
  });

  it("writes atomically — temp file then rename, never truncate-in-place", () => {
    // Was: writeFile opens with 'w', truncating the original to zero before a
    // byte lands. Any failure (ENOSPC, killed dev server) left it destroyed.
    assert.match(route, /aqua-tmp-/);
    assert.match(route, /await rename\(temporary, target\)/);
    assert.match(route, /unlink\(temporary\)/, "a failed write cleans up after itself");
  });

  it("caps the size of what may be written", () => {
    // Was: only `typeof contents === "string"` — an unbounded body could
    // truncate a real file and then die part-way through replacing it.
    assert.match(route, /MAX_EDITABLE_BYTES/);
    assert.match(route, /status: 413/);
  });

  it("binds the fingerprint to the PATH, not just the contents", () => {
    // Was: content-only hashing answers "does SOME file have this content".
    // This repo has byte-identical files (nine copies of safeDate.ts), so a
    // buffer for one could pass the staleness check against another.
    assert.match(route, /function fingerprintFor\(path: string, contents: string\)/);
    assert.match(route, /fingerprintFor\(requested, current\)/);
    assert.ok(!/!==\s*hashFile\(current\)/.test(route), "must not compare a content-only hash");
  });

  it("resolves symlinks before writing, rather than trusting the lexical path", () => {
    // Was: resolve() normalises `..` but does not follow links, while write
    // does — so a link inside the tree pointing out of it was a hole.
    assert.match(route, /async function realSafePath/);
    assert.match(route, /realpath\(/);
    assert.match(route, /const target = await realSafePath\(requested\)/);
  });

  it("refuses a path containing a null byte", () => {
    assert.match(route, /includes\("\\0"\)/);
  });
});

describe("editor write path — creating files and folders", () => {
  it("creates via an explicit `create` mode, not by writing to a missing path", () => {
    assert.match(route, /body\.create === "file" \|\| body\.create === "folder"/);
    assert.match(route, /mkdir\(created/);
  });

  it("resolves the PARENT for symlink safety, since the target does not exist yet", () => {
    assert.match(route, /realSafePath\(dirname\(requested\)/);
    // …and re-checks the child still lands inside the root.
    assert.match(route, /created\.startsWith\(realRoot \+ sep\)/);
  });

  it("will not create inside a hidden location", () => {
    assert.match(route, /isHiddenPath\(relative\(realRoot, created\)/);
  });

  it("refuses to clobber something that already exists", () => {
    assert.match(route, /Something already exists there/);
    // wx: fail if it appears between the check and the write.
    assert.match(route, /flag: "wx"/);
  });

  it("only creates files the editor could then open", () => {
    assert.match(route, /if \(!describeFile\(requested, 0\)\.editable\)/);
  });
});

describe("editor write path — what the tree exposes at all", () => {
  it("hides live operational state, not just build output", () => {
    // .data/ holds the portal state blob AND worker check-in records that
    // OTHER processes rewrite while this server runs — files whose changes
    // this route's fingerprint can never see.
    for (const path of [".data/workers/api.json", ".data/portal-state.json", ".claude/settings.json"]) {
      assert.equal(isHiddenPath(path), true, `${path} must not be reachable`);
    }
  });

  it("still hides secrets and git internals", () => {
    for (const path of [".env", ".env.local", ".git/config", "node_modules/x/index.js"]) {
      assert.equal(isHiddenPath(path), true, `${path} must not be reachable`);
    }
  });

  it("still shows the env TEMPLATE, which teaches what a site needs", () => {
    assert.equal(isHiddenPath(".env.example"), false);
  });

  it("skips dot-directories unconditionally when walking", () => {
    // Was: a NESTED if that only skipped names already handled by the line
    // above it, so .data/, .claude/ and .next-verify/ were all walked.
    //
    // The walk now lives in `workspaceFiles.ts` because MAP reads the same tree
    // and a second copy would be a second set of rules about what is hidden.
    // Asserted at its new home, not dropped — and `smoke-dev-project-map.test.ts`
    // drives the real walk over a temp directory to prove it behaves, which this
    // source check alone cannot.
    assert.match(walk, /if \(entry\.name\.startsWith\("\."\)\) continue;/);
    assert.match(walk, /entry\.isSymbolicLink\(\)/, "symlinks are not listed as files");
  });

  it("the files route uses that ONE walk rather than keeping a private copy", () => {
    assert.match(route, /readWorkspaceFiles/);
    assert.ok(
      !/async function walk\(/.test(route),
      "a second walk in the route would be a second set of rules about what is hidden",
    );
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
