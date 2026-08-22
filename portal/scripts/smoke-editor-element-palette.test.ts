// ─── PHASE 2 — mounting the block library in the Dev Editor ─────────────────
//
// Ed: "the visual editor components are lost … i cant select and build anything
// what the hell is going on."
//
// Nothing was lost. THREE separate things kept the vocabulary out of the
// editor, and this file pins each one so none of them can come back:
//
//   1. REGISTRATION IS AN IMPORT SIDE EFFECT. `blockRegistry.ts` calls
//      `registerElementDefinitions` at module scope, and nothing in the
//      editor's bundle imported it — so `listElementDefinitions("website")`
//      answered [] there, correctly, forever.
//   2. THE PALETTE WAS A HARDCODED PORTAL LIST. `DevEditor` read
//      `CLIENT_PORTAL_BLOCK_REGISTRY` and only that, so the add menu on a
//      non-portal project had literally nothing in it.
//   3. THE BUILDER TAB WAS GATED ON `portalTarget`, which is false for every
//      project Ed creates — so the tab did not even render.
//
// The IMPORTANT ordering detail in this file: the very first thing it does is
// count the website definitions, BEFORE anything has awaited the loader. That
// number must be 0. If a future import at the top of this file pulls the
// plugin in transitively, that assertion fails and tells you the split was
// lost — which is the whole point of `websiteVocabulary.ts`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { listElementDefinitions } from "../src/engines/editor/elements/registry.ts";
import {
  PORTAL_CATEGORY_LABELS,
  WEBSITE_CATEGORY_LABELS,
  WEBSITE_CATEGORY_ORDER,
  elementLibrarySentence,
  elementPalette,
  elementPaletteGroups,
  elementSurfaceFor,
} from "../src/engines/editor/elements/palette.ts";
import { ensureWebsiteElements, websiteElementsReady } from "../src/engines/editor/elements/websiteElements.ts";
import { CLIENT_PORTAL_BLOCK_REGISTRY, createPortalBlock } from "../src/lib/portal/clientPortalBuilder.ts";
import { inspectorTabsFor, EDITING_MODES, type EditingMode } from "../src/engines/editor/editing/modes.ts";

/** Counted at import time, before anything can have loaded the plugin. */
const WEBSITE_DEFINITIONS_AT_IMPORT = listElementDefinitions("website").length;
const READY_AT_IMPORT = websiteElementsReady();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const editor = read("src", "engines", "editor", "DevEditor.tsx");
const modes = read("src", "engines", "editor", "editing", "modes.ts");
const loader = read("src", "engines", "editor", "elements", "websiteElements.ts");
const vocabulary = read("src", "engines", "editor", "elements", "websiteVocabulary.ts");
const palette = read("src", "engines", "editor", "elements", "palette.ts");

/** Comments stripped, so a comment ABOUT a mistake never reads as the mistake. */
const editorCode = editor
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

// Three since 2026-08-22 — "Just the words" merged into Visual.
const ALL_MODES: EditingMode[] = ["assist", "visual", "developer"];

// ─── 1. The side effect, and paying for it only when it is needed ───────────

