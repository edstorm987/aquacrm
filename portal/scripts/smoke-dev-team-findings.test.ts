// Findings — the INPUT side of the Dev Console.
//
// Everything here runs against the REAL module, writing to a throwaway project
// root. `PROJECT_ROOT` is `resolve(process.cwd())` evaluated when devDocs is
// first imported, so chdir-ing into a temp directory BEFORE the first dynamic
// import gives this file its own docs/development/{findings,plans} tree. No dev
// server, no session, no shared state — and nothing here can touch the repo's
// own findings.
//
// The point of these tests is that they are about OBSERVABLE RESULTS: what
// comes back out of a finding after a round-trip through the markdown, what is
// on disk after a failure, what a generated plan actually contains. The surface
// previously had only source-shape coverage, and every bug below survived it.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- own project root, claimed before anything reads process.cwd() ----------
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-findings-"));
mkdirSync(join(SANDBOX, "docs", "development", "findings"), { recursive: true });
mkdirSync(join(SANDBOX, "docs", "development", "plans"), { recursive: true });
process.chdir(SANDBOX);

const FINDINGS_DIR = join(SANDBOX, "docs", "development", "findings");
const IMAGES_DIR = join(FINDINGS_DIR, "images");

type FindingsModule = typeof import("../src/lib/server/dev/devTeamFindings");
let findings: FindingsModule;

// A 1x1 png and a deliberately oversized payload (> the 6MB cap).
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const HUGE_PNG = `data:image/png;base64,${"A".repeat(9_000_000)}`;

before(async () => {
  findings = await import("../src/lib/server/dev/devTeamFindings");
  assert.equal((await findings.listFindings()).length, 0, "the sandbox must start empty");
});

describe("capture keeps what the founder typed", () => {
  it("a multi-line note survives the round-trip to markdown and back", async () => {
    const note = "Expected: badge shows 7\nActual: badge shows 0\nRepro: open /portal/agency, block a client";
    const created = await findings.createFinding({
      title: "Battle Table badge shows 0",
      note,
      now: Date.parse("2026-08-20T10:00:00Z"),
    });
    assert.equal(created.note, note, "createFinding flattened the note");

    const reread = await findings.getFinding(created.slug);
    assert.ok(reread);
    assert.equal(reread.note, note, "the note came back as one paragraph");
    assert.equal(reread.note.split("\n").length, 3, "three typed lines must still be three lines");
  });

  it("a note containing a heading or a horizontal rule is not truncated", async () => {
    const note = "Line one\nLine two\n---\n## Heading\nLine three";
    const created = await findings.createFinding({
      title: "Note with markdown structure",
      note,
      now: Date.parse("2026-08-20T10:01:00Z"),
    });
    const reread = await findings.getFinding(created.slug);
    assert.ok(reread);
    assert.equal(reread.note, note, "the note was cut at its own heading/rule");
    // And re-rendering it (what updateFinding does) must not drift.
    const planned = await findings.updateFinding(created.slug, { status: "fixed" });
    assert.equal(planned?.note, note, "a second render lost part of the note");
    assert.equal((await findings.getFinding(created.slug))?.note, note);
  });

  it("a `where` containing a backtick or a '·' is kept, not truncated on re-parse", async () => {
    const created = await findings.createFinding({
      title: "Where field with punctuation",
      note: "n/a",
      where: "the `Save` button on /portal/agency · Radar tab",
      now: Date.parse("2026-08-20T10:02:00Z"),
    });
    // Backticks are stripped (the field is rendered inside a code span) but the
    // words and the '·' survive — the old parser returned just "the".
    assert.match(created.where ?? "", /Save button on \/portal\/agency · Radar tab/);

    const reread = await findings.getFinding(created.slug);
    assert.equal(reread?.where, created.where, "listing a finding truncated its `where`");

    // The damage used to become PERMANENT here: updateFinding re-renders from
    // the parsed value, so a truncated read was written back to disk.
    await findings.updateFinding(created.slug, { status: "planned" });
    const afterWrite = await findings.getFinding(created.slug);
    assert.equal(afterWrite?.where, created.where, "the truncated `where` was persisted");
    assert.equal(afterWrite?.status, "planned");
  });

  it("severity, images and status all round-trip", async () => {
    const created = await findings.createFinding({
      title: "Round trip everything",
      note: "note",
      where: "/portal/dev-team/findings",
      severity: "blocker",
      images: [TINY_PNG, TINY_PNG],
      now: Date.parse("2026-08-20T10:03:00Z"),
    });
    assert.equal(created.images.length, 2);
    const reread = await findings.getFinding(created.slug);
    assert.deepEqual(reread?.images, created.images);
    assert.equal(reread?.severity, "blocker");
    assert.equal(reread?.status, "open");
    assert.equal(reread?.title, created.title);
  });
});

