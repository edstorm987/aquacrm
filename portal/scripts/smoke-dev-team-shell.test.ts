// Dev Team shell — the five shell fixes that live in the Dev Team layout and the
// shared Topbar (see docs/development/plans/dev-team-librarian-and-assistants.md):
//
//   1. Librarian drawer — the layout passes its OWN advisorControl (a reskin of
//      the Advisor over the SAME side-panel drawer), so the Topbar never falls
//      through to the full-page /portal/agency/assistant link.
//   2. Role-dependent "Back to home" — the exit link uses resolvePostLoginPath +
//      "Back to home", not a hardcoded href="/" or /portal/agency.
//   3. "Leave Dev Team" is gone from the sidebar (the topbar is the way out).
//   4. Editor is a first-class sidebar item.
//   5. Team chat is a sidebar item + page.
//
// These are WIRING pins over source, the honest check for shell composition
// (props passed, items present/absent) that no behavioural unit test covers.
// Each assertion fails on the pre-change source.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const LAYOUT = "src/app/portal/dev-team/layout.tsx";
const TOPBAR = "src/components/chrome/Topbar.tsx";
const LIBRARIAN = "src/components/chrome/LibrarianDrawerControl.tsx";
const DRAWER = "src/components/chrome/GlobalAdvisorDrawer.tsx";
const ADVISOR = "src/components/chrome/AdvisorDrawerControl.tsx";
const CHAT_PAGE = "src/app/portal/dev-team/chat/page.tsx";

describe("Dev Team shell — Librarian drawer", () => {
  it("the layout passes a Librarian advisorControl, not the agency fallback", () => {
    const src = read(LAYOUT);
    assert.match(src, /import \{ LibrarianDrawerControl \} from "@\/components\/chrome\/LibrarianDrawerControl"/);
    assert.match(src, /advisorControl=\{<LibrarianDrawerControl\b/);
  });

  it("the Librarian control exists and opens the SAME drawer (not a full page)", () => {
    assert.ok(existsSync(join(ROOT, LIBRARIAN)), "LibrarianDrawerControl.tsx must exist");
    const src = read(LIBRARIAN);
    // Reuses the GlobalAdvisorDrawer machinery — a side panel, not navigation.
    assert.match(src, /import \{ GlobalAdvisorDrawer \} from "@\/components\/chrome\/GlobalAdvisorDrawer"/);
    assert.doesNotMatch(src, /href="\/portal\/agency\/assistant"/, "Librarian must not link to the full-page agency assistant");
    // Reskinned to the Librarian identity, with a picker seam for later assistants.
    assert.match(src, /assistantName="Librarian"/);
    assert.match(src, /pickerHeader=/);
  });

  it("the drawer defaults keep every agency/clients caller on the Aqua Advisor", () => {
    const drawer = read(DRAWER);
    assert.match(drawer, /assistantName = "Aqua Advisor"/);
    assert.match(drawer, /label = "Advisor"/);
    // The agency control passes no reskin props → stays the Advisor.
    const advisor = read(ADVISOR);
    assert.doesNotMatch(advisor, /assistantName/);
    assert.doesNotMatch(advisor, /Librarian/);
  });
});

describe("Dev Team shell — role-dependent Back to home", () => {
  it("the layout exits via resolvePostLoginPath + 'Back to home'", () => {
    const src = read(LAYOUT);
    assert.match(src, /import \{ resolvePostLoginPath \} from "@\/lib\/server\/auth\/postLoginRedirect"/);
    assert.match(src, /homeHref=\{resolvePostLoginPath\(session\)\}/);
    assert.match(src, /homeLabel="Back to home"/);
  });

  it("Topbar's new home props default to the old 'Back to website' / '/'", () => {
    const src = read(TOPBAR);
    assert.match(src, /homeHref\?: string/);
    assert.match(src, /homeLabel\?: string/);
    // Defaults preserve today's behaviour for callers that pass neither prop.
    assert.match(src, /homeHref \?\? "\/"/);
    assert.match(src, /homeLabel \?\? "Back to website"/);
  });
});

describe("Dev Team shell — sidebar items", () => {
  const src = read(LAYOUT);
  // The shipyard token block + cutscene CSS live in a server <style> whose
  // comments legitimately still name the old "Leave Dev Team"/`/portal/agency`
  // exit — that block is off-limits to this lane, so strip it before asserting
  // the SIDEBAR (the tsx) no longer carries the item.
  const sidebar = src.replace(/<style>\{`[\s\S]*?`\}<\/style>/g, "");

  it("the inline style blocks carry no literal angle-bracket style/script text", () => {
    // React 19 CSS-escapes `<` inside a server-rendered <style> ("<\\73 tyle>")
    // but the client render does not — one such sequence in a CSS COMMENT
    // failed hydration for EVERY dev-team page, regenerating the whole tree
    // client-side on each load. Comments must spell it without the bracket.
    for (const match of src.matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)) {
      assert.doesNotMatch(match[1], /<(?:style|script|\/)/i,
        "inline <style> contents must not contain literal <style>/<script>/</ sequences");
    }
  });

  it("removes the 'Leave Dev Team' exit item (and its hardcoded /portal/agency bug)", () => {
    assert.doesNotMatch(sidebar, /exit-dev-team/);
    assert.doesNotMatch(sidebar, /Leave Dev Team/);
    // The old exit item pointed the sidebar link at /portal/agency; gone now.
    assert.doesNotMatch(sidebar, /href: "\/portal\/agency"/);
  });

  it("adds an Editor sidebar item at the editor route", () => {
    assert.match(src, /id: "editor".*href: "\/portal\/dev-team\/editor"/s);
  });

  it("adds a Team chat sidebar item at the chat route, with a page that mounts TeamChat", () => {
    assert.match(src, /id: "chat".*href: "\/portal\/dev-team\/chat"/s);
    assert.ok(existsSync(join(ROOT, CHAT_PAGE)), "chat/page.tsx must exist");
    const page = read(CHAT_PAGE);
    assert.match(page, /import \{ TeamChat \} from "@\/components\/people\/TeamChat"/);
    assert.match(page, /<TeamChat \/>/);
  });
});
