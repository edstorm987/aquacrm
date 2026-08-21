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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const studio = read("src", "app", "portal", "agency", "portals", "editor", "_ClientPortalStudio.tsx");
const devRoute = read("src", "app", "portal", "dev-team", "editor", "studio", "page.tsx");

describe("the editor adapts to its target", () => {
  it("knows what it is pointed at", () => {
    assert.match(studio, /projectKind\?: "software" \| "website" \| "portal"/);
    assert.match(studio, /const portalTarget = projectKind !== "software"/);
    assert.match(devRoute, /projectKind=\{project\?\.kind\}/, "the route must pass the kind through");
  });

  it("does NOT fetch a portal design for a repository", () => {
    // The actual bug: opening a repo loaded somebody's portal draft.
    assert.match(studio, /if \(!portalTarget\) \{[\s\S]{0,400}?setPortalDocument\(null\)/);
  });

  it("hides every portal-only inspector for a repository", () => {
    // "code" is the PORTAL's custom CSS/JS layer, not the repository (that is
    // the Repo tab), so it is portal-only too.
    assert.match(studio, /PORTAL_ONLY_TABS = new Set\(\["builder", "content", "pages", "brand", "versions", "code"\]\)/);
    assert.match(studio, /portalTarget \|\| !PORTAL_ONLY_TABS\.has\(item\.id\)/);
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
    assert.match(studio, /projectKind === "software" \? "developer" : "visual"/);
    // The browser is a toggle now, so a repo simply has no browser pane
    // (portalTarget is false); there is no canvas-view string to assert.
    assert.match(studio, /const browserPane = portalTarget && showBrowser/);
  });
});
