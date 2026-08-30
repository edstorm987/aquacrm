import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// The Tasks view and the roadmap percentage are both read straight out of the
// plans — "computed from those tasks, never typed", as the roadmap page tells
// Ed. That promise only holds if the parser reads the plans the way a person
// does. These pin the three ways it did not.

async function plans(): Promise<{ name: string; md: string }[]> {
  const { PROJECT_ROOT } = await import("../src/lib/server/dev/devDocs");
  const dir = join(PROJECT_ROOT, "docs/development/plans");
  const names = (await readdir(dir)).filter(n => n.toLowerCase().endsWith(".md")).sort();
  return Promise.all(names.map(async name => ({
    name: name.replace(/\.md$/i, ""),
    md: await readFile(join(dir, name), "utf8"),
  })));
}

/** Every parsed task across every plan — for rules that must hold generally. */
async function allTasks() {
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");
  return (await scanTasks()).flatMap(plan => plan.tasks);
}

async function taskById(id: string) {
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");
  for (const plan of await scanTasks()) {
    const found = plan.tasks.find(t => t.id === id);
    if (found) return found;
  }
  return undefined;
}

// ---- "done" is a marker a phase writes, not a word in its prose ------------

test("a word inside the body never marks a live phase done", async () => {
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  // This used to name marketing-workspace-overhaul#6 as "the one task blocked on
  // Ed". That work then SHIPPED and the plan correctly stopped saying so — which
  // failed this test for the right reason in the wrong place. Pinning one task's
  // wording made the suite depend on a plan never progressing.
  //
  // The real contract is the RULE: a phase whose own body says it is blocked must
  // never render as finished. Property-based, so it cannot rot as plans move.
  const all = await allTasks();
  const blockedTasks = all.filter(task => /\bBLOCKED\b/i.test(task.detail ?? ""));
  for (const task of blockedTasks) {
    assert.notEqual(
      task.state,
      "done",
      `${task.id} says BLOCKED in its body but renders as finished`,
    );
  }
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
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
  // Handoff notes and a plan whose phases read "(To fill once Ed answers)".
  // Anything else dropping to zero means a plan silently left the roadmap.
  const allowed = new Set([
    "advisor-omega-upgrade",
    "aqua-engine-and-dev-team-plugin",
    // An IDEA, recorded deliberately unstarted (2026-08-29). Ed's reasoning is
    // the point: a guided-help surface mirrors the product's shape, so building
    // it before the information architecture settles means reworking it on every
    // rename. It has no phases because there is no work in flight — giving it
    // phases would put a Someday idea on the roadmap as if it were queued.
    "aqua-explorer-guided-help",
    // Specced, not started (2026-08-30). Ed asked for a palette of his own
    // saved links in Tools and said it was for "once all finished", so it is
    // written down rather than queued. Its numbered section is a REHOMING
    // ORDER — three plugin workspaces have no door but the one being removed —
    // not deliverable phases. Giving it phases would report work in flight that
    // Ed deliberately parked.
    "my-tools-palette",
    "dev-team-ui-polish",
    "aqua-tag-handoff",
    "dev-docs-handoff",
    "enquiry-detail-card-handoff",
    "freelancer-workspace-HANDOFF",
    "public-bucket-HANDOFF",
    "configurable-access-and-workspace-parity",
    // Not a plan with phases — it is the launch ORDER and the list of things
    // only Ed can supply (2026-08-27). Its "Phase A/B/C" headings are the order
    // of work, not deliverable phases the roadmap should track.
    "launch-order-and-blockers",
    // Also not a plan: the Supabase cutover runbook and the drafted privacy
    // wording (2026-08-27). Its numbered sections are steps Ed performs and
    // decisions only he can make — there is no engineering deliverable here for
    // the roadmap to track, and counting it would report the roadmap as behind
    // on work that is not ours to do.
    "supabase-cutover-and-policy-drafts",
    // Architecture note + what is built vs not, for the client-owned form data
    // design (2026-08-27). Its sections are a record of a decision, not phases
    // the roadmap should be tracking progress against.
    // Also not a plan with phases: the storage-split analysis (2026-08-29).
    // It records what was MEASURED — the single-JSONB-blob shape, the live
    // Supabase RLS check, the radar retention defect — and what Ed has to
    // decide. Its "1/2/3/4" headings are the four data classes, not phases,
    // and the one ordered list in it is mostly steps only he can perform
    // (deploy, fix accounts). Counting it would report the roadmap as behind
    // on work that is not ours to do.
    "database-separation",
    // Also not a plan with phases (2026-08-29): the remaining-build order. Its
    // "1/2/3/4" headings are an ORDER OF WORK with the two storage moves
    // distinguished, not deliverable phases the roadmap should track.
    "storage-and-remaining-build",
    "client-owned-form-data",
  ]);
  const empty = (await plans()).filter(p => parsePhases(p.md).length === 0).map(p => p.name);
  assert.deepEqual(empty.sort(), [...allowed].sort());
});

test("a Phases section still stops at the next heading of ANY level", async () => {
  // The fix that brought the corpus back to 127 tasks. Widening the anchor to
  // `Phasing` must not widen this.
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");
  for (const plan of await scanTasks()) {
    const ids = plan.tasks.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, `${plan.planName} has duplicate task ids`);
  }
});

// ---- a task title is a title, not the paragraph -----------------------------

test("a status emoji before the bold lead does not swallow the whole paragraph", async () => {
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { parsePhases } = await import("../src/lib/server/dev/devTeamTasks");
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
  const { scanTasks } = await import("../src/lib/server/dev/devTeamTasks");
  for (const plan of await scanTasks()) {
    for (const task of plan.tasks) {
      assert.ok(task.title.length <= 141, `${task.id} title is ${task.title.length} chars: ${task.title}`);
      assert.doesNotMatch(task.title, /^[✅✔☑⛔⚠❌🚧🛑]/u, `${task.id} keeps its status emoji in the title`);
    }
  }
});
