// EXIT INSPECTOR — the way out of somebody else's workspace.
//
// Previewing a real person's workspace stashes the enterer on the session
// (`previewReturnUserId`) and the API restores them on `{ action: "exit" }` —
// but nothing in the chrome offered that exit, so entering an inspection was a
// ONE-WAY DOOR. Ed got stuck in it.
//
// Pinned because the failure mode is silent: the control simply is not there,
// and you only find out once you are already inside somebody else's portal.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const control = read("src", "components", "chrome", "InspectorModeControl.tsx");
const topbar = read("src", "components", "chrome", "Topbar.tsx");

const LAYOUTS = [
  ["src", "app", "portal", "agency", "layout.tsx"],
  ["src", "app", "portal", "team", "layout.tsx"],
  ["src", "app", "portal", "clients", "[clientId]", "layout.tsx"],
  ["src", "app", "portal", "dev-team", "layout.tsx"],
];

describe("exit inspector", () => {
  it("calls the real exit action, not a guess at one", () => {
    assert.match(control, /preview-as-freelancer/);
    assert.match(control, /action: "exit"/);
  });

  it("hard-navigates, because the SESSION changed", () => {
    // A router push would leave server components rendered against the
    // identity you just left.
    assert.match(control, /window\.location\.assign/);
  });

  it("looks like the showcase control — same meaning, same shape", () => {
    // Both say "you are not in your own session". Two different-looking
    // answers to the same question is how somebody misses the exit.
    for (const marker of ["border-amber-300", "bg-amber-50", "min-h-9"]) {
      assert.ok(control.includes(marker), `should mirror ShowcaseModeControl (${marker})`);
    }
  });

  it("is mounted in the topbar, driven by the session flag", () => {
    // Same control, now an entry in the collapsible list (2026-08-29).
    assert.match(topbar, /inspecting \? \{ id: "inspector", label: "Inspector mode", node: <InspectorModeControl/);
    assert.match(topbar, /inspecting\?: boolean/);
  });

  it("is passed from EVERY layout that renders a topbar", () => {
    // Missing it in one scope is exactly the trap: you can enter an inspection
    // from anywhere, so the exit has to exist everywhere.
    for (const layout of LAYOUTS) {
      const source = read(...layout);
      assert.match(
        source,
        /inspecting=\{Boolean\(session\.previewReturnUserId\)\}/,
        `${layout.join("/")} renders a Topbar without the inspector exit`,
      );
    }
  });
});
