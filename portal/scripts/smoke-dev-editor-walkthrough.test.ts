// THE 2026-08-22 WALKTHROUGH DEFECTS — pinned so they cannot return.
//
// Ed walked the editor in a live browser and hit four things at once
// (docs/development/plans/dev-editor-finish.md — phase 1 minus nesting, phase 8
// partials, and the walkthrough defects):
//
//   1. The editor's Settings tab rendered the ENTIRE projects screen — cream
//      `--dt-*` cards inside the dark editor, "Add a project" inside a project,
//      and an "Open editor" button INSIDE the editor.
//   2. The project switcher was a `w-full` select over every project in the
//      agency, rendered AFTER the mode switch, eating the header.
//   3. Every mode click white-flashed the browser pane for seconds.
//   4. The universal "+" existed only in the canvas header, not on the
//      inspector rail where the eye already is.
//
// These are source-level pins over the same components the defects lived in,
// plus the empirical finding behind (3): driving the REAL DevEditor in a
// browser (esbuild bundle, stubbed leaf panels, instrumented iframe) showed
// the iframe NEVER remounts on a mode click — one load event and one element
// identity across every switch. The white flash was the mode CUTSCENE: a
// full-screen `inset-0` wash plus a `backdrop-blur-md` card painted over the
// cross-origin iframe, which forces Chromium to re-raster the out-of-process
// frame — blanking it white for as long as the card is up. So what is pinned
// for (3) is the cutscene's shape, the iframe's stable key, and that a mode
// change touches no frame state.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const editor = read("src", "engines", "editor", "DevEditor.tsx");
const setup = read("src", "app", "portal", "dev-team", "editor", "setup", "_DevEditorSetup.tsx");
const modeSwitch = read("src", "components", "editing", "EditorModeSwitch.tsx");
const addMenu = read("src", "components", "editing", "AddMenu.tsx");

/** Source with comments stripped, so prose about a defect never reads as the defect. */
const code = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

// ─── 1. Settings is project-scoped and editor-native ─────────────────────────