describe("screenshots", () => {
  it("an oversize image leaves no orphan behind", async () => {
    const before = await readdir(IMAGES_DIR).catch(() => [] as string[]);
    await assert.rejects(
      () => findings.createFinding({
        title: "Oversize test",
        note: "one good image, one enormous one",
        images: [TINY_PNG, HUGE_PNG],
        now: Date.parse("2026-08-20T10:04:00Z"),
      }),
      /too large/i,
    );
    const after = await readdir(IMAGES_DIR).catch(() => [] as string[]);
    assert.deepEqual(after, before, "the first image was written and then abandoned");
    assert.equal(await findings.getFinding("2026-08-20-oversize-test"), null, "no finding should exist either");
  });

  it("the image reader refuses to leave the images directory", async () => {
    const created = await findings.createFinding({
      title: "Image confinement",
      note: "n/a",
      images: [TINY_PNG],
      now: Date.parse("2026-08-20T10:05:00Z"),
    });
    const good = await findings.readFindingImage(created.images[0]);
    assert.ok(Buffer.isBuffer(good) && good.byteLength > 0, "a real screenshot must be readable");

    for (const payload of [
      "../../../package.json",
      "..%2f..%2fpackage.json",
      "/etc/passwd",
      "....//....//package.json",
      "",
    ]) {
      assert.equal(await findings.readFindingImage(payload), null, `traversal payload leaked: ${payload}`);
    }
  });
});

