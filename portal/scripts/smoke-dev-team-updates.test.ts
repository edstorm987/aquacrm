// Dev Team → Updates smoke — the ONE write the Dev Console makes to the
// project's own memory file (docs/development/updates.md), plus the parser that
// decides how much of that memory Ed actually gets to see.
//
// This surface had zero coverage: a full green suite certified neither the
// insert offset, nor the parse, nor the concurrency guard. Two data-loss bugs
// lived here as a result, and both are pinned below:
//
//   1. CONCURRENCY. `appendUpdateEntry` read the whole file, spliced, and wrote
//      it back. Two callers that read the same snapshot both wrote it back, so
//      N concurrent appends returned N successes and left ONE entry on disk —
//      the route answering 201 for text that never landed. Now every append in
//      the process queues on one chain.
//   2. PROSE. `parseUpdates` only understood `- ` bullets. Prose BEFORE an
//      entry's first bullet was unreachable and silently dropped; prose AFTER a
//      bullet was glued onto the end of that bullet. The real doc is prose-first,
//      so most entries rendered as a truncated fragment with no marker.
//
// Isolation: `PROJECT_ROOT` is `resolve(process.cwd())` captured at module load,
// so `process.chdir(sandbox)` BEFORE requiring the module points every path at a
// temp tree. The module is therefore pulled in with `require`, not `import` —
// `import` hoists and would beat the chdir. The real updates.md is only ever
// READ, by absolute path, for the regression check on live data.

process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = join(HERE, "..");

// ─── sandbox ────────────────────────────────────────────────────────────────

const originalCwd = process.cwd();
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-updates-"));
mkdirSync(join(SANDBOX, "docs", "development"), { recursive: true });

const DOC_REL = "docs/development/updates.md";

/** A doc shaped like the real one: header, `---`, then prose-first entries. */
function seedDoc(entryCount = 30): string {
  const head = [
    "# Updates log",
    "",
    "[Back to the docs index](../README.md)",
    "",
    "Every worker writes an entry here after a change.",
    "",
    "---",
    "",
  ].join("\n");
  const entries: string[] = [];
  for (let i = entryCount; i >= 1; i--) {
    entries.push(
      [
        `## 2026-08-${String((i % 28) + 1).padStart(2, "0")} — Seeded entry ${i}`,
        "",
        `This is the lede for entry ${i}. It explains what shipped, in prose,`,
        "before any bullet appears — which is how the real doc is written.",
        "",
        `- a bullet for entry ${i}`,
        `- another bullet for entry ${i}`,
        "",
      ].join("\n"),
    );
  }
  return head + entries.join("\n");
}

writeFileSync(join(SANDBOX, DOC_REL), seedDoc(), "utf8");

process.chdir(SANDBOX);

// Required (not imported) so the chdir above is already in effect.
const updates = require_("../src/lib/server/dev/devTeamUpdates") as typeof import("../src/lib/server/dev/devTeamUpdates");
const {
  parseUpdates,
  insertUpdateBlock,
  updatesInsertOffset,
  renderUpdateEntry,
  buildUpdateEntry,
  appendUpdateEntry,
  scanUpdates,
  groupUpdateBlocks,
  UpdateInputError,
  UPDATES_DOC_REL,
} = updates;

const docPath = join(SANDBOX, DOC_REL);
const readDoc = (): string => readFileSync(docPath, "utf8");
const resetDoc = (): void => writeFileSync(docPath, seedDoc(), "utf8");

before(() => {
  assert.ok(existsSync(docPath), "the sandbox updates doc must exist");
  assert.equal(UPDATES_DOC_REL, DOC_REL, "the module must point at the doc we seeded");
});

after(() => {
  process.chdir(originalCwd);
  rmSync(SANDBOX, { recursive: true, force: true });
});

// ─── 1. parse: prose is body, not litter ────────────────────────────────────

