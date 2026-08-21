// AQUA EDITOR AI — the editor's fourth depth.
//
// The depth ladder was simple / visual / developer: three ways to operate the
// tool. The missing state was not operating it at all — describing the change
// and letting the assistant do it. This pins that mode, its tab, and the two
// things that make it an EDITOR assistant rather than a chat box: pointing at
// an element, and attaching a file.
//
// It also pins the reuse contract: ONE assistant engine, three skins. Aqua
// Editor AI must mount the same AssistantWorkspace the Advisor and the
// Librarian use — a second brain is the thing this test exists to prevent.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EDITING_MODES, editingMode, modeAllowsTab, tabForMode } from "../src/engines/editor/editing/modes";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

describe("Aqua Editor AI — the assist depth", () => {
  it("offers 'assist' as a mode, ahead of the hands-on depths", () => {
    assert.deepEqual(
      EDITING_MODES.map(mode => mode.id),
      ["assist", "simple", "visual", "developer"],
      "the ladder runs shallowest (talk to it) to deepest (developer)",
    );
  });

  it("gives the assist mode the assistant tab", () => {
    assert.ok(modeAllowsTab("assist", "assistant"), "assist mode offers the assistant");
    assert.equal(tabForMode("assist", "repository"), "assistant",
      "coming from a deeper mode lands on the assistant, not a blank panel");
  });

  it("does NOT offer the assistant in the hands-on depths", () => {
    for (const mode of ["simple", "visual", "developer"] as const) {
      assert.equal(modeAllowsTab(mode, "assistant"), false, `${mode} should not carry the assistant tab`);
    }
  });

  it("still defaults to the visual mode — adding a mode must not move the default", () => {
    // Named, not indexed: prepending 'assist' would silently have changed an
    // index-based default to 'simple'.
    assert.equal(editingMode(undefined).id, "visual");
    assert.equal(editingMode("nonsense").id, "visual");
  });

  it("is a RESKIN — it mounts the same assistant engine as the Advisor and Librarian", () => {
    const panel = read("src", "components", "editing", "AquaEditorAI.tsx");
    assert.match(panel, /assistant\/AssistantWorkspace/, "must mount the shared AssistantWorkspace");
    const server = read("src", "engines", "editor", "server", "editorAssistant.ts");
    for (const shared of ["buildAssistantBusinessContext", "getAssistantWorkspace", "isAssistantConfigured"]) {
      assert.ok(server.includes(shared), `must reuse ${shared} rather than a second assistant`);
    }
  });

  it("can point at an element and attach a file", () => {
    const panel = read("src", "components", "editing", "AquaEditorAI.tsx");
    assert.match(panel, /onPickElement/, "reuses the studio's element picker");
    assert.match(panel, /FileReader/, "reads attached files");
    assert.match(panel, /onDrop/, "accepts a dropped file");
  });

  it("proposes rather than applies — the change is still a person's click", () => {
    const panel = read("src", "components", "editing", "AquaEditorAI.tsx");
    // The context is loaded into the composer; nothing auto-sends or auto-saves.
    assert.ok(!/save-draft|publish/.test(panel), "the assistant panel must not write to the portal itself");
  });

  it("is wired into both editor doors", () => {
    for (const route of [
      ["src", "app", "portal", "agency", "portals", "editor", "page.tsx"],
      ["src", "app", "portal", "dev-team", "editor", "studio", "page.tsx"],
    ]) {
      const page = read(...route);
      assert.match(page, /loadEditorAssistant/, `${route.join("/")} should load the assistant`);
      assert.match(page, /assistant=\{assistant\}/, `${route.join("/")} should pass it to the studio`);
    }
  });
});
