// ONE editor, N targets.
//
// Ed's call: there are no separate portal / website / code editors any more —
// there is one Dev Editor that ADAPTS to what it is pointed at. The bug this
// pins was the editor loading a client portal because you opened a repository:
// the client selector, "Editing X's portal draft", Save draft / Publish and the
// Content/Pages/Brand inspectors all appeared for a `software` project, and a
// portal design was FETCHED for it.
//
// Source-level assertions on purpose: the behaviour is a set of gates inside a
// 1300-line client component, and the thing worth pinning is that each gate
// still exists.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectorTabsFor } from "../src/engines/editor/editing/modes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const studio = read("src", "engines", "editor", "DevEditor.tsx");
const devRoute = read("src", "app", "portal", "dev-team", "editor", "studio", "page.tsx");
const modes = read("src", "engines", "editor", "editing", "modes.ts");

describe("the editor adapts to its target", () => {
  it("REWRITTEN PIN — knows what it is pointed at, from what is CONNECTED", () => {
    // WAS: `const portalTarget = projectKind !== "software"`.
    //
    // The prop and the route still carry `kind` (it seeds two opening
    // defaults), so those two assertions stand. The THIRD one is rewritten: a
    // project saved as "website" or "portal" — the field's other two values —
    // made portalTarget true and sent the navigator and the SEO panel into
    // some other client's portal document. "Is there a portal document
    // behind this?" is now answered by whether a dev project is open at all,
    // which is what `DevProject.kind`'s own comment has said all along.
    assert.match(studio, /projectKind\?: "software" \| "website" \| "portal"/);
    assert.match(studio, /const portalTarget = !projectId;/);
    assert.equal(/const portalTarget = projectKind/.test(studio), false);
    assert.match(devRoute, /projectKind=\{project\?\.kind\}/, "the route must pass the kind through");
  });

  it("does NOT fetch a portal design for a repository", () => {
    // The actual bug: opening a repo loaded somebody's portal draft.
    assert.match(studio, /if \(!portalTarget\) \{[\s\S]{0,400}?setPortalDocument\(null\)/);
  });

  it("hides every portal-DOCUMENT inspector for a repository", () => {
    // "code" is the PORTAL's custom CSS/JS layer, not the repository (that is
    // the Repo tab), so it belongs to the document too.
    //
    // The rule MOVED — it lives in `editing/modes.ts` as `inspectorTabsFor`
    // now, so that it can be tested as a function rather than asserted as a
    // regex over a 2,500-line component. Same rule, testable home.
    //
    // ── CHANGED, deliberately, and this test changed with it ──────────────
    // `builder` used to be in this set, and that was the bug behind Ed's "the
    // visual editor components are lost … i cant select and build anything".
    // The Builder tab asks WHICH VOCABULARY the target speaks — a different
    // question from "is there a portal document?" — and every target has one.
    // So `builder` is no longer portal-gated and this test no longer pins it
    // as portal-only. The document tabs below are unchanged.
    assert.match(modes, /const PORTAL_DOCUMENT_TABS = new Set<InspectorTab>\(\[[\s\S]{0,200}?"code",\n\]\);/);
    assert.match(modes, /return target\.portalTarget \|\| !PORTAL_DOCUMENT_TABS\.has\(tab\)/);
    assert.equal(/PORTAL_ONLY_TABS/.test(modes), false, "the old name conflated two questions");
    // REWRITTEN 2026-08-22 (phase 9): the call gained the SURFACE argument —
    // Website vs Normal, a second axis alongside the depth. The portal-document
    // gate this test is about is untouched by it; the pin is widened so the
    // call site is still held, not dropped because it moved.
    assert.match(studio, /inspectorTabsFor\(editingModeId, \{ portalTarget, tagMapped, surface \}\)/);

    // …and the behaviour itself, which the regexes above only stand in for.
    // Both surfaces, because a portal-document tab must stay portal-gated on
    // either one — the Website surface adds SEO, it does not unlock the portal.
    for (const surface of ["normal", "website"] as const) {
      const onARepository = inspectorTabsFor("developer", { portalTarget: false, tagMapped: true, surface });
      for (const portalOnly of ["pages", "brand", "versions", "code"]) {
        assert.equal(onARepository.includes(portalOnly as never), false,
          `${portalOnly} needs a portal document and must not be offered on a repository (${surface})`);
      }
    }
    const onARepository = inspectorTabsFor("developer", { portalTarget: false, tagMapped: true, surface: "normal" });
    // Dev has the repo tools AND the vocabulary — which is the whole point.
    // The Librarian joined Dev on every target (2026-08-22) — it finds files
    // and needs no portal document, so it rightly survives this gate.
    // ── REWRITTEN for phase 14 (2026-08-22): drafts/history/notes joined ──
    // The work lifecycle rides the REPOSITORY (the draft is the edit branch),
    // so a repository target is exactly where these three tabs matter most —
    // they too survive the portal-document gate, by design.
    assert.deepEqual(onARepository, ["assistant", "settings", "builder", "element", "repository", "drafts", "history", "notes", "librarian"]);
  });

  it("hides draft/publish for a repository — they move a PORTAL, not a repo", () => {
    assert.match(studio, /\{portalTarget \? \([\s\S]{0,600}?Save draft/);
  });

  it("does not demand a client record before opening a repository", () => {
    // The studio used to refuse to mount at all without a client.
    assert.match(studio, /if \(!clients\.length && portalTarget\)/);
  });

  it("opens a repository at the depth where its tools actually are", () => {
    // "Design it" offers a repo nothing but the assistant.
    assert.match(studio, /projectKind === "software" && developerModeAvailable \? "developer" : "visual"/);
    // The browser is a toggle now, so a repo simply has no browser pane
    // (portalTarget is false); there is no canvas-view string to assert.
    // The browser is part of the ONE editor, not a portal privilege — it is
    // always toggleable, and takes a URL when there is no portal behind it.
    assert.match(studio, /const browserPane = showBrowser/);
  });
});
