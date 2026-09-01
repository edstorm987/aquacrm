// There is exactly ONE task list.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// `docs/development.md` used to say, of "where do we stand?": *"Three files
// used to answer this. Two are now archived."* So this consolidation had
// already been done once — and by 2026-08-31 there were two live lists again,
// `checklist.md` and `todo-retired.md`, which had drifted into disagreeing:
//
//   · 130 of ~145 issue ids appeared in BOTH files, worded differently enough
//     that no title matched between them;
//   · 7 issues were marked done in one file while still open in the other.
//
// A list you cannot trust is worse than no list, because it is still consulted.
// Merging them again without a guard would just restart the same cycle, so the
// invariant is pinned here rather than left to discipline.
//
// This test does NOT care how long `TODO.md` is or what is in it. It cares that
// there is one of it, that the retired files stay retired, and that the docs
// which send a reader to a task list send them to that one.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEV = join(ROOT, "docs", "development");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/** A file is a live task list if it carries checkbox rows and is not retired. */
function checkboxRows(source: string): number {
  return (source.match(/^\s*[-*] \[[ x~]\]/gm) ?? []).length;
}
const RETIRED = /^> # ⛔ RETIRED — do not add to this file/m;

describe("one task list", () => {
  it("TODO.md is the list, and it is not empty", () => {
    const todo = read("docs", "development", "TODO.md");
    assert.ok(checkboxRows(todo) > 50, `TODO.md carries only ${checkboxRows(todo)} rows`);
    assert.match(todo, /^# TODO — the one list/m);
    // The merge's own safety property, stated where a reader will see it.
    assert.match(todo, /Nothing was dropped/);
  });

  it("keeps the retired lists retired", () => {
    // They stay on disk for their written reasoning, which TODO.md deliberately
    // does not duplicate — but nothing may be added to them, and the banner is
    // what tells the next session (human or agent) which file to open.
    for (const name of ["checklist.md", "todo-retired.md"]) {
      const source = read("docs", "development", name);
      assert.match(source, RETIRED, `${name} lost its retirement banner`);
      assert.match(source, /The one task list is \[`TODO\.md`\]/, `${name} must name its replacement`);
    }
  });

  it("has no OTHER live checkbox list under docs/development", () => {
    // The actual failure mode: somebody starts `NEXT-STEPS.md` or
    // `remaining-work.md` and within a month it disagrees with TODO.md about
    // what is done. A new list must either be retired-banner'd or be TODO.md.
    const offenders: string[] = [];
    for (const entry of readdirSync(DEV)) {
      if (!entry.endsWith(".md") || entry === "TODO.md") continue;
      const source = readFileSync(join(DEV, entry), "utf8");
      if (RETIRED.test(source)) continue;
      const rows = checkboxRows(source);
      if (rows >= 20) offenders.push(`${entry} (${rows} checkbox rows)`);
    }
    assert.deepEqual(
      offenders,
      [],
      "these files under docs/development read as task lists competing with TODO.md:\n  "
      + offenders.join("\n  ") + "\n"
      + "Merge them into TODO.md, or give them the retirement banner. Two lists always "
      + "drift — that is what this whole file is about.",
    );
  });

  it("sends every reader to the same place", () => {
    // A guard on the list is worthless if the map still points at the old one.
    for (const [label, source] of [
      ["CLAUDE.md", read("CLAUDE.md")],
      ["docs/development.md", read("docs", "development.md")],
    ] as const) {
      assert.doesNotMatch(
        source,
        /\((?:docs\/)?development\/checklist\.md\)|\((?:docs\/)?development\/todo\.md\)/,
        `${label} still links a retired list as somewhere to go`,
      );
      assert.match(source, /development\/TODO\.md|docs\/development\/TODO\.md/, `${label} never names TODO.md`);
    }
  });

  it("does not lose the issue detail that the list only indexes", () => {
    // TODO.md is deliberately one line per item. That is only safe because the
    // evidence, reproduction and reasoning stay in issues.md — so a change that
    // hollowed that out would quietly destroy what the short list depends on.
    const issues = read("docs", "development", "issues.md");
    assert.ok(issues.length > 100_000, `issues.md is ${issues.length} bytes — the detail store looks gutted`);
    assert.match(read("docs", "development", "TODO.md"), /issues\.md/, "TODO.md must point at the detail store");
  });
});