describe("turning findings into a plan", () => {
  it("planning two different pairs of findings both succeed", async () => {
    const made = [];
    for (let i = 0; i < 4; i += 1) {
      made.push(await findings.createFinding({
        title: `Batch finding ${i + 1}`,
        note: `note ${i + 1}`,
        now: Date.parse("2026-08-20T11:00:00Z") + i * 60_000,
      }));
    }
    const now = Date.parse("2026-08-20T12:00:00Z");
    const first = await findings.planFromFindings([made[0], made[1]], { now });
    // The SAME shape again — this is the case that used to hard-fail with
    // 'a plan called "fix-2-findings.md" already exists. Pick a different title.'
    const second = await findings.planFromFindings([made[2], made[3]], { now });

    assert.notEqual(first.plan.relPath, second.plan.relPath, "the second plan reused the first plan's filename");
    for (const result of [first, second]) {
      const md = await readFile(result.plan.absPath, "utf8");
      assert.match(md, /^# Plan — /m);
      for (const f of result.findings) {
        assert.ok(md.includes(`(../findings/${f.slug}.md)`), `${f.slug} is missing from the plan it fed`);
        assert.equal(f.status, "planned");
        assert.equal(f.planRelPath, result.plan.relPath);
      }
    }
  });

  it("two findings with the same title can each become a plan", async () => {
    const a = await findings.createFinding({ title: "Repeat title", note: "first sighting", now: Date.parse("2026-08-20T13:00:00Z") });
    const b = await findings.createFinding({ title: "Repeat title", note: "second sighting", now: Date.parse("2026-08-20T13:01:00Z") });
    assert.notEqual(a.slug, b.slug, "same-day duplicates must get their own file");

    const planA = await findings.planFromFindings([a], { now: Date.parse("2026-08-20T13:02:00Z") });
    const planB = await findings.planFromFindings([b], { now: Date.parse("2026-08-20T13:03:00Z") });
    assert.notEqual(planA.plan.relPath, planB.plan.relPath, "the second single finding could not be planned");
  });

  it("a long note never costs another finding its place in the plan", async () => {
    const wordy = await findings.createFinding({
      title: "Wordy finding",
      note: "x".repeat(2099),
      where: "/portal/agency",
      now: Date.parse("2026-08-20T14:00:00Z"),
    });
    const quiet = await findings.createFinding({
      title: "Quiet finding with a screenshot",
      note: "short",
      images: [TINY_PNG],
      now: Date.parse("2026-08-20T14:01:00Z"),
    });

    const result = await findings.planFromFindings([wordy, quiet], { now: Date.parse("2026-08-20T14:02:00Z") });
    const md = await readFile(result.plan.absPath, "utf8");

    // The second finding used to be cut off entirely by the 2000-char notes cap
    // while still being marked "planned".
    assert.ok(md.includes(`(../findings/${quiet.slug}.md)`), "the second finding vanished from the plan");
    assert.ok(md.includes(`(../findings/${wordy.slug}.md)`), "the first finding lost its own source link");
    assert.match(md, /Quiet finding with a screenshot/);
    assert.ok(md.includes(`images/${quiet.images[0]}`), "the screenshot reference did not reach the worker");
    // ...and the heading of the evidence block must not swallow the list.
    assert.doesNotMatch(md, /## Findings this plan came from/);

    for (const slug of [wordy.slug, quiet.slug]) {
      assert.equal((await findings.getFinding(slug))?.status, "planned");
    }
  });

  it("findings that could not fit stay OPEN and the caller is told", async () => {
    const many = [];
    for (let i = 0; i < 24; i += 1) {
      many.push(await findings.createFinding({
        title: `Overflow finding number ${i + 1} with a deliberately long title`,
        note: "n".repeat(300),
        where: "/portal/dev-team/findings",
        now: Date.parse("2026-08-20T15:00:00Z") + i * 60_000,
      }));
    }
    await assert.rejects(
      () => findings.planFromFindings(many, { now: Date.parse("2026-08-20T16:00:00Z") }),
      /still open/i,
    );
    for (const f of many) {
      assert.equal((await findings.getFinding(f.slug))?.status, "open", `${f.slug} left the open list without reaching a plan`);
    }
  });

  it("the plan title is unique per batch by default", () => {
    const stub = (slug: string, title: string) => ({
      slug, relPath: `docs/development/findings/${slug}.md`, title,
      note: "", severity: "bug" as const, status: "open" as const, images: [], createdAt: 0,
    });
    const now = Date.parse("2026-08-20T09:00:00Z");
    const two = findings.defaultPlanTitle([stub("a", "A"), stub("b", "B")], now);
    assert.notEqual(two, "Fix 2 findings", "the default multi-finding title is still a fixed string");
    assert.match(two, /Fix 2 findings/);
    assert.equal(findings.defaultPlanTitle([stub("a", "Only one")], now), "Only one");
  });
});

describe("closing the loop", () => {
  it("a finding can be marked fixed and reopened", async () => {
    const created = await findings.createFinding({
      title: "Loop closer",
      note: "n/a",
      now: Date.parse("2026-08-20T17:00:00Z"),
    });
    assert.equal(created.status, "open");
    assert.equal((await findings.updateFinding(created.slug, { status: "fixed" }))?.status, "fixed");
    assert.equal((await findings.getFinding(created.slug))?.status, "fixed");
    assert.equal((await findings.updateFinding(created.slug, { status: "open" }))?.status, "open");
    assert.equal(await findings.updateFinding("no-such-finding", { status: "fixed" }), null);
  });

  it("the workspace actually sends a status change — the route side was never called", () => {
    const workspace = readFileSync(join(REPO, "src/app/portal/dev-team/findings/_FindingsWorkspace.tsx"), "utf8");
    assert.match(workspace, /action:\s*"status"/, "no UI posts action:\"status\", so nothing can ever be marked fixed");
    assert.match(workspace, /Mark fixed/, "there is no control to close a finding");
    const route = readFileSync(join(REPO, "src/app/api/portal/dev-team/findings/route.ts"), "utf8");
    assert.match(route, /body\.action === "status"/, "the route stopped handling the status action");
  });
});
