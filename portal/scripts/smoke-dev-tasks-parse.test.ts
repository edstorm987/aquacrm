import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// The Tasks view and the roadmap percentage are both read straight out of the
// plans — "computed from those tasks, never typed", as the roadmap page tells
// Ed. That promise only holds if the parser reads the plans the way a person
// does. These pin the three ways it did not.

async function plans(): Promise<{ name: string; md: string }[]> {
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");
  const dir = join(PROJECT_ROOT, "docs/development/plans");
  const names = (await readdir(dir)).filter(n => n.toLowerCase().endsWith(".md")).sort();
  return Promise.all(names.map(async name => ({
    name: name.replace(/\.md$/i, ""),
    md: await readFile(join(dir, name), "utf8"),
  })));
}

async function taskById(id: string) {
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");
  for (const plan of await scanTasks()) {
    const found = plan.tasks.find(t => t.id === id);
    if (found) return found;
  }
  return undefined;
}

// ---- "done" is a marker a phase writes, not a word in its prose ------------

test("a word inside the body never marks a live phase done", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    "1. **Toggle + owner→dev entry.** Add a toggle row — built the same way those toggles are.",
    "2. **Absorb Docs.** Move the built Dev Docs browser into the hub as the Docs section.",
    "3. **Hook contract.** `onEraseClient` on the manifest (`built-ins/runtime/_types.ts`).",
    "4. ✅ **Actually shipped.** This one really is finished.",
  ].join("\n");
  const phases = parsePhases(md);
  assert.deepEqual(phases.map(p => p.marker), [undefined, undefined, undefined, "done"]);
});

test("a BLOCKED phase can never read as done, whatever else the paragraph says", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    "1. ⛔ **Cohere** — BLOCKED on Ed: consolidate the 12 views. Also built (2026-08-19) the routing.",
    "2. ⚠ **Customer intelligence** — MOSTLY ALREADY DONE, by the KPI worker's Phase 7.",
  ].join("\n");
  assert.deepEqual(parsePhases(md).map(p => p.marker), ["blocked", "blocked"]);
});

test("the three real plans that rendered as finished are not finished", async () => {
  // Each of these was struck through and greyed in the Tasks view, and each
  // counted towards its plan's progress bar and the roadmap percentage.
  for (const id of ["dev-mode-demo-profiles#1", "dev-team-hub#3", "dev-team-finish#1"]) {
    const task = await taskById(id);
    assert.ok(task, `${id} should still exist`);
    assert.notEqual(task.state, "done", `${id} is not done — a word in its body said so`);
  }
  const blocked = await taskById("marketing-workspace-overhaul#6");
  assert.ok(blocked, "marketing-workspace-overhaul#6 should still exist");
  assert.match(blocked.detail ?? "", /BLOCKED on Ed/i);
  assert.notEqual(blocked.state, "done", "the one task blocked ON ED must never read as finished");
});

test("phases that really did ship are still counted", async () => {
  for (const id of ["client-health#1", "client-health#4", "plugin-data-erasure#5", "radar-upgrade#7"]) {
    const task = await taskById(id);
    assert.ok(task, `${id} should exist`);
    assert.equal(task.state, "done", `${id} is marked shipped in its plan`);
  }
});

// ---- every plan that has phases must produce them ---------------------------

test("a `## Phasing` section is a phases section", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "# Plan — Radar",
    "## Phasing (incremental, non-breaking)",
    "1. ✅ **Scheduler layer** *(shipped 2026-08-19)* — the typed sweep taxonomy.",
    "2. ✅ **Classification metadata** *(shipped 2026-08-19)* — the two axes.",
    "## Open questions",
    "1. Not a phase.",
  ].join("\n");
  assert.deepEqual(parsePhases(md).map(p => p.number), ["1", "2"]);
  assert.deepEqual(parsePhases(md).map(p => p.title), ["Scheduler layer", "Classification metadata"]);
});

