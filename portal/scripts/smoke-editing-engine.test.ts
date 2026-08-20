import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isPublishable, planEdits, runEdits,
  type EditAdapter, type EditDocument, type EditIntent,
} from "../src/engines/editor/editing/engine.ts";

const document = (): EditDocument => ({
  id: "portal:cli_1",
  label: "Cedar Dental portal",
  revision: "rev-1",
  targets: [
    { id: "hero.title", label: "Hero heading", kind: "direct", value: "Welcome", fingerprint: "f1" },
    { id: "hero.count", label: "Client count", kind: "indirect", fingerprint: "f2", definedAt: "the client record" },
    { id: "cta.body", label: "Call to action", kind: "direct", value: "Book now", fingerprint: "f3" },
  ],
});

const plan = (intents: EditIntent[], currentRevision = "rev-1") =>
  planEdits({ document: document(), currentRevision, intents });

describe("the shared editing loop", () => {
  it("accepts a straightforward edit", () => {
    const result = plan([{ targetId: "hero.title", expectedFingerprint: "f1", value: "Hello" }]);
    assert.equal(result.rejected.length, 0);
    assert.deepEqual(result.changes.map(c => [c.before, c.after]), [["Welcome", "Hello"]]);
  });

  it("refuses everything when the document moved underneath", () => {
    // Every fingerprint describes a version that no longer exists, so the
    // other checks would be answering the wrong question rather than failing.
    const result = plan([{ targetId: "hero.title", expectedFingerprint: "f1", value: "Hello" }], "rev-2");
    assert.equal(result.changes.length, 0);
    assert.equal(result.rejected[0].reason, "document-stale");
  });

  it("refuses an edit to something changed while you were typing", () => {
    const result = plan([{ targetId: "hero.title", expectedFingerprint: "stale", value: "Hello" }]);
    assert.equal(result.rejected[0].reason, "target-changed");
    assert.match(result.rejected[0].detail, /changed by someone else/);
  });

  it("sends indirect values to where they are really defined", () => {
    // Editing a value bound to a record appears to work and then reverts on
    // the next render, with no error anywhere.
    const result = plan([{ targetId: "hero.count", expectedFingerprint: "f2", value: "12" }]);
    assert.equal(result.rejected[0].reason, "not-editable");
    assert.match(result.rejected[0].detail, /comes from the client record/);
  });

  it("refuses an edit that changes nothing", () => {
    const result = plan([{ targetId: "hero.title", expectedFingerprint: "f1", value: "Welcome" }]);
    assert.equal(result.rejected[0].reason, "no-change");
  });

  it("keeps both edits when one target is edited twice", () => {
    // The second must be judged against the first, not against the original.
    const result = plan([
      { targetId: "hero.title", expectedFingerprint: "f1", value: "First" },
      { targetId: "hero.title", expectedFingerprint: "First", value: "Second" },
    ]);
    assert.equal(result.rejected.length, 0);
    assert.deepEqual(result.changes.map(c => c.after), ["Second"]);
  });

  it("will not publish a partly-valid set", () => {
    // A portal with half its blocks updated and a website with half its files
    // committed fail the same way: a state nobody chose.
    const result = plan([
      { targetId: "hero.title", expectedFingerprint: "f1", value: "Fine" },
      { targetId: "cta.body", expectedFingerprint: "stale", value: "Doomed" },
    ]);
    assert.equal(isPublishable(result), false);
  });

  it("will not publish an empty set", () => {
    assert.equal(isPublishable(plan([])), false);
  });
});

describe("running the loop against an adapter", () => {
  function adapter(overrides: Partial<EditAdapter> = {}) {
    const published: unknown[] = [];
    const base: EditAdapter = {
      map: async () => document(),
      currentRevision: async () => "rev-1",
      publish: async plan => { published.push(plan); return { revision: "rev-2", summary: "Published" }; },
      ...overrides,
    };
    return { adapter: base, published };
  }

  it("does not publish without an explicit confirmation", async () => {
    const { adapter: a, published } = adapter();
    const outcome = await runEdits({ adapter: a, intents: [{ targetId: "hero.title", expectedFingerprint: "f1", value: "Hello" }] });
    assert.equal(outcome.published, false);
    assert.equal(published.length, 0);
    assert.match(outcome.summary, /^Dry run/);
  });

  it("treats only a real boolean as confirmation", async () => {
    const { adapter: a, published } = adapter();
    const outcome = await runEdits({
      adapter: a,
      intents: [{ targetId: "hero.title", expectedFingerprint: "f1", value: "Hello" }],
      confirm: "true" as unknown as boolean,
    });
    assert.equal(outcome.published, false);
    assert.equal(published.length, 0);
  });

  it("shows the same changes in a dry run as it would publish", async () => {
    // The operator confirms the thing they read, not a summary of it.
    const { adapter: a } = adapter();
    const intents = [{ targetId: "hero.title", expectedFingerprint: "f1", value: "Hello" }];
    const dry = await runEdits({ adapter: a, intents });
    const real = await runEdits({ adapter: a, intents, confirm: true });
    assert.deepEqual(dry.changes, real.changes);
    assert.equal(real.published, true);
    assert.equal(real.revision, "rev-2");
  });

  it("never reaches the adapter when anything was rejected", async () => {
    const { adapter: a, published } = adapter();
    const outcome = await runEdits({
      adapter: a,
      intents: [
        { targetId: "hero.title", expectedFingerprint: "f1", value: "Fine" },
        { targetId: "cta.body", expectedFingerprint: "stale", value: "Doomed" },
      ],
      confirm: true,
    });
    assert.equal(outcome.published, false);
    assert.equal(published.length, 0);
  });
});

describe("website source is just another adapter", () => {
  it("drives the same engine as a portal, with no editing logic of its own", async () => {
    const { sourceEditAdapter } = await import("../src/engines/editor/server/sourceAdapter.ts");
    const { mapFile } = await import("../src/engines/editor/server/registry.ts");
    const nodes = Object.fromEntries(
      mapFile("app/page.tsx", "<main>\n  <h1>We build things</h1>\n  <p>{count} clients</p>\n</main>")
        .map(node => [node.key, node]));
    const registry = {
      repository: "milesymedia/site", ref: "main", commitSha: "abc123", mappedAt: 0,
      files: ["app/page.tsx"], nodes, skipped: [],
    };
    const commits: unknown[] = [];
    const a = sourceEditAdapter({
      registry,
      headSha: async () => "abc123",
      commit: async plan => { commits.push(plan); return { revision: "def456", summary: "Committed" }; },
    });

    const mapped = await a.map();
    const heading = mapped.targets.find(t => t.value?.includes("We build things"));
    const dynamic = mapped.targets.find(t => t.label.endsWith(":3"));
    assert.equal(heading?.kind, "direct", "literal text should be editable in place");
    assert.equal(dynamic?.kind, "indirect", "interpolated text must not be patched as text");

    // Confirms the source case gets conflict checking and dry runs for free.
    const dry = await runEdits({ adapter: a, intents: [{ targetId: heading!.id, expectedFingerprint: heading!.fingerprint, value: "  <h1>We make websites</h1>" }] });
    assert.equal(dry.published, false);
    assert.equal(commits.length, 0);

    const real = await runEdits({ adapter: a, intents: [{ targetId: heading!.id, expectedFingerprint: heading!.fingerprint, value: "  <h1>We make websites</h1>" }], confirm: true });
    assert.equal(real.published, true);
    assert.equal(real.revision, "def456");
  });
});
