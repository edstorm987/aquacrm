import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const AGENCY = "agency-completed";
let mod: typeof import("../src/server/completedActions");
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  mod = await import("../src/server/completedActions");
});

beforeEach(() => {
  mutate(state => {
    for (const key of Object.keys(state.completedActions)) delete state.completedActions[key];
  });
});

describe("finished work leaves a record", () => {
  // Alerts are derived from live evidence and cease to exist once it is
  // healthy — taking any "done" flag with them. The log has to outlive them.
  it("records what was completed", () => {
    mod.recordCompletedAction(AGENCY, {
      sourceId: "enquiry-classification:e1", title: "Classify enquiry", outcome: "resolved",
    });
    const entries = mod.listCompletedActions(AGENCY);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outcome, "resolved");
  });

  it("answers 'have I dealt with this before?'", () => {
    mod.recordCompletedAction(AGENCY, { sourceId: "invoice:1", title: "Chase INV-1", outcome: "resolved" });
    assert.equal(mod.completionsFor(AGENCY, "invoice:1").length, 1);
    assert.equal(mod.completionsFor(AGENCY, "invoice:2").length, 0);
  });

  it("does not double-log a double-click", () => {
    // The same source completed twice in seconds is one piece of work.
    const now = 1_000_000;
    mod.recordCompletedAction(AGENCY, { sourceId: "task:1", title: "T", outcome: "resolved" }, now);
    mod.recordCompletedAction(AGENCY, { sourceId: "task:1", title: "T", outcome: "resolved" }, now + 500);
    assert.equal(mod.listCompletedActions(AGENCY).length, 1);
  });

  it("does log the same source completed again much later", () => {
    // A recurring job genuinely done twice is two pieces of work.
    const now = 1_000_000;
    mod.recordCompletedAction(AGENCY, { sourceId: "task:1", title: "T", outcome: "resolved" }, now);
    mod.recordCompletedAction(AGENCY, { sourceId: "task:1", title: "T", outcome: "resolved" }, now + 600_000);
    assert.equal(mod.listCompletedActions(AGENCY).length, 2);
  });

  it("keeps dismissals, because deciding not to act is a decision", () => {
    // A register showing only the things you said yes to misrepresents the day.
    mod.recordCompletedAction(AGENCY, { sourceId: "a:1", title: "Noise", outcome: "dismissed" });
    assert.equal(mod.listCompletedActions(AGENCY)[0].outcome, "dismissed");
  });

  it("lists newest first", () => {
    mod.recordCompletedAction(AGENCY, { sourceId: "a", title: "old", outcome: "resolved" }, 1000);
    mod.recordCompletedAction(AGENCY, { sourceId: "b", title: "new", outcome: "resolved" }, 5000);
    assert.deepEqual(mod.listCompletedActions(AGENCY).map(e => e.title), ["new", "old"]);
  });

  it("scopes to the agency", () => {
    mod.recordCompletedAction(AGENCY, { sourceId: "a", title: "mine", outcome: "resolved" });
    mod.recordCompletedAction("other-agency", { sourceId: "b", title: "theirs", outcome: "resolved" });
    assert.deepEqual(mod.listCompletedActions(AGENCY).map(e => e.title), ["mine"]);
  });

  it("really deletes an entry rather than hiding it", () => {
    // A mis-click must be undoable, and an operator who removes something
    // should not find it still counted somewhere.
    const entry = mod.recordCompletedAction(AGENCY, { sourceId: "a", title: "oops", outcome: "resolved" });
    assert.equal(mod.deleteCompletedAction(AGENCY, entry.id), true);
    assert.equal(mod.listCompletedActions(AGENCY).length, 0);
  });

  it("refuses to delete another agency's entry", () => {
    const entry = mod.recordCompletedAction("other-agency", { sourceId: "a", title: "theirs", outcome: "resolved" });
    assert.equal(mod.deleteCompletedAction(AGENCY, entry.id), false);
  });
});

describe("completions are recorded where work actually finishes", () => {
  it("logs a dismissed alert, but not a parked one", () => {
    // Parking is "later", not "done"; logging it would inflate the record.
    const route = read("src", "app", "api", "portal", "notifications", "route.ts");
    assert.match(route, /body\.action === "dismiss"/);
    assert.doesNotMatch(route, /body\.action === "park"[\s\S]{0,120}recordCompletedAction/);
  });

  it("logs only the transition into done, not every save of a done task", () => {
    const route = read("src", "app", "api", "portal", "tasks", "route.ts");
    assert.match(route, /safePatch\.status === "done" && existing\?\.status !== "done"/);
  });

  it("shows no count badge on the Completed tab", () => {
    // Its contents load separately, so a badge would always read 0.
    const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");
    assert.match(workspace, /option\.id === "completed" \? null :/);
  });
});