describe("the website vocabulary loads on demand", () => {
  it("is genuinely absent until something asks for it", () => {
    // If this fails, some import at the top of THIS file now pulls
    // `blockRegistry` in transitively — which means the editor's bundle would
    // pull it too, and the on-demand split is gone.
    assert.equal(WEBSITE_DEFINITIONS_AT_IMPORT, 0,
      "the website definitions arrived without anyone loading them — the chunk split is lost");
    assert.equal(READY_AT_IMPORT, false);
  });

  it("registers all 70 website definitions once awaited", async () => {
    await ensureWebsiteElements();
    // 70 is pinned in three other places already (the plugin's own
    // `blocks.test.ts`, `smoke-element-engine.test.ts`,
    // `smoke-website-visual-builder.test.ts`). This one exists to prove the
    // EDITOR's path reaches the same library, not a reduced copy of it.
    assert.equal(listElementDefinitions("website").length, 70);
    assert.equal(websiteElementsReady(), true);
  });

  it("is idempotent — a second call cannot duplicate a palette entry", async () => {
    await ensureWebsiteElements();
    const first = elementPalette("website").map(item => item.type);
    await ensureWebsiteElements();
    await ensureWebsiteElements();
    const second = elementPalette("website").map(item => item.type);
    assert.deepEqual(second, first);
    assert.equal(new Set(second).size, second.length, "a type appears twice in the palette");
  });

  it("reaches the plugin through ONE module, by a dynamic import", () => {
    // The dynamic hop must stay inside portal (CommonJS under tsx) space:
    // `src/built-ins/modules/website-editor/package.json` declares
    // `"type": "module"`, so importing the plugin file directly from an
    // `import()` crosses loaders and fails at instantiation with "does not
    // provide an export named 'getElementDefinition'". That failure is real —
    // it was reproduced before this indirection was written.
    assert.match(loader, /import\("\.\/websiteVocabulary"\)/);
    assert.equal(/import .*blockRegistry/.test(loader), false,
      "the loader must not reach the plugin itself, or there is nothing to split");
    assert.match(vocabulary, /^import "@\/built-ins\/modules\/website-editor\/src\/components\/blockRegistry";$/m);

    // …and it must be memoised, or every render starts another load.
    assert.match(loader, /loading \?\?= import\(/);
  });

  it("keeps the 78 block COMPONENTS lazy — the metadata is all that is pulled", () => {
    const registry = read("src", "built-ins", "modules", "website-editor", "src", "components", "blockRegistry.ts");
    assert.equal(registry.match(/lazyBlock\(/g)?.length, 78,
      "a block stopped being lazy — the editor chunk now carries a component");
    assert.equal(/^import \w+ from "\.\/blocks\//m.test(registry), false,
      "a static block import would drag that component into every bundle that reads the metadata");
  });
});

// ─── 2. One palette, filtered by surface ────────────────────────────────────

describe("the palette answers 'which vocabulary', not 'is there a portal'", () => {
  it("names the surface from the target", () => {
    assert.equal(elementSurfaceFor({ portalTarget: true }), "portal");
    assert.equal(elementSurfaceFor({ portalTarget: false }), "website");
  });

  it("does NOT regress the portal palette — same entries, order and headers", () => {
    const portal = elementPalette("portal");
    assert.equal(portal.length, CLIENT_PORTAL_BLOCK_REGISTRY.length);
    portal.forEach((item, index) => {
      const existing = CLIENT_PORTAL_BLOCK_REGISTRY[index];
      assert.equal(item.type, existing.type, `portal palette drifted at index ${index}`);
      assert.equal(item.label, existing.label);
      assert.equal(item.description, existing.description);
      assert.equal(item.group, PORTAL_CATEGORY_LABELS[existing.category]);
    });
    // The exact group headers the add menu wrote inline before this module.
    assert.deepEqual(
      [...new Set(portal.map(item => item.group))].sort(),
      ["Content blocks", "Layout", "Live data"],
    );
  });

  it("only offers portal types a portal page can actually store", () => {
    // The add menu calls `createPortalBlock(item.type)`. A palette entry whose
    // type is not a `ClientPortalBlockType` would write a block the renderer
    // has never heard of, which is exactly what using
    // `listElementDefinitions("portal")` here would have done — that returns
    // the SHARED names (`banner`, `text`), not the portal's (`callout`,
    // `rich-text`).
    for (const item of elementPalette("portal")) {
      const block = createPortalBlock(item.type as Parameters<typeof createPortalBlock>[0]);
      assert.equal(block.type, item.type);
      assert.ok(block.id, `${item.type} produced a block with no id`);
    }
    const portalTypes = new Set(elementPalette("portal").map(item => item.type));
    assert.equal(portalTypes.has("banner"), false, "that is the website's name for callout");
    assert.equal(portalTypes.has("system-content"), false, "the passthrough shim is not insertable");
  });

  it("offers the website surface its own 70, grouped in catalogue order", async () => {
    await ensureWebsiteElements();
    const website = elementPalette("website");
    assert.equal(website.length, 70);
    for (const item of website) {
      assert.ok(item.label, `${item.type} has no label`);
      assert.ok(item.icon, `${item.type} has no icon`);
      assert.ok(Object.values(WEBSITE_CATEGORY_LABELS).includes(item.group), `${item.type} landed in "${item.group}"`);
    }
    // Category order, not registration order — a palette reads by section.
    const seen = [...new Set(website.map(item => item.group))];
    const expected = WEBSITE_CATEGORY_ORDER.map(category => WEBSITE_CATEGORY_LABELS[category]).filter(label => seen.includes(label));
    assert.deepEqual(seen, expected);
  });

  it("keeps the two surfaces apart in both directions", async () => {
    await ensureWebsiteElements();
    const website = new Set(elementPalette("website").map(item => item.type));
    // Portal-only concepts must never be offered on a marketing site.
    assert.equal(website.has("approval-panel"), false);
    assert.equal(website.has("file-upload"), false);
    // …and a checkout is not a thing a client portal page composes.
    assert.equal(elementPalette("portal").some(item => item.type === "checkout-summary"), false);
    // The website surface really is the shared registry, filtered — not a
    // curated subset somebody typed out here.
    assert.deepEqual(
      [...website].sort(),
      listElementDefinitions("website").map(def => def.type).sort(),
    );
  });

  it("groups without losing anything, and keeps each group in surface order", async () => {
    await ensureWebsiteElements();
    for (const surface of ["portal", "website"] as const) {
      const flat = elementPalette(surface);
      const groups = elementPaletteGroups(surface);
      const grouped = groups.flatMap(group => group.items);
      // Nothing gained, nothing dropped.
      assert.deepEqual(grouped.map(item => item.type).sort(), flat.map(item => item.type).sort(), `${surface} lost an entry when grouped`);
      // Grouping DOES gather — the portal's categories interleave in its
      // palette order, and this is the same first-seen gathering `AddMenu`
      // has always done. What must not change is the order INSIDE a group,
      // and the order the headers appear in.
      for (const group of groups) {
        const inSurfaceOrder = flat.filter(item => item.group === group.group).map(item => item.type);
        assert.deepEqual(group.items.map(item => item.type), inSurfaceOrder, `${surface} reordered inside "${group.group}"`);
      }
      assert.deepEqual(groups.map(group => group.group), [...new Set(flat.map(item => item.group))]);
    }
  });

  it("hands the add menu the FLAT palette, so the portal order survives", () => {
    // `PORTAL_ELEMENT_PAIRINGS` says it out loud: ORDER IS LOAD-BEARING.
    const editorSource = read("src", "engines", "editor", "DevEditor.tsx");
    assert.match(editorSource, /const paletteItems = useMemo\(\s*\(\) => elementPalette\(elementSurface\)/);
  });
});

// ─── 3. Saying what is true about placing one ───────────────────────────────

describe("the library says where an element can actually go", () => {
  it("tells a portal it has a page, or that it does not", () => {
    assert.match(
      elementLibrarySentence({ surface: "portal", hasPortalDocument: true, tagMapped: false, count: 16 }),
      /Adding one puts it on the page you are looking at/,
    );
    assert.match(
      elementLibrarySentence({ surface: "portal", hasPortalDocument: false, tagMapped: false, count: 16 }),
      /nowhere to put one yet/,
    );
  });

  it("says 'loading' rather than 'none' while the chunk is in flight", () => {
    assert.match(
      elementLibrarySentence({ surface: "website", hasPortalDocument: false, tagMapped: false, count: 0 }),
      /Loading/,
    );
  });

  it("blames the missing Aqua Tag, and still offers the write path", () => {
    // REWRITTEN 2026-08-22 (phase 7). This sentence used to end at "connect
    // the tag first". Inserting an element now writes source onto the draft
    // branch, and that path needs a repository, not a tag — so no-tag means
    // no browser, never "nothing can be placed".
    const sentence = elementLibrarySentence({ surface: "website", hasPortalDocument: false, tagMapped: false, count: 70 });
    assert.match(sentence, /70 elements/);
    assert.match(sentence, /no Aqua Tag answers/);
    assert.match(sentence, /Settings/);
    assert.match(sentence, /draft branch/);
  });

  it("promises the insert through GIT, never through the tag", () => {
    // REWRITTEN 2026-08-22 — the change IS phase 7's point. The old pin held
    // "Placing a NEW element … is not wired yet"; now it is wired, as a
    // commit (emit.ts → sourceInsert.ts → repo-write's insert pair). What
    // must never change: the tag protocol still has no insert message, so the
    // sentence must not claim the LOADED PAGE changes when an element is
    // inserted — the draft branch changes, and the page follows a deploy.
    const sentence = elementLibrarySentence({ surface: "website", hasPortalDocument: false, tagMapped: true, count: 70 });
    assert.equal(/not wired yet/.test(sentence), false, "the insert path exists now — this sentence must say so");
    assert.match(sentence, /selections and text patches, not inserts/);
    assert.match(sentence, /draft branch/);
    assert.match(sentence, /not on the spot/);
  });
});

// ─── 4. The three questions, kept apart ─────────────────────────────────────

describe("inspectorTabsFor separates vocabulary, document and tag", () => {
  it("offers the Builder on a repository — the bug Ed reported", () => {
    for (const mode of ["visual", "developer"] as EditingMode[]) {
      for (const tagMapped of [true, false]) {
        assert.ok(
          inspectorTabsFor(mode, { portalTarget: false, tagMapped }).includes("builder"),
          `${mode} (tagMapped=${tagMapped}) still hides the Builder on a repository`,
        );
      }
    }
    // …and only where the depth genuinely offers it. ("simple" stood here
    // until it merged into Visual, 2026-08-22 — Visual is asserted above.)
    for (const mode of ["assist"] as EditingMode[]) {
      assert.equal(inspectorTabsFor(mode, { portalTarget: false, tagMapped: true }).includes("builder"), false);
      assert.equal(EDITING_MODES.find(entry => entry.id === mode)!.tabs.includes("builder"), false);
    }
  });

  it("keeps the portal-DOCUMENT tabs gated on a portal document", () => {
    const onARepository = inspectorTabsFor("developer", { portalTarget: false, tagMapped: true });
    for (const tab of ["pages", "brand", "versions", "code"]) {
      assert.equal(onARepository.includes(tab as never), false, `${tab} needs a portal document`);
    }
    // The Librarian joined Dev on every target (2026-08-22) — it finds files
    // and needs no portal document, so it rightly survives this gate.
    // ── REWRITTEN for phase 14 (2026-08-22): drafts/history/notes joined ──
    // The work-lifecycle trio rides the REPOSITORY (the draft is the edit
    // branch), so they too survive the portal-document gate, by design.
    assert.deepEqual(onARepository, ["assistant", "settings", "builder", "element", "repository", "drafts", "history", "notes", "librarian"]);
  });

  it("shows the words panel exactly once off a portal", () => {
    // "content" off a portal IS the Element panel. It is offered only in the
    // depth that has no Element tab, so the same panel never appears twice.
    const assist = inspectorTabsFor("assist", { portalTarget: false, tagMapped: true });
    assert.deepEqual(assist, ["assistant", "settings", "content"]);
    for (const mode of ["visual", "developer"] as EditingMode[]) {
      const tabs = inspectorTabsFor(mode, { portalTarget: false, tagMapped: true });
      assert.equal(tabs.includes("content"), false, `${mode} shows Element and Content — the same panel twice`);
      assert.ok(tabs.includes("element"));
    }
    // With no tag there are no words at all.
    assert.deepEqual(inspectorTabsFor("assist", { portalTarget: false, tagMapped: false }), ["assistant", "settings"]);
  });

  it("changes NOTHING on a portal target", () => {
    // Regression guard. The portal door's tab sets are exactly what they were
    // before the builder/content gates moved — minus the "simple" row, which
    // left with the mode when it merged into Visual (2026-08-22), and PLUS
    // the phase-14 lifecycle trio (drafts/history/notes, 2026-08-22 evening),
    // which joined the DEVELOPER row on every target the same way the
    // Librarian did. The shallower depths are untouched — that is the pin.
    assert.deepEqual(inspectorTabsFor("assist", { portalTarget: true, tagMapped: false }), ["assistant", "settings", "content"]);
    assert.deepEqual(inspectorTabsFor("visual", { portalTarget: true, tagMapped: false }),
      ["assistant", "settings", "builder", "content", "pages", "brand", "versions"]);
    assert.deepEqual(inspectorTabsFor("developer", { portalTarget: true, tagMapped: false }),
      ["assistant", "settings", "builder", "content", "pages", "brand", "code", "repository", "drafts", "history", "notes", "librarian", "versions"]);
    assert.equal(inspectorTabsFor("developer", { portalTarget: true, tagMapped: true }).length, 14);
  });

  it("never offers a tab the depth does not have, on any target", () => {
    for (const mode of ALL_MODES) {
      for (const portalTarget of [true, false]) {
        for (const tagMapped of [true, false]) {
          for (const tab of inspectorTabsFor(mode, { portalTarget, tagMapped })) {
            if (tab === "settings") continue;
            assert.ok(EDITING_MODES.find(entry => entry.id === mode)!.tabs.includes(tab),
              `${mode} offered ${tab}, which that depth does not have`);
          }
        }
      }
    }
  });

  it("renamed the set so nobody re-conflates the two questions", () => {
    assert.equal(/PORTAL_ONLY_TABS/.test(modes), false);
    assert.match(modes, /const PORTAL_DOCUMENT_TABS = new Set<InspectorTab>\(/);
    assert.match(modes, /if \(tab === "builder"\) return true;/);
  });
});

// ─── 5. The editor really is wired to it ────────────────────────────────────

describe("DevEditor mounts the shared registry rather than a list of its own", () => {
  it("does not statically import the 78-block module", () => {
    assert.equal(/from "@\/built-ins\/modules\/website-editor/.test(editor), false,
      "a static import puts the whole block metadata table in the editor's first paint");
    assert.match(editorCode, /ensureWebsiteElements\(\)/);
    // …and the readiness flag must start false rather than seeded from the
    // registry. It is a module-level Map shared by the whole server process,
    // so a visitor who opened SOP Library first (a static `blockRegistry`
    // import) would have it populated server-side and empty in the browser —
    // two different trees for the same markup.
    assert.match(editorCode, /useState\(false\);\n  useEffect\(\(\) => \{\n    if \(elementSurface === "portal"\) return;/);
    assert.equal(/websiteElementsReady\(\)/.test(editorCode), false);
  });

  it("drives the palette off the surface, not off a hardcoded list", () => {
    assert.match(editorCode, /const elementSurface = elementSurfaceFor\(\{ portalTarget \}\)/);
    assert.match(editorCode, /elementPaletteGroups\(elementSurface\)/);
    // The add menu's entries now come from the palette on BOTH surfaces.
    assert.equal(/CLIENT_PORTAL_BLOCK_REGISTRY\.map\(item => \(\{\s*id: item\.type/.test(editorCode), false,
      "the add menu is back on the portal-only registry");
    assert.match(editorCode, /return paletteItems\.map\(item => \(\{/);
  });

  it("loads the vocabulary only for a target that speaks it", () => {
    assert.match(editorCode, /if \(elementSurface === "portal"\) return;[\s\S]{0,200}?ensureWebsiteElements\(\)/);
  });

  it("renders the Builder ABOVE the portal-document guard", () => {
    // Below it, pressing Builder on a repository printed "These tools apply to
    // an Aqua-hosted portal" — which is the visible half of the complaint.
    const builderAt = editorCode.indexOf('if (tab === "builder")');
    const guardAt = editorCode.indexOf("if (!document || !record) {");
    assert.ok(builderAt > 0 && guardAt > 0);
    assert.ok(builderAt < guardAt, "the Builder branch sits below the portal-document guard again");
    assert.match(editorCode, /<ElementLibraryInspector/);
    assert.match(editorCode, /<PortalBuilderInspector/);
  });

  it("prints the library sentence rather than a paraphrase of it", () => {
    assert.match(editorCode, /const sentence = elementLibrarySentence\(\{/);
    assert.match(editorCode, /body=\{sentence\}/);
  });

  it("keeps the engine free of a plugin import", () => {
    // `websiteVocabulary.ts` is the ONE exception, and it exists to be that.
    assert.equal(/built-ins/.test(palette), false, "the palette must not import the plugin");
    assert.equal(/built-ins/.test(read("src", "engines", "editor", "elements", "registry.ts").replace(/\/\/.*$/gm, "")), false);
  });
});
