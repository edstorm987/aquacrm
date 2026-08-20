// Writing a plan from the Dev Team portal — the only write path in the Dev
// Console that creates a FILE, and the one nothing tested.
//
// The risk here is not "does the file get written" (it always did). It is that
// the writer and the two readers live in three different modules and nobody
// crossed the seam:
//
//   src/lib/server/devTeamPlans.ts   writes docs/development/plans/<slug>.md
//   devTeamBoard.parsePlanStatus     reads the `**Status:` line → a board lane
//   devTeamTasks.parsePhases         reads `## Phases…` → the Tasks view
//
// A plan the system cannot read back is worse than no plan, so the contract
// asserted below is the ROUND TRIP: render → parse → the plan Ed just wrote is
// planned, unstarted, and visible on the board he was sent to look at.
//
// Everything runs against a throwaway PROJECT_ROOT. `PROJECT_ROOT` is
// `resolve(process.cwd())` captured when devDocs first loads, so the sandbox is
// entered with `process.chdir` BEFORE the modules are imported — no test here
// can touch the real `docs/development/plans/`.

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

// ─── sandbox ────────────────────────────────────────────────────────────────
// `require`, not `import`: `import` hoists and would beat the chdir, so the
// real docs/development/plans/ would be the write target.

const originalCwd = process.cwd();
// realpath: on macOS /var is a symlink to /private/var, and PROJECT_ROOT is the
// resolved cwd — comparing against the unresolved temp path would never match.
const SANDBOX = realpathSync(mkdtempSync(join(tmpdir(), "aqua-plan-authoring-")));
const SANDBOX_PLANS = join(SANDBOX, "docs", "development", "plans");
mkdirSync(SANDBOX_PLANS, { recursive: true });
process.chdir(SANDBOX);

const { createPlan, planSlug, renderPlanMarkdown } =
  require_("../src/lib/server/devTeamPlans") as typeof import("../src/lib/server/devTeamPlans");
const { parsePhases, scanTasks } =
  require_("../src/lib/server/devTeamTasks") as typeof import("../src/lib/server/devTeamTasks");
const { parsePlanStatus } =
  require_("../src/lib/server/devTeamBoard") as typeof import("../src/lib/server/devTeamBoard");

after(() => {
  process.chdir(originalCwd);
  rmSync(SANDBOX, { recursive: true, force: true });
});

const planFile = (slug: string) => readFile(join(SANDBOX_PLANS, `${slug}.md`), "utf8");

describe("A written plan reads back — render → parse round trip", () => {
  it("a brand-new plan is PLANNED with every phase still to do", () => {
    // The exact wording that used to break it: "Complete…" and "…is done" are
    // the most natural English for work nobody has started, and the reader takes
    // a completion word LEADING a phase as proof the phase is finished.
    const md = renderPlanMarkdown({
      title: "Payment reminders",
      goal: "Ed can see which clients are behind.",
      phases: [
        "Complete the reminder settings form",
        "Send one email and confirm it is done",
        "Build the schedule",
      ],
    });

    const status = parsePlanStatus(md);
    assert.ok(status, "the board must find a **Status: line");
    assert.equal(status.statusKind, "planned", "a plan written today is ready to assign, not shipped");

    const phases = parsePhases(md);
    assert.equal(phases.length, 3, "one task per phase Ed typed");
    assert.deepEqual(phases.map(p => p.number), ["1", "2", "3"]);
    for (const phase of phases) {
      assert.equal(phase.marker, undefined, `phase ${phase.number} must not claim to be done: ${phase.title}`);
    }
    // The phase text still survives into the task title.
    assert.match(phases[0].title, /Complete the reminder settings form/);
    assert.match(phases[2].title, /Build the schedule/);
  });

  it("the placeholder phase of a plan with no phases is also unstarted", () => {
    const md = renderPlanMarkdown({ title: "Bare plan", goal: "Something." });
    const phases = parsePhases(md);
    assert.equal(phases.length, 1);
    assert.equal(phases[0].marker, undefined);
  });

  it("a phase already marked done by hand still reads as done", () => {
    // The fix must not make the reader deaf — an explicit ✅ is still a claim.
    const md = renderPlanMarkdown({ title: "Half built", goal: "x", phases: ["✅ The settings form", "The schedule"] });
    const phases = parsePhases(md);
    assert.equal(phases[0].marker, "done");
    assert.equal(phases[1].marker, undefined);
  });

  it("a pasted list marker is not doubled up", () => {
    const md = renderPlanMarkdown({ title: "Pasted", goal: "x", phases: ["1. First slice", "- Second slice"] });
    assert.match(md, /^1\. \[ \] First slice$/m);
    assert.match(md, /^2\. \[ \] Second slice$/m);
    const phases = parsePhases(md);
    assert.deepEqual(phases.map(p => p.number), ["1", "2"]);
  });
});