describe("the editor's Settings tab configures ONLY the project you are in", () => {
  it("mounts the project-scoped panel, never the whole projects screen", () => {
    assert.match(editor, /<DevEditorProjectSettings projectId=\{projectId \?\? ""\}/);
    // Comments stripped first: the defect is NAMED in a warning comment, and
    // the warning must not read as the mount it warns about.
    assert.equal(/<DevEditorSetup\b/.test(code(editor)), false,
      "the editor must not mount the projects WORKSPACE inside its inspector");
  });

  it("one file exports both: the workspace screen and the editor panel", () => {
    assert.match(setup, /export function DevEditorSetup\(\)/);
    assert.match(setup, /export function DevEditorProjectSettings\(/);
  });

  // Everything below reads the editor panel's own slice of the file, so a
  // regression in the WORKSPACE half (which legitimately creates, deletes and
  // opens editors) cannot mask one in the editor half.
  const panelAt = setup.indexOf("export function DevEditorProjectSettings");
  const panel = setup.slice(panelAt);

  it("creates ONLY inside this project — never a new top-level one", () => {
    // ─── RULE CHANGE, SAID LOUDLY (phase 1 nesting, 2026-08-22) ─────────────
    // This pin used to ban creation from the panel outright ("Add a project"
    // absent), because nesting did not exist and an in-editor create would
    // have been WRONGLY TOP-LEVEL. Nesting now exists (`parentProjectId`, the
    // two-level rule in the store), and in-editor creation is Ed's whole
    // point: "from inside a project you can create another, and it is a child
    // of the project you are in, never a new top-level one." So what is
    // banned now is exactly the old defect in new clothes — a create this
    // panel could send WITHOUT pre-parenting it to the open project.
    assert.ok(panelAt > 0);
    const panelCode = code(panel);
    // Each match is one save's object literal: from the action line to the
    // first line that closes the object. Neither body nests braces, so the
    // non-greedy close is exact — and a rogue third save would be captured
    // and judged like the two legitimate ones.
    const saves = [...panelCode.matchAll(/action: "save",[\s\S]*?\n\s*\}/g)].map(match => match[0]);
    assert.ok(saves.length >= 2, "the panel has its update save and its create-inside");
    for (const save of saves) {
      assert.ok(
        /id: project\.id/.test(save) || /parentProjectId: project\.id/.test(save),
        `every save this panel can send is either THIS project's update or a child pre-parented to it — got: ${save.slice(0, 120)}`,
      );
    }
    assert.match(panel, /parentProjectId: project\.id/, "the create-inside names the open project as parent");
  });

  it("offers no other projects and no way to leave", () => {
    const panelCode = code(panel);
    assert.equal(panelCode.includes("Open editor"), false, "you are already inside the editor");
    assert.equal(/action: "delete"/.test(panelCode), false, "disconnecting a project is a workspace decision");
    assert.equal(/projects\.map\(/.test(panelCode), false, "no other project's card may render here");
    // The way to the rest is a LINK to the workspace, not an inline copy of it.
    assert.match(panel, /href="\/portal\/dev-team\/editor"/);
  });

  it("wears the editor's vocabulary — not one --dt-* token", () => {
    assert.equal(code(panel).includes("--dt-"), false,
      "cream dev-workspace tokens inside the dark editor was the defect");
    assert.match(panel, /--mode-accent/);
    assert.match(panel, /bg-black\/30/);
  });

  it("keeps the wardrobe honest: the editor skin carries no --dt-* either", () => {
    const skinsAt = setup.indexOf("editor: {");
    const skins = setup.slice(skinsAt, setup.indexOf("} as const", skinsAt));
    assert.ok(skinsAt > 0);
    assert.equal(code(skins).includes("--dt-"), false);
  });

  it("the config save still names THIS project's id", () => {
    // (Loosened from "the panel cannot create" when phase 1 nesting landed —
    // the panel now creates CHILDREN, pinned pre-parented above. The update
    // path is unchanged: it names the open project and nothing else.)
    assert.match(panel, /action: "save",\s*\n\s*id: project\.id,/);
  });

  it("still announces every mutation so the editor re-derives its browser", () => {
    const announcements = [...panel.matchAll(/announceProjectsChanged\(\);/g)];
    assert.ok(announcements.length >= 3, "save, map and check-tag must each announce");
  });

  it("the workspace keeps its full screen — creation, Open editor, --dt-*", () => {
    // The split must not have quietly gutted the OTHER half.
    const workspace = setup.slice(0, panelAt);
    assert.match(workspace, /Add a project/);
    assert.match(workspace, /Open editor/);
    assert.match(workspace, /--dt-ink/);
  });

  it("points at the Aqua Editor AI key without ever holding it", () => {
    assert.match(panel, /Aqua Editor AI key/);
    assert.match(panel, /aiConfigured/);
    assert.equal(/token|apiKey|secret/i.test(code(panel).replace(/aiConfigured/g, "")
      .replace(/agency token/g, "")), false,
      "the settings panel may know WHETHER a key is set, never the key");
  });
});

// ─── 2. The switcher: compact, scoped, before the mode switch ────────────────

describe("the project switcher is compact and scoped to where you are", () => {
  it("renders BEFORE the mode switch — where you are precedes how deep", () => {
    const switcher = editor.indexOf('aria-label="Dev project"');
    const modes = editor.indexOf("<EditorModeSwitch");
    assert.ok(switcher > 0 && modes > 0);
    assert.ok(switcher < modes, "the switcher moved after the mode switch again");
  });

  it("is compact — fixed width, mode-button height, never w-full", () => {
    const at = editor.indexOf('aria-label="Dev project"');
    const block = editor.slice(editor.lastIndexOf("{projects.length", at), editor.indexOf("</select>", at));
    assert.equal(/w-full/.test(block), false, "the w-full select ate the header once already");
    assert.match(block, /min-h-9/, "height matches the mode buttons");
    assert.match(block, /w-40/, "fixed, truncating width");
  });

  it("lists THIS project and the workspace — never the whole agency", () => {
    // `parentProjectId` does not exist yet; when it does, the children join
    // this list. Until then: current project + "This workspace" (when the door
    // is not locked to a client), and a LINK out for everything else.
    assert.equal(/projects\.map\(project => \(/.test(editor), false,
      "every project in the agency is the Projects workspace's list, not the switcher's");
    const at = editor.indexOf('aria-label="Dev project"');
    const block = editor.slice(editor.lastIndexOf("{projects.length", at), editor.indexOf("All projects", at));
    assert.match(block, /This workspace/);
    assert.match(block, /!lockToClient/, "a client-locked door must not offer the workspace");
  });

  it("offers 'All projects' as the way to unrelated projects", () => {
    const stripped = code(editor);
    const at = stripped.indexOf("All projects");
    assert.ok(at > 0);
    const around = stripped.slice(at - 400, at);
    assert.match(around, /href="\/portal\/dev-team\/editor"/);
  });

  it("still points the browser at the MAPPED address on a switch", () => {
    // The redirect-trust rule, restated where the switcher moved.
    assert.match(editor, /setBrowserUrl\(aquaTagBrowserUrl\(project\)\)/);
  });
});

// ─── 3. Mode switches leave the browser pane alone ───────────────────────────

describe("a mode click never touches the browser pane", () => {
  it("keeps the iframe's key free of any mode state", () => {
    // The frame remounts only when the operator refreshes (frameKey) or the
    // address changes (url) — never because the depth changed. Verified live:
    // one load event across every mode click.
    assert.match(editor, /key=\{`\$\{frameKey\}:\$\{url\}`\}/);
  });

  it("changeMode changes no frame state", () => {
    const at = editor.indexOf("function changeMode");
    const body = editor.slice(at, editor.indexOf("\n  }", at));
    assert.ok(at > 0);
    assert.equal(/setFrameKey|setBrowserUrl/.test(body), false,
      "switching depth must not reload or repoint the browser");
  });

  it("the cutscene is a toast, not a wash — and never a backdrop-filter", () => {
    // The actual cause of the walkthrough's white flash: `backdrop-blur-md`
    // over a cross-origin iframe forces the compositor to re-raster the
    // out-of-process frame, which blanks it white while the card is up. The
    // cutscene may not SAMPLE the page and may not cover it edge to edge.
    const sw = code(modeSwitch);
    assert.equal(/backdrop-blur/.test(sw), false, "no backdrop-filter over the live page");
    assert.equal(/fixed inset-0/.test(sw), false, "no full-screen wash over the browser pane");
    assert.match(modeSwitch, /left-1\/2 top-24/, "a compact toast under the top bar");
    assert.match(modeSwitch, /pointer-events-none/, "…that can never swallow a click");
  });
});

// ─── 4 & 5. The "+" on the rail, wearing the editor's colours ────────────────

describe("the universal + is on the inspector rail too", () => {
  it("the rail carries the same AddMenu as the canvas header", () => {
    const railAt = editor.indexOf('<nav aria-label="Inspector tools"');
    const rail = editor.slice(railAt, editor.indexOf("</nav>", railAt));
    assert.ok(railAt > 0);
    assert.match(rail, /<AddMenu/);
    assert.match(rail, /options=\{addOptions\}/, "same options — same per-target offer");
    assert.match(rail, /align="end"/, "the panel opens INTO the canvas, not off-screen");
    // Two mounts, one component, one options list.
    assert.equal(editor.match(/<AddMenu/g)?.length, 2);
  });

  it("the element-library popover wears the editor's colours", () => {
    // Seen live as a white panel with dark text; the panel is dark now and no
    // --dt-* token may creep in. AddMenu's only mounts are the editor's two.
    const menu = code(addMenu);
    assert.match(addMenu, /bg-\[#171a17\]/, "the popover ground is the editor's dark panel");
    assert.equal(menu.includes("--dt-"), false);
  });
});
