// DEV EDITOR — presence: who else is in here.
//
// Ed: "say an AI employee or an actual employee is open on a file, I need this
// to show so we don't end up wrecking each other's work."
//
// The point of this test is that presence INTEGRATES with what the Dev Team
// already knows — agent check-ins and recent file mtimes — rather than growing
// a second presence system that would then disagree with the first.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const route = read("src", "app", "api", "portal", "dev", "editor-activity", "route.ts");
const canvas = read("src", "components", "editing", "EditorCodeCanvas.tsx");

describe("editor presence", () => {
  it("reuses the Dev Team's existing signals rather than inventing presence", () => {
    assert.match(route, /scanWorkerSignals/, "recent file activity already exists");
    assert.match(route, /readActiveCheckIns/, "who is working already exists");
    assert.ok(!/setInterval/.test(route), "the server does not poll; it reads cached signals");
  });

  it("is founder + Dev Mode gated like every dev-team surface", () => {
    assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(route, /devDocsAccessible\(session\)/);
  });

  it("caps what it sends — the list runs to thousands after a big run", () => {
    assert.match(route, /recentFiles\.slice\(0, \d+\)/);
  });

  it("marks changed files in the tree and warns on the open one", () => {
    assert.match(canvas, /editor-activity/, "the canvas reads the signal");
    assert.match(canvas, /movedAgo/, "files carry how long ago they moved");
    assert.match(canvas, /changed \{movedAgo\(open\)\}/, "the OPEN file says so plainly");
  });

  it("is advisory — it never blocks an edit", () => {
    // A hard lock in a tool used by BOTH people and agents strands files when
    // something crashes. The write path's fingerprint check is the real guard.
    assert.ok(!/disabled=\{[^}]*movedAgo/.test(canvas), "presence must not disable editing");
    assert.match(route, /advisory, not a lock/i);
  });
});