describe("A written plan is visible on the board it was written for", () => {
  it("the Tasks view shows the new plan with nothing done yet", async () => {
    await createPlan({
      title: "Payment reminders",
      goal: "Ed can see which clients are behind.",
      phases: [
        "Complete the reminder settings form",
        "Send one email and confirm it is done",
        "Build the schedule",
      ],
    });

    const active = await scanTasks({ onlyActive: true });
    const mine = active.find(plan => plan.planName === "payment-reminders");
    assert.ok(mine, "the plan Ed just wrote must be on the Tasks view");
    assert.equal(mine.total, 3);
    assert.equal(mine.done, 0, "no phase is finished the moment the plan is created");
    assert.deepEqual(mine.tasks.map(t => t.state), ["todo", "todo", "todo"]);
  });

  it("a plan whose every phase is worded as done does not vanish from the board", async () => {
    // The worst version of the bug: when EVERY phase read as done, done === total
    // and `onlyActive` (what the "What we're working on" Tasks view renders)
    // filtered the plan out entirely. Ed's brand-new plan was simply not there.
    await createPlan({
      title: "Onboarding polish",
      goal: "The welcome screen stops looking unfinished.",
      phases: ["Complete the welcome screen", "Done when the checklist saves"],
    });

    const active = await scanTasks({ onlyActive: true });
    const mine = active.find(plan => plan.planName === "onboarding-polish");
    assert.ok(mine, "a freshly written plan must never be filtered out as finished");
    assert.equal(mine.done, 0);
    assert.equal(mine.total, 2);
  });
});