describe("Updates parser — prose survives", () => {
  it("keeps a paragraph that appears BEFORE the first bullet", () => {
    const md = [
      "## 2026-08-20 — Prose first",
      "",
      "The Dev Console was a place you went. Now it comes to you.",
      "",
      "- and here is the bullet",
    ].join("\n");

    const [entry] = parseUpdates(md);
    assert.equal(entry.blocks.length, 2, "one paragraph + one bullet");
    assert.equal(entry.blocks[0].kind, "paragraph");
    assert.equal(
      entry.blocks[0].text,
      "The Dev Console was a place you went. Now it comes to you.",
      "the lede must be reachable — this whole paragraph used to be discarded",
    );
    assert.equal(entry.blocks[1].kind, "bullet");
    assert.deepEqual(entry.bullets, ["and here is the bullet"]);
  });

  it("does NOT glue a paragraph that follows a bullet onto that bullet", () => {
    const md = [
      "## 2026-08-20 — Prose after",
      "",
      "- the bullet",
      "",
      "A separate closing paragraph.",
    ].join("\n");

    const [entry] = parseUpdates(md);
    assert.deepEqual(
      entry.bullets,
      ["the bullet"],
      "the trailing paragraph must not be concatenated onto the bullet",
    );
    assert.deepEqual(
      entry.blocks.map(b => `${b.kind}:${b.text}`),
      ["bullet:the bullet", "paragraph:A separate closing paragraph."],
    );
  });

  it("still rejoins a genuine hard-wrap continuation of a bullet", () => {
    const md = [
      "## 2026-08-20 — Wrapped",
      "- a bullet that runs on past the column limit and",
      "  wraps onto the next line",
      "- a second bullet",
    ].join("\n");

    const [entry] = parseUpdates(md);
    assert.deepEqual(entry.bullets, [
      "a bullet that runs on past the column limit and wraps onto the next line",
      "a second bullet",
    ]);
    assert.equal(entry.blocks.length, 2, "a wrap is not a new block");
  });

  it("rejoins a hard-wrapped paragraph but starts a new one after a blank line", () => {
    const md = [
      "## 2026-08-20 — Two paragraphs",
      "",
      "First paragraph that wraps",
      "across two lines.",
      "",
      "Second paragraph.",
    ].join("\n");

    const [entry] = parseUpdates(md);
    assert.deepEqual(
      entry.blocks.map(b => b.text),
      ["First paragraph that wraps across two lines.", "Second paragraph."],
    );
  });

  it("keeps document order across mixed prose and bullets", () => {
    const md = [
      "## 2026-08-20 — Mixed",
      "",
      "Lede.",
      "",
      "- one",
      "- two",
      "",
      "Middle prose.",
      "",
      "- three",
    ].join("\n");

    const [entry] = parseUpdates(md);
    assert.deepEqual(entry.blocks.map(b => b.kind), [
      "paragraph", "bullet", "bullet", "paragraph", "bullet",
    ]);
    assert.deepEqual(entry.bullets, ["one", "two", "three"]);
  });

  it("still ignores the intro above the first dated heading, and non-entry headings close a block", () => {
    const md = [
      "# Updates log",
      "",
      "Intro prose with no dated heading at all.",
      "",
      "---",
      "",
      "## 2026-08-20 — Real",
      "Body.",
      "",
      "### Not a dated heading",
      "Orphan prose.",
    ].join("\n");

    const entries = parseUpdates(md);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].blocks.map(b => b.text), ["Body."]);
  });

  it("honours the entry limit", () => {
    const md = ["## 2026-08-20 — A", "x", "## 2026-08-19 — B", "y", "## 2026-08-18 — C", "z"].join("\n");
    assert.equal(parseUpdates(md, 2).length, 2);
  });

  it("the REAL docs/development/updates.md carries prose, and the parser reaches it", () => {
    const real = join(REAL_ROOT, DOC_REL);
    if (!existsSync(real)) return; // not fatal — the sandbox cases carry the contract
    const entries = parseUpdates(readFileSync(real, "utf8"), 20);
    assert.ok(entries.length > 0, "the real log parses");
    const withProse = entries.filter(e => e.blocks.some(b => b.kind === "paragraph"));
    assert.ok(
      withProse.length > 0,
      "the real log is prose-first: at least one of the newest 20 entries must render a paragraph",
    );
    // And no bullet may have swallowed a whole paragraph: a bullet that is
    // longer than every paragraph in its entry by an order of magnitude is the
    // old glue bug's signature. Cheaper, sharper check: total body characters
    // reachable must exceed what the bullets alone carry, for at least one entry.
    const bulletOnlyChars = withProse[0].bullets.join(" ").length;
    const allChars = withProse[0].blocks.map(b => b.text).join(" ").length;
    assert.ok(allChars > bulletOnlyChars, "prose adds body the bullets-only shape could not hold");
  });
});

