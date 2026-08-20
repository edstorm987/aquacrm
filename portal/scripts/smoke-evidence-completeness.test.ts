import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const builders = read("src", "lib", "server", "resolutionPlans.ts");
const route = read("src", "app", "api", "portal", "attention", "completed", "route.ts");
const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");

let completed: typeof import("../src/server/completedActions");
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  completed = await import("../src/server/completedActions");
});

beforeEach(() => {
  mutate(state => {
    for (const k of Object.keys(state.completedActions)) delete state.completedActions[k];
  });
});

describe("pressing Evidence is never a wasted click", () => {
  // "No inline records" reads as "there is nothing to see", which is the
  // opposite of what an alert means — and teaches the operator to stop
  // pressing the button at all.
  it("falls back to a generic builder instead of returning nothing", () => {
    assert.match(builders, /genericEvidenceFor/);
    assert.doesNotMatch(
      builders,
      /startsWith\("incident:"\)\) \{\s*return radarEvidenceFor[\s\S]{0,80}\n  return null;/,
      "the dispatcher must not fall through to null",
    );
  });

  it("the generic builder shows why it fired, how old, and what clears it", () => {
    for (const field of ["What fired", "Severity", "First seen", "How it is dealt with"]) {
      assert.ok(builders.includes(field), `generic evidence must show "${field}"`);
    }
    assert.match(builders, /clearsWhen\) fields\.push/);
  });

  it("flags an alert that has been dealt with before", () => {
    // A repeat is the useful signal — it means the fix did not hold.
    assert.match(builders, /Dealt with before/);
    assert.match(builders, /completionsFor/);
  });
});

describe("off-system work can be recorded as done", () => {
  // Half the families are work Aqua only observes. Without this they sit in
  // the queue until the underlying evidence happens to change.
  it("exposes an endpoint to record it", () => {
    assert.match(route, /export async function POST/);
    assert.match(route, /recordCompletedAction/);
  });

  it("requires a source and a title rather than logging blanks", () => {
    assert.match(route, /A source and a title are required/);
  });

  it("both records it and clears it from the queue", () => {
    // Recording without clearing leaves the operator looking at work they
    // have already finished.
    assert.match(workspace, /markAttentionDone/);
    assert.match(workspace, /updateAlert\(alertId, "dismiss"\)/);
  });

  it("only clears the row once the server confirmed", () => {
    assert.match(workspace, /if \(!result\.ok\) return;/);
  });

  it("records it against the alert so a repeat is recognisable", () => {
    const entry = completed.recordCompletedAction("a", {
      sourceId: "invoice:cli_1:INV-9", title: "Chase INV-9", outcome: "resolved",
    });
    assert.equal(entry.sourceId, "invoice:cli_1:INV-9");
    assert.equal(completed.completionsFor("a", "invoice:cli_1:INV-9").length, 1);
  });
});