describe("What Ed typed is what the plan file says", () => {
  it("a multi-line goal and multi-line notes keep their shape", async () => {
    await createPlan({
      title: "Overdue at a glance",
      goal: "Ed can see, at a glance, which clients are behind.\n\nSpecifically:\n- overdue invoices are red\n- a nudge button sends the reminder",
      notes: "Reuse email-sender.\nDo not touch billing.",
    });
    const md = await planFile("overdue-at-a-glance");

    assert.match(md, /^- overdue invoices are red$/m, "the bullet list stays a bullet list");
    assert.match(md, /^- a nudge button sends the reminder$/m);
    assert.match(md, /behind\.\n\nSpecifically:/, "the paragraph break survives");
    assert.match(md, /^Reuse email-sender\.\nDo not touch billing\.$/m, "notes keep their line break");
    // The old flattening signature: bullets swallowed into one run-on line.
    assert.ok(!/Specifically: - overdue/.test(md), "the goal must not be flattened into one line");
  });

  it("runs of blank lines are capped and \\r\\n is normalised", async () => {
    await createPlan({
      title: "Tidy whitespace",
      goal: "First para.\r\n\r\n\r\n\r\nSecond para.\r\n",
    });
    const md = await planFile("tidy-whitespace");
    assert.ok(!md.includes("\r"), "no carriage returns land in the file");
    assert.match(md, /First para\.\n\nSecond para\./);
    assert.ok(!/First para\.\n\n\nSecond/.test(md), "3+ blank lines collapse to one");
  });

  it("the title stays on one line even when it arrives with newlines", async () => {
    await createPlan({ title: "Two\nline title", goal: "x" });
    const md = await planFile("two-line-title");
    assert.match(md, /^# Plan — Two line title$/m);
  });

  it("phases stay one per line — a newline inside a phase cannot split it in two", async () => {
    await createPlan({ title: "Phase newline", goal: "x", phases: ["First\nslice", "Second slice"] });
    const md = await planFile("phase-newline");
    const phases = parsePhases(md);
    assert.equal(phases.length, 2, "two phases in, two tasks out");
    assert.match(phases[0].title, /First slice/);
  });

  it("a heading typed into the goal cannot become the plan's Phases section", async () => {
    // Keeping newlines means a goal can now contain a line that WOULD open a
    // markdown heading. `parsePhases` takes the first `## Phas…` section in the
    // document, and the goal sits above the real one — so an unescaped heading
    // here would replace the plan's real phases with whatever Ed happened to
    // type. The hashes are escaped; the text still reads.
    await createPlan({
      title: "Heading in goal",
      goal: "Rework the page.\n## Phases (simple-first)\n1. sneaky phase",
      phases: ["The real first slice"],
    });
    const md = await planFile("heading-in-goal");

    const phases = parsePhases(md);
    assert.equal(phases.length, 1, "only the real Phases section is parsed");
    assert.match(phases[0].title, /The real first slice/);
    assert.ok(!phases.some(p => /sneaky/.test(p.title)), "prose cannot inject a phase");
    assert.match(md, /sneaky phase/, "and Ed's words are still in the file, unmangled");

    const status = parsePlanStatus(md);
    assert.equal(status?.statusKind, "planned", "the board still classifies it");
  });
});

describe("Creating a plan — confinement, refusal, and validation", () => {
  it("writes inside the plans directory whatever the title looks like", async () => {
    const result = await createPlan({ title: "../../../etc/passwd", goal: "Escape attempt." });
    assert.equal(result.slug, planSlug("../../../etc/passwd"));
    assert.equal(result.relPath, `docs/development/plans/${result.slug}.md`);
    assert.ok(result.absPath.startsWith(SANDBOX_PLANS + sep), `stayed inside the plans dir: ${result.absPath}`);
    assert.ok(result.absPath.toLowerCase().endsWith(".md"));
  });

  it("refuses a title with nothing usable in it, and refuses an empty title or goal", async () => {
    await assert.rejects(createPlan({ title: "!!! ???", goal: "x" }), /no usable letters or numbers/);
    await assert.rejects(createPlan({ title: "   ", goal: "x" }), /needs a title/);
    await assert.rejects(createPlan({ title: "No goal here", goal: "   \n\n  " }), /needs a goal/);
  });

  it("refuses to overwrite an existing plan — a worker may already be building it", async () => {
    await createPlan({ title: "Only once", goal: "First." });
    await assert.rejects(createPlan({ title: "Only once", goal: "Second." }), /already exists/);
    const md = await planFile("only-once");
    assert.match(md, /First\./);
    assert.ok(!md.includes("Second."), "the original plan is untouched");
  });

  it("two concurrent creates with the same title cannot both succeed", async () => {
    // TOCTOU: an `access()` probe and a `writeFile()` are two awaits, so two
    // in-flight requests both saw "no such file" and both wrote — the loser's
    // plan was gone with no error anywhere and the API said ok to both. The
    // write itself is now the exclusive operation.
    const settled = await Promise.allSettled([
      createPlan({ title: "Race me", goal: "first goal AAA" }),
      createPlan({ title: "Race me", goal: "second goal BBB" }),
    ]);
    const won = settled.filter(r => r.status === "fulfilled");
    const lost = settled.filter(r => r.status === "rejected");
    assert.equal(won.length, 1, "exactly one create may win");
    assert.equal(lost.length, 1, "the other caller must be TOLD it lost");
    assert.match(
      (lost[0] as PromiseRejectedResult).reason.message,
      /already exists/,
      "and told why, in the same words as the sequential refusal",
    );

    const md = await planFile("race-me");
    const goals = ["first goal AAA", "second goal BBB"].filter(goal => md.includes(goal));
    assert.deepEqual(goals.length, 1, "the file holds exactly one caller's plan, whole");
  });
});

describe("The plan write path is gated the same way the portal is", () => {
  it("the route re-asserts the Dev Mode gate and is the only writer", () => {
    const route = read("src/app/api/portal/dev-team/plans/route.ts");
    assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/, "founder/agency roles only");
    assert.match(route, /devDocsAccessible\(session\)/, "the route asks the one predicate itself");
    assert.match(route, /status: 404/, "outside Dev Mode the surface does not exist");
    assert.match(route, /status: 401/, "an unauthenticated caller gets nowhere");
    assert.match(route, /createPlan\(/, "writing goes through the confined helper, never fs directly");
    assert.ok(!/node:fs/.test(route), "the route never touches the filesystem itself");

    const page = read("src/app/portal/dev-team/plans/new/page.tsx");
    assert.match(page, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(page, /if \(!devDocsAccessible\(session\)\) notFound\(\)/);
  });

  it("the writer only ever writes .md inside docs/development/plans", () => {
    const source = read("src/lib/server/devTeamPlans.ts");
    assert.match(source, /^import "server-only";/m);
    assert.match(source, /flag: "wx"/, "the overwrite refusal is the write, not a check before it");
    assert.equal(
      (source.match(/await writeFile\(/g) ?? []).length,
      1,
      "one write in the module — every other path is a read or a refusal",
    );
  });
});