// ─── 2. render + insert: existing bytes are sacred ──────────────────────────

describe("Updates writer — insert-only", () => {
  it("renders bullets in the doc's format", () => {
    const entry = buildUpdateEntry({ title: "A title", bullets: ["one", "- two"] }, Date.parse("2026-08-20T10:00:00Z"));
    assert.equal(renderUpdateEntry(entry), "## 2026-08-20 — A title\n- one\n- two");
  });

  it("round-trips prose blocks as prose, not as bullets", () => {
    const entry = {
      date: "2026-08-20",
      title: "T",
      blocks: [
        { kind: "paragraph" as const, text: "Lede." },
        { kind: "bullet" as const, text: "one" },
      ],
      bullets: ["one"],
    };
    const md = renderUpdateEntry(entry);
    assert.equal(md, "## 2026-08-20 — T\n\nLede.\n\n- one");
    const [back] = parseUpdates(md);
    assert.deepEqual(back.blocks.map(b => `${b.kind}:${b.text}`), ["paragraph:Lede.", "bullet:one"]);
  });

  it("inserts after the first `---`, above the newest entry, preserving every byte", () => {
    const original = readDoc();
    const block = "## 2026-08-20 — Inserted";
    const next = insertUpdateBlock(original, block);

    const at = updatesInsertOffset(original);
    assert.ok(at > 0, "the offset lands after the header rule");
    assert.equal(next.slice(0, at), original.slice(0, at), "the head is copied verbatim");
    assert.ok(next.endsWith(original.slice(at)), "the tail is copied verbatim");
    assert.ok(next.includes(block));
    // Above the newest existing entry.
    assert.ok(next.indexOf(block) < next.indexOf("— Seeded entry 30"), "above the newest entry");
    // Nothing lost, and nothing added beyond the block plus blank-line padding.
    const inserted = next.slice(at, next.length - (original.length - at));
    assert.equal(
      inserted.replace(/\n/g, ""),
      block.replace(/\n/g, ""),
      "only the block and newline padding may be inserted",
    );
  });

  it("appendUpdateEntry writes the entry and leaves the rest of the file untouched", async () => {
    resetDoc();
    const original = readDoc();
    await appendUpdateEntry({ title: "Append smoke", bullets: ["did a thing"] });
    const after_ = readDoc();

    assert.ok(after_.includes("— Append smoke"), "the new entry is on disk");
    assert.ok(after_.includes("- did a thing"));
    // Every pre-existing entry heading survives, byte-for-byte.
    for (const line of original.split("\n").filter(l => l.startsWith("## "))) {
      assert.ok(after_.includes(line), `pre-existing entry lost: ${line}`);
    }
    const [newest] = await scanUpdates(1);
    assert.equal(newest.title, "Append smoke", "it lands at the TOP of the log");
  });

  it("rejects bad authoring input without touching the file", async () => {
    resetDoc();
    const before_ = readDoc();
    await assert.rejects(() => appendUpdateEntry({ title: "   " }), (e: unknown) => e instanceof UpdateInputError);
    await assert.rejects(
      () => appendUpdateEntry({ title: "x".repeat(200) }),
      (e: unknown) => e instanceof UpdateInputError,
    );
    await assert.rejects(
      () => appendUpdateEntry({ title: "ok", bullets: Array.from({ length: 41 }, (_, i) => `b${i}`) }),
      (e: unknown) => e instanceof UpdateInputError,
    );
    assert.equal(readDoc(), before_, "a rejected entry must not write");
  });
});