test("`**Phase N — Title:**` paragraphs are phases too", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    "**Phase 0 — Spine (I own, serial):** new `dev-team/` scope + `layout.tsx`.",
    "",
    "**Phase 1 — Section islands (parallel agents):**",
    "- **Library** — thin wrapper.",
    "",
    "## Done when",
    "Owner flips Dev Mode.",
  ].join("\n");
  assert.deepEqual(parsePhases(md).map(p => p.number), ["0", "1"]);
  assert.deepEqual(parsePhases(md).map(p => p.title), ["Spine (I own, serial)", "Section islands (parallel agents)"]);
});

test("the flagship plans that vanished are back, with the right progress", async () => {
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");
  const byName = new Map((await scanTasks()).map(p => [p.planName, p]));

  const radar = byName.get("radar-upgrade");
  assert.ok(radar, "radar-upgrade parsed to zero phases, so the roadmap called 7/7 shipped work 0%");
  assert.equal(radar.total, 7);
  assert.equal(radar.done, 7, "all seven phases are marked ✅ shipped in the plan");

  const portal = byName.get("dev-team-portal");
  assert.ok(portal, "the ⭐⭐ plan for this very workspace never appeared in the Tasks view");
  assert.equal(portal.total, 5);
});

test("only the plans that genuinely have no phases yield none", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  // Handoff notes and a plan whose phases read "(To fill once Ed answers)".
  // Anything else dropping to zero means a plan silently left the roadmap.
  const allowed = new Set([
    "advisor-omega-upgrade",
    "aqua-tag-handoff",
    "dev-docs-handoff",
    "enquiry-detail-card-handoff",
    "freelancer-workspace-HANDOFF",
    "public-bucket-HANDOFF",
  ]);
  const empty = (await plans()).filter(p => parsePhases(p.md).length === 0).map(p => p.name);
  assert.deepEqual(empty.sort(), [...allowed].sort());
});

test("a Phases section still stops at the next heading of ANY level", async () => {
  // The fix that brought the corpus back to 127 tasks. Widening the anchor to
  // `Phasing` must not widen this.
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    "1. **First.** Does a thing.",
    "2. **Second.** Does another.",
    "### A sub-section, not a phase",
    "1. A matcher rule that must NOT be counted.",
    "## Done when",
    "1. Also not a phase.",
  ].join("\n");
  assert.deepEqual(parsePhases(md).map(p => p.number), ["1", "2"]);
});

test("no plan produces two tasks with the same id", async () => {
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");
  for (const plan of await scanTasks()) {
    const ids = plan.tasks.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, `${plan.planName} has duplicate task ids`);
  }
});

// ---- a task title is a title, not the paragraph -----------------------------

test("a status emoji before the bold lead does not swallow the whole paragraph", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    "1. ✅ **Finish the factors — SHIPPED (2026-08-19).** Added `enquiry` (form/conversion",
    "   telemetry) and `traffic` (pageview telemetry) factors to `clientAquaHealth`, threaded",
    "   telemetry through all three call sites and pinned the lot in a contract test.",
  ].join("\n");
  const [phase] = parsePhases(md);
  assert.equal(phase.title, "Finish the factors — SHIPPED (2026-08-19).");
  assert.ok(phase.detail && phase.detail.length > phase.title.length, "the body is the detail, not the title");
});

test("a title too long to fit is cut at a word, never through one", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    `1. ✅ ${"supercalifragilistic ".repeat(12)}clientAquaHealthTelemetryIdentifier tail`,
  ].join("\n");
  const [phase] = parsePhases(md);
  assert.ok(phase.title.length <= 141, `title is ${phase.title.length} chars`);
  assert.match(phase.title, /…$/, "a cut title says it was cut");
  assert.doesNotMatch(phase.title, /clientAquaHealthTele\w*…$/, "an identifier must not be sliced through");
});

test("no task in the real corpus is a 140-character run-on", async () => {
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");
  for (const plan of await scanTasks()) {
    for (const task of plan.tasks) {
      assert.ok(task.title.length <= 141, `${task.id} title is ${task.title.length} chars: ${task.title}`);
      assert.doesNotMatch(task.title, /^[✅✔☑⛔⚠❌🚧🛑]/u, `${task.id} keeps its status emoji in the title`);
    }
  }
});
