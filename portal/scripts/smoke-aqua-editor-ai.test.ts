// AQUA EDITOR AI — the "assist" depth.
//
// The depth ladder was simple / visual / developer: three ways to operate the
// tool. The missing state was not operating it at all — describing the change
// and letting the assistant do it. Adding "assist" made four; since
// 2026-08-22 the ladder is three again — "Just the words" merged into Visual
// (the same selection, the same editable words, one depth deeper available),
// so it reads assist / visual / developer. This pins the assist mode, its tab, and the two
// things that make it an EDITOR assistant rather than a chat box: pointing at
// an element, and attaching a file.
//
// ⚠ IT USED TO PIN THE OPPOSITE RULE. Until 2026-08-21 this file said: "ONE
// assistant engine, three skins. Aqua Editor AI must mount the same
// AssistantWorkspace the Advisor and the Librarian use — a second brain is the
// thing this test exists to prevent." That was a true description of a
// deliberate decision, and Ed has since reversed the decision:
//
//   "aqua editor ai needs to be its only thing please now. needs a seperate
//    tocken please to configure please. it needs its own thing and its saved
//    per project this one is please the chat history per project only limited
//    to a project nothing else and needs its own proper ui for this"
//
// So the reuse assertions below were REWRITTEN, not worked around. They now pin
// the separation: Aqua Editor AI resolves its OWN credential and its OWN model,
// per project, and must never reach for the agency assistant's. If a future
// change makes these fail because the two were re-unified "to remove
// duplication", the duplication is the requirement — fix the change, not the
// test. The security half lives in `smoke-aqua-editor-ai-token.test.ts`, the
// per-project chat history in `smoke-aqua-editor-ai-history.test.ts`, and its
// own interface in `smoke-aqua-editor-ai-ui.test.ts`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EDITING_MODES, editingMode, modeAllowsTab, tabForMode } from "../src/engines/editor/editing/modes";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/**
 * Source with comments removed.
 *
 * For assertions about what a file must NOT reference: several of these files
 * explain a removed dependency by naming it, so a plain `includes` would match
 * the warning rather than the code it is warning about.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Aqua Editor AI — the assist depth", () => {
  it("offers 'assist' as a mode, ahead of the hands-on depths", () => {
    assert.deepEqual(
      EDITING_MODES.map(mode => mode.id),
      ["assist", "visual", "developer"],
      "three modes: Just tell it / Visual builder / Dev — 'Just the words' merged into Visual 2026-08-22",
    );
  });

  it("gives the assist mode the assistant tab", () => {
    assert.ok(modeAllowsTab("assist", "assistant"), "assist mode offers the assistant");
    assert.equal(tabForMode("assist", "repository"), "assistant",
      "coming from a deeper mode lands on the assistant, not a blank panel");
  });

  it("offers the assistant at EVERY depth — it is a companion, not a depth", () => {
    // It used to appear only in "Just tell it", so unless you changed the
    // depth selector you never saw it at all. Aqua Editor AI accompanies
    // whatever depth you are working at; only the hands-on tabs vary.
    for (const mode of ["assist", "visual", "developer"] as const) {
      assert.equal(modeAllowsTab(mode, "assistant"), true, `${mode} should carry the assistant tab`);
    }
  });

  it("puts the assistant first, so it is the first thing in the rail", () => {
    for (const mode of EDITING_MODES) {
      assert.equal(mode.tabs[0], "assistant", `${mode.id} should lead with the assistant`);
    }
  });

  it("still defaults to the visual mode — adding a mode must not move the default", () => {
    // Named, not indexed: prepending 'assist' would once have silently moved
    // an index-based default, and deleting 'simple' (merged into Visual,
    // 2026-08-22) would have moved it again.
    assert.equal(editingMode(undefined).id, "visual");
    assert.equal(editingMode("nonsense").id, "visual");
  });

  // ─── THE REVERSAL ─────────────────────────────────────────────────────────
  //
  // These replace the single "is a RESKIN" case. Read the file header for
  // why the rule flipped.

  it("is its OWN assistant — it must not resolve the agency assistant's credential", () => {
    // Comments stripped: this file's header NAMES the removed functions, in a
    // warning telling the next reader not to bring them back. Matching prose
    // would fail on the very sentence that protects the rule.
    const server = code(read("src", "engines", "editor", "server", "editorAssistant.ts"));
    // `isAssistantConfigured(agencyId)` and `assistantModel(agencyId)` read the
    // AGENCY's `openai` connection — the Aqua Advisor's and the Librarian's
    // key. The editor reaching for those is precisely the thing Ed asked to be
    // undone, and it is a one-line import away from coming back.
    for (const shared of ["isAssistantConfigured", "assistantModel", "openaiAssistant"]) {
      assert.ok(
        !server.includes(shared),
        `editorAssistant.ts must NOT reach for ${shared} — Aqua Editor AI has its own token now`,
      );
    }
  });

  it("resolves its own per-project configuration instead", () => {
    const server = read("src", "engines", "editor", "server", "editorAssistant.ts");
    assert.match(server, /from "@\/engines\/editor\/server\/editorAi"/, "must load its own config module");
    for (const own of ["editorAiConfigured", "editorAiModel"]) {
      assert.ok(server.includes(own), `must gate on ${own} — its own key, per project`);
    }
    assert.match(server, /projectId\?: string/, "loadEditorAssistant is told WHICH project it is");
  });

  it("keeps the token out of the props it hands the client", () => {
    const server = read("src", "engines", "editor", "server", "editorAssistant.ts");
    // The one function that can see a key is `resolveEditorAiToken`, and it is
    // not called here. Nothing this loader returns has anywhere to put one.
    assert.ok(
      !server.includes("resolveEditorAiToken"),
      "the props loader must never resolve the raw token — only `configured` crosses to the client",
    );
    assert.match(server, /editorAi: EditorAiStatus \| null/, "the client gets the safe view, which has no key field");
  });

  it("is entered FOR a project, so 'per project' is real on the route as well", () => {
    const studio = read("src", "app", "portal", "dev-team", "editor", "studio", "page.tsx");
    assert.match(
      studio,
      /loadEditorAssistant\(agencyId, session\.userId, project\?\.id\)/,
      "the studio door must name the project — an assistant configured per project needs to know which",
    );
  });

  it("has its OWN per-project history store, and loads it for the project", () => {
    // ⚠ REWRITTEN, not fixed. This case used to assert the opposite half:
    // "still mounts the shared chat surface — the KNOWN half-state", pinning
    // that the history was STILL `getAssistantWorkspace(agencyId, userId)` and
    // saying to delete the case when Phase 2 landed.
    //
    // Phase 2 landed. The store is real, so the assertion that it did not exist
    // is now the stale one — but the case is not deleted, because the thing it
    // was really guarding (the gap between the two) has moved rather than
    // closed. It now pins where the seam actually is.
    const server = read("src", "engines", "editor", "server", "editorAssistant.ts");
    assert.match(
      server,
      /from "@\/engines\/editor\/server\/editorAiHistory"/,
      "its own history module — not the agency assistant's store",
    );
    assert.match(
      server,
      /initialConversation: project \? getEditorAiConversation\(agencyId, project\) : null/,
      "loaded for ONE project — 'per project only limited to a project nothing else'",
    );
  });

  it("has its OWN interface — it must not mount the shared AssistantWorkspace", () => {
    // ⚠ REWRITTEN, and this is the second time this case has been turned round.
    //
    // Phase 1 wrote it as "still mounts the shared chat surface — the KNOWN
    // half-state". Phase 2 narrowed it to "still RENDERS the shared chat
    // surface — the remaining half-state", pinning that `AquaEditorAI.tsx`
    // mounted `AssistantWorkspace` and that `editorAssistant.ts` still handed
    // over `getAssistantWorkspace(agencyId, userId)`. Both said, in their own
    // comments, to DELETE the case when Ed's own proper UI landed.
    //
    // It landed, so the assertion is inverted rather than deleted: the gap was
    // the thing worth pinning, and the moment it closes is exactly the moment
    // somebody could reopen it by "reusing the assistant we already have".
    // What used to be required is now forbidden.
    //
    // Comments stripped: `AquaEditorAI.tsx`'s header NAMES `AssistantWorkspace`
    // in the paragraph explaining why it is gone.
    const panel = code(read("src", "components", "editing", "AquaEditorAI.tsx"));
    assert.ok(
      !panel.includes("AssistantWorkspace"),
      "Aqua Editor AI must not mount the Advisor's workspace — it has its own UI now",
    );
    assert.ok(
      !panel.includes("/api/assistant"),
      "the editor must not read or write the agency assistant's per-person store",
    );
    const server = code(read("src", "engines", "editor", "server", "editorAssistant.ts"));
    for (const shared of ["getAssistantWorkspace", "assistantStore"]) {
      assert.ok(!server.includes(shared), `the props loader must no longer reach for ${shared}`);
    }
  });

  it("stops loading the AGENCY's business snapshot to render an editor panel", () => {
    // `coverage` was the last of the shared assistant on this path: clients,
    // pipelines and an agency-wide radar sweep, computed on every editor open
    // so a chat panel could show a "data coverage" strip that belonged to the
    // Advisor. An editor assistant is briefed on its PROJECT — that is what the
    // per-project `instructions` are for.
    const server = code(read("src", "engines", "editor", "server", "editorAssistant.ts"));
    for (const agencyWide of ["buildAssistantBusinessContext", "getCachedBusinessIssueRadar", "radarDigest"]) {
      assert.ok(!server.includes(agencyWide), `${agencyWide} is the agency's snapshot, not this project's`);
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

  it("gives every mode its own skin, so they cannot be confused for each other", async () => {
    const { MODE_SKINS } = await import("../src/components/editing/EditorModeSwitch");
    const ids = EDITING_MODES.map(mode => mode.id);
    for (const id of ids) {
      assert.ok(MODE_SKINS[id], `${id} has no skin`);
      assert.match(MODE_SKINS[id].accent, /^#[0-9a-f]{6}$/i, `${id}'s accent is not a colour`);
    }
    // Identical-looking modes are modes you must READ to tell apart.
    const accents = new Set(ids.map(id => MODE_SKINS[id].accent));
    assert.equal(accents.size, ids.length, "two modes share an accent");
  });

  it("puts the depth switch in the top bar, not buried in the rail", () => {
    const studio = read("src", "engines", "editor", "DevEditor.tsx");
    assert.match(studio, /<EditorModeSwitch/);
    // …and the surface repaints with the mode rather than one control.
    assert.match(studio, /data-editing-mode=\{editingModeId\}/);
    assert.match(studio, /--mode-accent/);
  });

  it("plays the cutscene only on a CHANGE, and only when motion is wanted", () => {
    const sw = read("src", "components", "editing", "EditorModeSwitch.tsx");
    assert.match(sw, /cinematicModeEnabled\(\)/, "respects cinematic mode");
    assert.match(sw, /prefers-reduced-motion/, "respects reduced motion");
    // An IDEMPOTENT value compare, not a one-shot boolean: React 19 Strict Mode
    // invokes the effect twice on mount and would spend the boolean on the first.
    assert.match(sw, /seenMode\.current === mode\) return/, "arriving is not a transition");
    assert.match(sw, /pointer-events-none/, "a cutscene must never swallow a click");
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