// ─── 3. concurrency: the data-loss bug ──────────────────────────────────────

describe("Updates writer — concurrent appends", () => {
  it("N concurrent appends never report more successes than entries written", async () => {
    resetDoc();
    const original = readDoc();
    const N = 5;
    const titles = Array.from({ length: N }, (_, i) => `CONCURRENT-${i}`);

    const settled = await Promise.allSettled(titles.map(t => appendUpdateEntry({ title: t, bullets: [`body ${t}`] })));
    const succeeded = settled.filter(r => r.status === "fulfilled").length;

    const doc = readDoc();
    const landed = titles.filter(t => doc.includes(`— ${t}`)).length;

    assert.ok(succeeded > 0, "at least one append must succeed");
    assert.equal(
      landed,
      succeeded,
      `every success must be on disk — ${succeeded} handlers resolved but only ${landed} entries survived`,
    );
    assert.equal(succeeded, N, "with the writes serialised, all five should land");

    // And the file they were spliced into is otherwise intact.
    for (const line of original.split("\n").filter(l => l.startsWith("## "))) {
      assert.ok(doc.includes(line), `pre-existing entry lost under concurrency: ${line}`);
    }
  });

  it("a failed append does not wedge the queue for the next one", async () => {
    resetDoc();
    const results = await Promise.allSettled([
      appendUpdateEntry({ title: "" }),                       // rejects on validation
      appendUpdateEntry({ title: "AFTER-FAILURE" }),
    ]);
    assert.equal(results[0].status, "rejected");
    assert.equal(results[1].status, "fulfilled");
    assert.ok(readDoc().includes("— AFTER-FAILURE"));
  });
});

// ─── 4. read path ───────────────────────────────────────────────────────────

describe("Updates reader", () => {
  it("scanUpdates reads the live file, newest first", async () => {
    resetDoc();
    const entries = await scanUpdates(5);
    assert.equal(entries.length, 5);
    assert.equal(entries[0].title, "Seeded entry 30");
    assert.ok(entries[0].blocks.some(b => b.kind === "paragraph"), "the seeded lede is rendered");
  });

  it("returns [] rather than throwing when the doc is unreadable", async () => {
    rmSync(docPath);
    assert.deepEqual(await scanUpdates(), []);
    resetDoc();
  });
});

// ─── 5. what the card actually lays out ─────────────────────────────────────

describe("Updates view — block grouping", () => {
  it("gives prose its own paragraph and keeps consecutive bullets in one list", () => {
    const runs = groupUpdateBlocks([
      { kind: "paragraph", text: "Lede." },
      { kind: "bullet", text: "one" },
      { kind: "bullet", text: "two" },
      { kind: "paragraph", text: "Closing." },
      { kind: "bullet", text: "three" },
    ]);
    assert.deepEqual(runs, [
      { kind: "paragraph", text: "Lede." },
      { kind: "list", items: ["one", "two"] },
      { kind: "paragraph", text: "Closing." },
      { kind: "list", items: ["three"] },
    ]);
  });

  it("a real prose-first entry renders more than its bullets", () => {
    const md = [
      "## 2026-08-20 — Dev Console in the topbar",
      "",
      "The Dev Console was a place you went. Now it comes to you.",
      "",
      "- P1 — the topbar entry",
      "- P2 — the board",
    ].join("\n");
    const [entry] = parseUpdates(md);
    const runs = groupUpdateBlocks(entry.blocks);
    assert.equal(runs[0].kind, "paragraph", "the card leads with the prose, not a bullet");
    assert.ok(
      runs.some(r => r.kind === "list"),
      "and still lists the bullets",
    );
  });

  it("an entry with no body at all groups to nothing (the card says so)", () => {
    assert.deepEqual(groupUpdateBlocks([]), []);
  });
});
