import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import { hashLine, mapFile, type SiteRegistry } from "../src/lib/server/siteEditor/registry.ts";

const FILE = "app/page.tsx";
const SOURCE = ["<main>", "  <h1>We build things</h1>", "  <p>Get in touch</p>", "</main>"].join("\n");

function registryFor(commitSha = "abc123"): SiteRegistry {
  return {
    repository: "milesymedia/site", ref: "main", commitSha, mappedAt: 0,
    files: [FILE],
    nodes: Object.fromEntries(mapFile(FILE, SOURCE).map(node => [node.key, node])),
    skipped: [],
  };
}

const lineHash = (line: number) => hashLine(SOURCE.split("\n")[line - 1]);

let patchMod: typeof import("../src/lib/server/siteEditor/patch");
let publishMod: typeof import("../src/lib/server/siteEditor/publish");
before(async () => {
  patchMod = await import("../src/lib/server/siteEditor/patch");
  publishMod = await import("../src/lib/server/siteEditor/publish");
});

describe("applying an edit", () => {
  const base = () => ({ registry: registryFor(), headSha: "abc123", contents: SOURCE });

  it("replaces the line", () => {
    const result = patchMod.applyPatch({
      ...base(),
      patch: { file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>We make websites</h1>" },
    });
    assert.ok(result.ok);
    assert.match(result.file.contents, /We make websites/);
    assert.doesNotMatch(result.file.contents, /We build things/);
  });

  it("refuses when the line changed since it was mapped", () => {
    // Rejecting loses this edit, which is recoverable. Applying it loses
    // somebody else's silently, which is not — and the build still succeeds,
    // so nothing anywhere reports it.
    const result = patchMod.applyPatch({
      ...base(),
      patch: { file: FILE, line: 2, expectedHash: hashLine("something else"), newLine: "  <h1>New</h1>" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.rejection.reason, "line-changed");
  });

  it("refuses when the whole site moved on", () => {
    const result = patchMod.applyPatch({
      registry: registryFor("abc123"), headSha: "def456", contents: SOURCE,
      patch: { file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>New</h1>" },
    });
    assert.equal(result.ok === false && result.rejection.reason, "registry-stale");
  });

  it("checks staleness before anything else", () => {
    // Every other check reads the registry, so a stale one makes them
    // meaningless rather than merely wrong.
    const result = patchMod.applyPatch({
      registry: registryFor("abc123"), headSha: "def456", contents: SOURCE,
      patch: { file: "not/mapped.tsx", line: 99, expectedHash: "nope", newLine: "x" },
    });
    assert.equal(result.ok === false && result.rejection.reason, "registry-stale");
  });

  it("refuses a file that is not part of the mapped site", () => {
    const result = patchMod.applyPatch({
      ...base(),
      patch: { file: "app/secret.tsx", line: 1, expectedHash: lineHash(1), newLine: "x" },
    });
    assert.equal(result.ok === false && result.rejection.reason, "unknown-file");
  });

  it("refuses a line that does not exist", () => {
    const result = patchMod.applyPatch({
      ...base(),
      patch: { file: FILE, line: 99, expectedHash: lineHash(1), newLine: "x" },
    });
    assert.equal(result.ok === false && result.rejection.reason, "line-missing");
  });

  it("refuses an edit that changes nothing", () => {
    const result = patchMod.applyPatch({
      ...base(),
      patch: { file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>We build things</h1>" },
    });
    assert.equal(result.ok === false && result.rejection.reason, "no-change");
  });

  it("says specifically what was wrong", () => {
    // "Something went wrong" leaves the operator guessing whether to retry,
    // re-map or give up — three very different actions.
    const result = patchMod.applyPatch({
      ...base(),
      patch: { file: FILE, line: 2, expectedHash: "stale", newLine: "  <h1>New</h1>" },
    });
    assert.match(result.ok === false ? result.rejection.detail : "", /app\/page\.tsx:2 has changed/);
  });
});

describe("planning several edits together", () => {
  const plan = (patches: Parameters<typeof patchMod.planPatches>[0]["patches"]) =>
    patchMod.planPatches({
      registry: registryFor(), headSha: "abc123", patches,
      read: file => file === FILE ? SOURCE : null,
    });

  it("keeps both edits when two touch one file", () => {
    // Later patches must see earlier ones, or the second silently overwrites
    // the first and the operator sees only one of their changes land.
    const result = plan([
      { file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>One</h1>" },
      { file: FILE, line: 3, expectedHash: lineHash(3), newLine: "  <p>Two</p>" },
    ]);
    assert.equal(result.rejected.length, 0);
    assert.equal(result.files.length, 1);
    assert.match(result.files[0].contents, /One/);
    assert.match(result.files[0].contents, /Two/);
  });

  it("carries every rejection through rather than summarising them away", () => {
    const result = plan([
      { file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>Fine</h1>" },
      { file: FILE, line: 3, expectedHash: "stale", newLine: "  <p>Doomed</p>" },
    ]);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].rejection.reason, "line-changed");
  });
});

describe("publishing", () => {
  const target = { repository: "milesymedia/site", baseBranch: "main", baseSha: "abc123" };
  const goodPlan = () => patchMod.planPatches({
    registry: registryFor(), headSha: "abc123",
    patches: [{ file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>New</h1>" }],
    read: () => SOURCE,
  });

  function recordingFetch() {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET" });
      return { ok: true, json: async () => ({ sha: "newsha0000000", object: { sha: "abc123" } }) };
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it("does nothing at all without an explicit confirmation", async () => {
    // The cost of an accidental write is a commit on a live client website.
    const { calls, fetchImpl } = recordingFetch();
    const outcome = await publishMod.publishEdits({
      target, plan: goodPlan(), message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl,
    });
    assert.equal(outcome.published, false);
    assert.equal(calls.length, 0, "a dry run must not touch GitHub");
    assert.match(outcome.summary, /^Dry run/);
  });

  it("still shows exactly what would change", async () => {
    // The operator confirms the thing they actually read, rather than
    // approving a summary and getting something else.
    const { fetchImpl } = recordingFetch();
    const outcome = await publishMod.publishEdits({
      target, plan: goodPlan(), message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl,
    });
    assert.deepEqual(outcome.files, [{
      file: FILE, line: 2, before: "  <h1>We build things</h1>", after: "  <h1>New</h1>",
    }]);
  });

  it("treats only a real boolean as confirmation", async () => {
    // A stray "true" from a query string must not be able to publish.
    const { calls, fetchImpl } = recordingFetch();
    const outcome = await publishMod.publishEdits({
      target, plan: goodPlan(), message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl,
      confirm: "true" as unknown as boolean,
    });
    assert.equal(outcome.published, false);
    assert.equal(calls.length, 0);
  });

  it("refuses the whole set when any edit was rejected", async () => {
    // Half of a change spanning a component and its page is a broken website,
    // discovered by a visitor rather than by us.
    const mixed = patchMod.planPatches({
      registry: registryFor(), headSha: "abc123",
      patches: [
        { file: FILE, line: 2, expectedHash: lineHash(2), newLine: "  <h1>Fine</h1>" },
        { file: FILE, line: 3, expectedHash: "stale", newLine: "  <p>Doomed</p>" },
      ],
      read: () => SOURCE,
    });
    const { calls, fetchImpl } = recordingFetch();
    const outcome = await publishMod.publishEdits({
      target, plan: mixed, message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl, confirm: true,
    });
    assert.equal(outcome.published, false);
    assert.equal(calls.length, 0);
    assert.match(outcome.summary, /Not published/);
  });

  it("commits to a branch, never to the default branch", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const outcome = await publishMod.publishEdits({
      target, plan: goodPlan(), message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl, confirm: true,
    });
    assert.equal(outcome.published, true);
    assert.ok(calls.some(call => call.url.includes("/git/refs/heads/aqua/edit-1") && call.method === "PATCH"));
    assert.ok(!calls.some(call => call.url.includes("heads/main") && call.method === "PATCH"),
      "the default branch must never be written to");
  });

  it("lands every file in one commit", async () => {
    const { calls, fetchImpl } = recordingFetch();
    await publishMod.publishEdits({
      target, plan: goodPlan(), message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl, confirm: true,
    });
    assert.equal(calls.filter(call => call.url.includes("/git/commits")).length, 1);
  });

  it("never rewrites history", async () => {
    // History that can be rewritten is history nobody can trust — and this
    // runs on repositories Ed did not necessarily make.
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
      if (typeof init.body === "string") bodies.push(init.body);
      return { ok: true, json: async () => ({ sha: "newsha", object: { sha: "abc123" } }) };
    }) as unknown as typeof fetch;
    await publishMod.publishEdits({
      target, plan: goodPlan(), message: "Edit", branch: "aqua/edit-1", token: "t", fetchImpl, confirm: true,
    });
    assert.ok(bodies.some(body => body.includes('"force":false')));
    assert.ok(!bodies.some(body => body.includes('"force":true')));
  });
});
