import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const AGENCY = "agency-checklist";
let mod: typeof import("../src/server/tasks");
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  mod = await import("../src/server/tasks");
});

beforeEach(() => {
  mutate(state => { for (const k of Object.keys(state.tasks)) delete state.tasks[k]; });
});

function task() {
  return mod.createAgencyTask({ agencyId: AGENCY, title: "Onboard Cedar Dental" });
}

describe("an action can be broken into sub-tasks", () => {
  // "Onboard Cedar Dental" is a sequence. Without sub-tasks each part is
  // either a separate top-level action — losing that they belong together —
  // or invisible, leaving the operator to remember the order.
  it("adds sub-tasks in the order they were written", () => {
    const t = task();
    mod.addTaskChecklistItem(AGENCY, t.id, { label: "Create their portal" });
    const updated = mod.addTaskChecklistItem(AGENCY, t.id, { label: "Send the welcome pack" });
    assert.deepEqual(updated?.checklist?.map(i => i.label),
      ["Create their portal", "Send the welcome pack"],
      "a checklist is a sequence — reordering underneath somebody loses their place");
  });

  it("carries a destination so each step can resolve on its own", () => {
    const t = task();
    const updated = mod.addTaskChecklistItem(AGENCY, t.id, {
      label: "Create their portal", href: "/portal/clients/cli_1?tab=portal", focus: "access",
    });
    assert.equal(updated?.checklist?.[0].href, "/portal/clients/cli_1?tab=portal");
    assert.equal(updated?.checklist?.[0].focus, "access");
  });

  it("attaches an SOP to a step", () => {
    const t = task();
    const updated = mod.addTaskChecklistItem(AGENCY, t.id, { label: "Set up billing", sopId: "sop_9" });
    assert.equal(updated?.checklist?.[0].sopId, "sop_9");
  });

  it("refuses a blank label rather than storing an empty row", () => {
    const t = task();
    assert.throws(() => mod.addTaskChecklistItem(AGENCY, t.id, { label: "   " }));
  });

  it("ticks and unticks — a mis-click is not a decision", () => {
    const t = task();
    const withItem = mod.addTaskChecklistItem(AGENCY, t.id, { label: "Create their portal" });
    const id = withItem!.checklist![0].id;
    assert.equal(mod.setTaskChecklistItemDone(AGENCY, t.id, id, true, "ed")?.checklist?.[0].done, true);
    assert.equal(mod.setTaskChecklistItemDone(AGENCY, t.id, id, false)?.checklist?.[0].done, false);
  });

  it("records who ticked it and when", () => {
    const t = task();
    const withItem = mod.addTaskChecklistItem(AGENCY, t.id, { label: "x" });
    const done = mod.setTaskChecklistItemDone(AGENCY, t.id, withItem!.checklist![0].id, true, "ed");
    assert.equal(done?.checklist?.[0].doneBy, "ed");
    assert.ok(done?.checklist?.[0].doneAt);
  });

  it("points at the first unticked step, even if one was done out of order", () => {
    const t = task();
    mod.addTaskChecklistItem(AGENCY, t.id, { label: "one" });
    const two = mod.addTaskChecklistItem(AGENCY, t.id, { label: "two" });
    mod.setTaskChecklistItemDone(AGENCY, t.id, two!.checklist![1].id, true);
    const progress = mod.checklistProgress(mod.listAgencyTasks(AGENCY)[0]);
    assert.equal(progress.next?.label, "one");
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 2);
  });

  it("removes a sub-task", () => {
    const t = task();
    const withItem = mod.addTaskChecklistItem(AGENCY, t.id, { label: "wrong" });
    const after = mod.removeTaskChecklistItem(AGENCY, t.id, withItem!.checklist![0].id);
    assert.equal(after?.checklist?.length, 0);
  });

  it("refuses to touch another agency's task", () => {
    const t = task();
    assert.equal(mod.addTaskChecklistItem("other", t.id, { label: "x" }), null);
    assert.equal(mod.setTaskChecklistItemDone("other", t.id, "chk_1", true), null);
  });
});

describe("the checklist is a manual list, not a derived one", () => {
  it("stores done rather than deriving it", () => {
    // A human decides when "send the welcome pack" is finished — there is no
    // record to observe, unlike a resolution plan step.
    const types = read("src", "server", "types.ts");
    assert.match(types, /`done` is stored here, unlike derived plan steps/);
  });

  it("gives each step its own Resolve carrying the context", () => {
    const ui = read("src", "components", "attention", "TaskChecklist.tsx");
    assert.match(ui, /withResolutionContext\(item\.href/);
  });

  it("emphasises only the next step", () => {
    // A list where everything shouts tells you nothing about where to start.
    const ui = read("src", "components", "attention", "TaskChecklist.tsx");
    assert.match(ui, /isNext \? "bg-amber-50\/70" : ""/);
  });

  it("offers Next in the banner once a sequence exists", () => {
    const banner = read("src", "components", "attention", "ResolutionBanner.tsx");
    assert.match(banner, /nextIsElsewhere \? "Go there" : "Next"/);
  });
});
