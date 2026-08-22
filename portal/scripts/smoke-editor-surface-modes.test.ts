// ─── PHASE 9 — SURFACE MODES: WEBSITE vs NORMAL, AND PER-PAGE SEO ────────────
//
//   Ed: "website mode im going to need a specialied thing to do the seo and
//   tags and everything like that per page... dont need a portal mode and then
//   normal mode can do portal and software or whatever as its just universal"
//
// TWO surfaces. No portal mode. The surface answers WHAT you are working on;
// the mode (phase 5) answers HOW DEEP you go. They are orthogonal and they
// multiply, and this file pins that they stay that way — because the disease
// this editor keeps catching is two different questions collapsed into one
// flag (`portalTarget = projectKind !== "software"` gated the browser off
// every project Ed makes).
//
// What is pinned here:
//
//   SURFACE     — the two, the tolerant resolver with its BY-NAME migrations,
//                 and the default DERIVED FROM WHAT IS CONNECTED (an Aqua Tag
//                 answering on a real address). Never from `projectKind`: a
//                 declared kind is a claim, a connected tag is evidence.
//   ORTHOGONAL  — "seo" is on NO mode's ladder. It is offered at every depth
//                 and only on the Website surface, and changing depth never
//                 throws you off it.
//   THE SEO     — the fields, what is wrong with them, and the ONE rule the
//                 source writer lives by: own a marked block, refuse
//                 everything else. A page that writes its own head is refused
//                 BY NAME rather than rewritten.
//   ROUND TRIP  — read(emit(x)) === x, both mechanisms, and every byte outside
//                 the markers unchanged. Without this the panel would show
//                 something other than what the page says and invite a "fix".
//   THE WRITE   — preview → confirm → the SAME `saveRepoFile` on the SAME
//                 draft branch as every other write. No SEO store, no second
//                 commit path. Driven against the stateful fake GitHub, so a
//                 commit that lost an edit would fail here.
//
// The stateful fake GitHub below is the smoke-element-insert one (lineage:
// smoke-repo-write → smoke-editor-words-publish), unchanged in behaviour.
// Same rule as its ancestors: commits go through the REAL `publishEdits` with
// only the socket replaced.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import { readFileSync } from "node:fs";

import {
  EDITOR_SURFACES,
  SURFACE_STORAGE_PREFIX,
  derivedSurface,
  editorSurface,
  loadSurfaceChoice,
  resolveSurface,
  saveSurfaceChoice,
  surfaceStorageKey,
} from "../src/engines/editor/editing/surfaces";
import {
  EDITING_MODES,
  INSPECTOR_TABS,
  SURFACE_TABS,
  inspectorTabsFor,
  tabForMode,
  tabForSurface,
  type EditingMode,
} from "../src/engines/editor/editing/modes";
import {
  EMPTY_PAGE_SEO,
  HTML_SEO_CLOSE,
  HTML_SEO_OPEN,
  PAGE_SEO_FIELDS,
  TS_SEO_CLOSE,
  TS_SEO_OPEN,
  emitHtmlSeoBlock,
  emitNextMetadataBlock,
  mechanismFields,
  mechanismRefusesField,
  normalisePageSeo,
  effectivePageSeo,
  governingLayout,
  pageSeoBlocked,
  pageSeoEquals,
  pageSeoFieldInert,
  pageSeoIsEmpty,
  pageSeoProblems,
  pageSeoWriteEquals,
  parseStructuredData,
  planPageSeoEdit,
  readPageSeo,
  seoMechanismFor,
  storedPageSeo,
  structuredDataScriptBody,
  type PageSeo,
} from "../src/engines/editor/editing/pageSeo";
import { repositoryRoutes } from "../src/engines/editor/editing/pageNavigator";
import { normalisePortalDesign, STUNNING_STANDARD_PORTAL } from "../src/lib/portal/clientPortalDesign";
import {
  readPageSeoFromRepo,
  saveRepoFile,
  writePageSeoToRepo,
  type RepoWriteDeps,
} from "../src/engines/editor/server/repoWrite";
import { editBranchName } from "../src/engines/editor/server/sourceEdit";
import { openPullRequest, publishEdits, type PublishRequest } from "../src/engines/editor/server/publish";
import { hashFile } from "../src/engines/editor/server/codeAdapter";
import type { RepoFile } from "../src/engines/editor/server/githubSource";
import { POST } from "../src/app/api/portal/dev/repo-write/route";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { DevProject } from "../src/server/types";

const EDITOR_FILE = new URL("../src/engines/editor/DevEditor.tsx", import.meta.url);
const SWITCH_FILE = new URL("../src/components/editing/SurfaceSwitch.tsx", import.meta.url);
const PANEL_FILE = new URL("../src/components/editing/PageSeoPanel.tsx", import.meta.url);
const SURFACES_FILE = new URL("../src/engines/editor/editing/surfaces.ts", import.meta.url);
const MODES_FILE = new URL("../src/engines/editor/editing/modes.ts", import.meta.url);

const editor = readFileSync(EDITOR_FILE, "utf8");

const MODES: EditingMode[] = ["assist", "visual", "developer"];

// ─── 1. THE SURFACE — two, and where the default comes from ──────────────────

describe("two surfaces, and no portal mode", () => {
  it("is exactly Website and Normal, Normal first", () => {
    // Ed: "dont need a portal mode and then normal mode can do portal and
    // software or whatever as its just universal". Normal leads because it is
    // the default and the wider of the two.
    assert.deepEqual(EDITOR_SURFACES.map(surface => surface.id), ["normal", "website"]);
    assert.deepEqual(EDITOR_SURFACES.map(surface => surface.label), ["Normal", "Website"]);
    for (const surface of EDITOR_SURFACES) {
      assert.ok(surface.summary.trim(), `${surface.id} has no summary`);
    }
  });

  it("MIGRATES by name — never by falling through to the default", () => {
    // The rule `editingMode` learned when "simple" merged into "visual": a
    // migration that only works because two rules coincide stops working the
    // day the default moves.
    assert.equal(editorSurface("site").id, "website");
    assert.equal(editorSurface("portal").id, "normal");
    assert.equal(editorSurface("software").id, "normal");
    assert.equal(editorSurface("WEBSITE").id, "website");
    assert.equal(editorSurface("  website ").id, "website");
    assert.equal(editorSurface("nonsense").id, "normal");
    assert.equal(editorSurface(undefined).id, "normal");
    assert.equal(editorSurface(null).id, "normal");
    assert.equal(editorSurface("").id, "normal");
  });
});

describe("the default is derived from what is CONNECTED, never from projectKind", () => {
  it("a tag answering on a real address IS a website, and the sentence names the host", () => {
    const answer = derivedSurface({ tagMapped: true, siteUrl: "https://beast-marks.vercel.app/pricing?ref=x" });
    assert.equal(answer.surface, "website");
    assert.match(answer.reason, /beast-marks\.vercel\.app/);
    assert.match(answer.reason, /Aqua Tag/);
  });

  it("every OTHER combination is Normal, and each says what is missing", () => {
    // A derivation that misses costs one click on a switcher that is right
    // there. A derivation that INVENTS puts an SEO panel over somebody's game.
    const noTag = derivedSurface({ siteUrl: "https://example.com" });
    assert.equal(noTag.surface, "normal");
    assert.match(noTag.reason, /no Aqua Tag answering on it yet/);
    assert.match(noTag.reason, /example\.com/);

    const tagNoSite = derivedSurface({ tagMapped: true });
    assert.equal(tagNoSite.surface, "normal");
    assert.match(tagNoSite.reason, /no site address recorded/);

    const portal = derivedSurface({ portalTarget: true });
    assert.equal(portal.surface, "normal");
    assert.match(portal.reason, /behind a login/);

    const repo = derivedSurface({ repository: "edstorm987/Beast-marks" });
    assert.equal(repo.surface, "normal");
    assert.match(repo.reason, /edstorm987\/Beast-marks/);

    const nothing = derivedSurface({});
    assert.equal(nothing.surface, "normal");
    assert.match(nothing.reason, /Nothing is connected yet/);
  });

  it("refuses to read a non-http address as a site", () => {
    for (const siteUrl of ["", "   ", "not a url", "file:///Users/ed/site", "javascript:alert(1)"]) {
      assert.equal(derivedSurface({ tagMapped: true, siteUrl }).surface, "normal", siteUrl);
    }
  });

  it("NEVER mentions projectKind — the field that caused half the bugs", () => {
    // Not a style rule. `projectKind` defaults to "software" on every project
    // Ed creates, so deriving anything from it is deriving from a claim
    // somebody typed once. The module may not even reference it.
    const source = readFileSync(SURFACES_FILE, "utf8");
    const signals = source.slice(source.indexOf("export function derivedSurface"));
    assert.equal(/projectKind/.test(signals), false, "derivedSurface must not read projectKind");
    // It is named in the header comment as the thing NOT to use, which is the
    // one mention allowed — and it must still be there, or the reason is lost.
    assert.match(source, /AND NOT `projectKind`/);
  });
});

describe("the operator's choice beats the evidence, and the line says both", () => {
  it("no choice → the derivation, with the derivation's own sentence", () => {
    const resolved = resolveSurface(null, { tagMapped: true, siteUrl: "https://x.dev" });
    assert.equal(resolved.surface, "website");
    assert.equal(resolved.chosen, false);
    assert.equal(resolved.derived, "website");
    assert.match(resolved.sentence, /x\.dev/);
  });

  it("a choice that DISAGREES wins, and the sentence carries both halves", () => {
    // "It keeps undoing my thing" is the bug this prevents: a person who
    // switched to Website on a project with no tag did that on purpose.
    const resolved = resolveSurface("website", { repository: "acme/site" });
    assert.equal(resolved.surface, "website");
    assert.equal(resolved.chosen, true);
    assert.equal(resolved.derived, "normal");
    assert.match(resolved.sentence, /because you chose it/);
    assert.match(resolved.sentence, /acme\/site/, "the evidence is still stated");
  });

  it("a choice that AGREES is not announced as an override", () => {
    const resolved = resolveSurface("website", { tagMapped: true, siteUrl: "https://x.dev" });
    assert.equal(resolved.chosen, true);
    assert.equal(/because you chose it/.test(resolved.sentence), false);
  });

  it("a corrupted stored value is still a valid surface, and an ABSENT one is not a choice", () => {
    assert.equal(resolveSurface("garbage", { tagMapped: true, siteUrl: "https://x.dev" }).surface, "normal");
    assert.equal(resolveSurface("", { tagMapped: true, siteUrl: "https://x.dev" }).chosen, false,
      "an empty string is nothing stored — the derivation must still get its turn");
  });
});

describe("remembering the choice, per project", () => {
  it("keys per scope, and answers null with no window rather than throwing", () => {
    assert.equal(surfaceStorageKey("proj_1"), `${SURFACE_STORAGE_PREFIX}:proj_1`);
    // The portals door opens with no project — the same `"portal"` scope the
    // device state uses, so the two cannot disagree about what "no project" is.
    assert.equal(surfaceStorageKey(""), `${SURFACE_STORAGE_PREFIX}:portal`);
    assert.equal(loadSurfaceChoice("proj_1"), null);
    assert.doesNotThrow(() => saveSurfaceChoice("website", "proj_1"));
  });

  it("only an explicit choice is ever written — the DERIVED surface never is", () => {
    // Storing a guess turns it into a choice, and then a project that later
    // gets a tag stays Normal for ever because the editor wrote its own guess
    // down as if a person had made it.
    assert.match(editor, /function changeSurface\(next: EditorSurface\) \{[\s\S]{0,220}saveSurfaceChoice\(next, surfaceScope\)/);
    const saves = editor.match(/saveSurfaceChoice\(/g) ?? [];
    assert.equal(saves.length, 1, "exactly one place writes the surface, and it is the switcher");
  });
});

// ─── 2. ORTHOGONAL TO THE MODES ──────────────────────────────────────────────

describe("the surface axis and the depth axis do not touch", () => {
  it("REWRITTEN PIN — the rail now has 15 tabs; 'seo' sits after 'brand'", () => {
    // Was 14. The new one is surface-owned (phase 9), so it is added to
    // INSPECTOR_TABS and to no mode's ladder — see the next test.
    assert.equal(INSPECTOR_TABS.length, 15);
    assert.equal(INSPECTOR_TABS.indexOf("seo"), INSPECTOR_TABS.indexOf("brand") + 1);
    assert.ok(INSPECTOR_TABS.indexOf("seo") < INSPECTOR_TABS.indexOf("code"));
  });

  it("'seo' is on NO mode's ladder — that is what makes it orthogonal", () => {
    for (const mode of EDITING_MODES) {
      assert.equal(mode.tabs.includes("seo"), false, `${mode.id} must not carry seo on its ladder`);
    }
    assert.deepEqual([...SURFACE_TABS], ["seo"]);
  });

  it("Website offers it at EVERY depth; Normal never does", () => {
    // There is no shallower or deeper way to give a page a title. Somebody in
    // "Just tell it" who came to fix a meta description must not be told to
    // change mode to find it.
    for (const mode of MODES) {
      for (const portalTarget of [false, true]) {
        for (const tagMapped of [false, true]) {
          assert.equal(
            inspectorTabsFor(mode, { portalTarget, tagMapped, surface: "website" }).includes("seo"),
            true,
            `website/${mode}/${portalTarget}/${tagMapped} must offer seo`,
          );
          assert.equal(
            inspectorTabsFor(mode, { portalTarget, tagMapped, surface: "normal" }).includes("seo"),
            false,
            `normal/${mode}/${portalTarget}/${tagMapped} must not`,
          );
        }
      }
    }
  });

  it("REWRITTEN PIN — the deepest portal target is 14 on Normal and 15 on Website", () => {
    // The old pin asserted a bare 14 with no surface. It is rewritten rather
    // than deleted: the number it was protecting is still protected, on both
    // surfaces, so a tab that silently appears still reddens this.
    assert.equal(inspectorTabsFor("developer", { portalTarget: true, tagMapped: true, surface: "normal" }).length, 14);
    assert.equal(inspectorTabsFor("developer", { portalTarget: true, tagMapped: true, surface: "website" }).length, 15);
  });

  it("the surface changes NOTHING else — every other tab answers identically", () => {
    // The regression that matters: a new axis must not quietly move an
    // existing rule. Strip seo and the two answers are the same list.
    for (const mode of MODES) {
      for (const portalTarget of [false, true]) {
        for (const tagMapped of [false, true]) {
          const normal = inspectorTabsFor(mode, { portalTarget, tagMapped, surface: "normal" });
          const website = inspectorTabsFor(mode, { portalTarget, tagMapped, surface: "website" })
            .filter(tab => tab !== "seo");
          assert.deepEqual(website, normal, `${mode}/${portalTarget}/${tagMapped}`);
        }
      }
    }
  });

  it("changing DEPTH never throws you off SEO; leaving Website does", () => {
    for (const mode of MODES) {
      assert.equal(tabForMode(mode, "seo"), "seo", `${mode} must keep the SEO panel`);
      // …and the other axis, in the other direction.
      assert.equal(tabForSurface("website", mode, "seo"), "seo");
      assert.equal(tabForSurface("normal", mode, "seo"), EDITING_MODES.find(item => item.id === mode)!.tabs[0]);
      // Nothing else is touched by the surface.
      assert.equal(tabForSurface("normal", mode, "assistant"), "assistant");
      assert.equal(tabForSurface("website", mode, "code"), "code");
    }
  });

  it("still returns tabs in rail order, and only real tabs", () => {
    for (const surface of ["normal", "website"] as const) {
      for (const mode of MODES) {
        const tabs = inspectorTabsFor(mode, { portalTarget: true, tagMapped: true, surface });
        assert.deepEqual(tabs, INSPECTOR_TABS.filter(id => tabs.includes(id)));
      }
    }
  });
});

// ─── 3. THE SEO MODEL ────────────────────────────────────────────────────────

const FULL: PageSeo = normalisePageSeo({
  title: "About Aqua",
  description: "Who we are and what we build.",
  canonical: "https://aqua.example/about",
  index: false,
  follow: true,
  ogTitle: "About Aqua",
  ogDescription: "The studio.",
  ogImage: "https://aqua.example/share.png",
  twitterCard: "summary",
  structuredData: '{"@context":"https://schema.org","@type":"Organization","name":"Aqua"}',
});

describe("the fields, and what is wrong with them", () => {
  it("normalises anything into a valid shape, and indexing defaults to ON", () => {
    // An editor that quietly de-indexed a page because a field was missing
    // would take a client's site off Google.
    const empty = normalisePageSeo(undefined);
    assert.equal(empty.index, true);
    assert.equal(empty.follow, true);
    assert.deepEqual(empty, EMPTY_PAGE_SEO);
    assert.equal(normalisePageSeo({ index: "no" }).index, true, "only an explicit false de-indexes");
    assert.equal(normalisePageSeo({ index: false }).index, false);
    // Whitespace collapses — every one of these lands in a one-line tag.
    assert.equal(normalisePageSeo({ title: "  a\n  b  " }).title, "a b");
    // …except the structured data, whose newlines are its shape.
    assert.equal(normalisePageSeo({ structuredData: "{\n 'a': 1\n}" }).structuredData, "{\n 'a': 1\n}");
    // Unknown keys are dropped rather than carried into somebody's source.
    assert.equal("evil" in normalisePageSeo({ evil: "<script>" } as never), false);
    assert.deepEqual(Object.keys(normalisePageSeo({})).sort(), [...PAGE_SEO_FIELDS].sort());
  });

  it("knows when there is nothing to write", () => {
    assert.equal(pageSeoIsEmpty(EMPTY_PAGE_SEO), true);
    assert.equal(pageSeoIsEmpty(normalisePageSeo({ twitterCard: "summary" })), true,
      "a card size with no social fields is not content");
    assert.equal(pageSeoIsEmpty(normalisePageSeo({ index: false })), false, "noindex IS a decision");
    assert.equal(pageSeoIsEmpty(FULL), false);
    assert.equal(storedPageSeo({}), undefined);
    assert.deepEqual(storedPageSeo(FULL), FULL);
  });

  it("BLOCKS on tags that would actively misdirect, ADVISES on the rest", () => {
    const errors = pageSeoBlocked(normalisePageSeo({ canonical: "/about", ogImage: "/share.png" }));
    assert.deepEqual(errors.map(problem => problem.field).sort(), ["canonical", "ogImage"]);
    for (const problem of errors) assert.equal(problem.level, "error");

    // Length is the operator's call, not the editor's veto.
    const long = pageSeoProblems(normalisePageSeo({ title: "x".repeat(80), description: "y".repeat(200) }));
    assert.deepEqual(long.filter(problem => problem.level === "error"), []);
    assert.ok(long.some(problem => problem.field === "title" && /80 characters/.test(problem.message)));
    assert.ok(long.some(problem => problem.field === "description" && /200 characters/.test(problem.message)));

    // noindex is a real consequence, said out loud, and never a refusal.
    const noindex = pageSeoProblems(normalisePageSeo({ index: false, title: "t", description: "d" }));
    assert.ok(noindex.some(problem => problem.field === "index" && /removed from search results/.test(problem.message)));
    assert.deepEqual(noindex.filter(problem => problem.level === "error"), []);

    // A missing title and description are advice — plenty of real pages ship
    // without them and the editor is not the arbiter.
    const bare = pageSeoProblems(EMPTY_PAGE_SEO);
    assert.deepEqual(bare.filter(problem => problem.level === "error"), []);
    assert.equal(pageSeoBlocked(FULL).length, 0);
  });

  it("refuses structured data that is not JSON-LD, and accepts any @type", () => {
    // Deliberately NOT validated against a schema whitelist: an agency pasting
    // `LocalBusiness` is doing the right thing, and the website-editor module's
    // own `validateJsonLd` only knows the five types its builders emit.
    assert.equal(parseStructuredData('{"@context":"https://schema.org","@type":"LocalBusiness","name":"x"}').ok, true);
    const list = parseStructuredData('[{"@type":"A"},{"@type":"B"}]');
    assert.equal(list.ok, true);
    if (list.ok) assert.equal(list.nodes, 2);
    assert.equal(parseStructuredData("").ok, true, "nothing pasted is not an error");
    for (const bad of ["{", "[]", '"a string"', "42", "[1,2]", "null"]) {
      assert.equal(parseStructuredData(bad).ok, false, `${bad} must be refused`);
    }
    const broken = parseStructuredData("{");
    assert.equal(broken.ok, false);
    if (!broken.ok) assert.match(broken.error, /without the surrounding <script> tag/);
  });

  it("escapes what would break out of the script tag — through the module's own escaper", () => {
    // `serializeJsonLd` is the escape authority (`</script`, `<!--`, U+2028).
    // Two copies of an escape list is how one of them ends up missing a case.
    const body = structuredDataScriptBody({ "@type": "X", name: "</script><img onerror=1>" });
    assert.equal(body.includes("</script"), false);
    assert.match(body, /<\\\/script/);
    assert.equal(structuredDataScriptBody({ a: "<!--" }).includes("<!--"), false);
    // The VALUE is emitted, not a one-element array around it.
    assert.match(structuredDataScriptBody({ a: 1 }), /^\{/);
    assert.match(structuredDataScriptBody([{ a: 1 }]), /^\[/);
  });
});

// ─── 4. WHICH MECHANISM, AND THE ANCHORING LESSON ────────────────────────────

describe("which head a file has", () => {
  it("reads .html and App Router page/layout, and refuses the rest BY NAME", () => {
    assert.equal(seoMechanismFor("index.html").mechanism, "html");
    assert.equal(seoMechanismFor("public/about.htm").mechanism, "html");
    assert.equal(seoMechanismFor("app/page.tsx").mechanism, "next-metadata");
    assert.equal(seoMechanismFor("src/app/about/page.tsx").mechanism, "next-metadata");
    assert.equal(seoMechanismFor("app/(marketing)/blog/layout.jsx").mechanism, "next-metadata");
    // WIDENED 2026-08-22: `.js` and `.mjs` too. The navigator has always
    // derived routes from them, so refusing them here was two anchored rules
    // drifting, not a decision — a repository written in plain JavaScript got
    // routes the SEO panel then refused by name.
    assert.equal(seoMechanismFor("app/page.js").mechanism, "next-metadata");
    assert.equal(seoMechanismFor("src/app/about/page.mjs").mechanism, "next-metadata");
    assert.equal(seoMechanismFor("app/layout.js").mechanism, "next-metadata");
    // …and `.mdx` still is not one: an MDX page's head is built by whatever
    // renders it, which is what the Markdown sentence says.
    assert.match(seoMechanismFor("app/page.mdx").sentence, /Markdown/);

    const pagesRouter = seoMechanismFor("pages/about.tsx");
    assert.equal(pagesRouter.mechanism, "unsupported");
    assert.match(pagesRouter.sentence, /Pages Router/);
    assert.match(pagesRouter.sentence, /will not guess a place inside somebody's JSX/);

    assert.match(seoMechanismFor("docs/notes.md").sentence, /Markdown/);
    assert.match(seoMechanismFor("src/lib/util.ts").sentence, /not a page whose head the editor knows how to write/);
    assert.match(seoMechanismFor("").sentence, /No page file is selected/);
  });

  it("is ANCHORED AT THE REPOSITORY ROOT — the navigator's lesson, paid once", () => {
    // Unanchored, this repository's own
    // `built-ins/modules/agency-finance/src/pages/ActivityPage.tsx` read as a
    // route. A folder called `app` six levels down is a component directory.
    assert.equal(seoMechanismFor("built-ins/modules/x/src/app/thing/page.tsx").mechanism, "unsupported");
    assert.equal(seoMechanismFor("packages/site/app/page.tsx").mechanism, "unsupported");
    assert.equal(seoMechanismFor("vendor/pages/about.tsx").mechanism, "unsupported");
  });

  it("CROSS-PINNED with the navigator: every route it derives has an answer here", () => {
    // Two anchored rules in two modules. This is what stops them drifting —
    // the navigator offering a page the SEO panel then says it cannot name.
    const routes = repositoryRoutes([
      "app/page.tsx",
      "src/app/about/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "app/blog/[slug]/page.tsx",
      "public/legacy.html",
      "index.html",
      "pages/contact.tsx",
    ]);
    assert.ok(routes.length >= 6);
    for (const route of routes) {
      assert.ok(route.file, `${route.target} must carry the file it came from`);
      const answer = seoMechanismFor(route.file!);
      if (route.file!.startsWith("pages/") || route.file!.startsWith("src/pages/")) {
        // The one honest gap, and it SAYS so rather than being silent.
        assert.equal(answer.mechanism, "unsupported");
        assert.match(answer.sentence, /Pages Router/);
      } else {
        assert.notEqual(answer.mechanism, "unsupported", `${route.file} came from the navigator and must be writable`);
      }
    }
  });

  it("the navigator carries the FILE, on repository rows only", () => {
    const [home, about] = repositoryRoutes(["app/page.tsx", "src/app/about/page.tsx"]);
    assert.equal(home.file, "app/page.tsx");
    assert.equal(about.file, "src/app/about/page.tsx");
    // A dynamic route is still listed, still not openable, and still names its
    // file — you can give `/blog/[slug]` a head without being able to open it.
    const dynamic = repositoryRoutes(["app/blog/[slug]/page.tsx"])[0];
    assert.equal(dynamic.openable, false);
    assert.equal(dynamic.file, "app/blog/[slug]/page.tsx");
  });

  it("says which field a mechanism cannot carry, instead of dropping it", () => {
    // Next's metadata export has nowhere to put JSON-LD — it is a <script> the
    // page renders. Said in the panel, not silently discarded.
    assert.match(mechanismRefusesField("next-metadata", "structuredData") ?? "", /nowhere to put JSON-LD/);
    assert.equal(mechanismRefusesField("html", "structuredData"), null);
    assert.equal(mechanismFields("html").length, PAGE_SEO_FIELDS.length);
    assert.equal(mechanismFields("next-metadata").includes("structuredData"), false);
  });
});

// ─── 5. THE PLAN — own a block, refuse everything else ───────────────────────

const HTML_PAGE = [
  "<!doctype html>",
  "<html>",
  "  <head>",
  '    <meta charset="utf-8">',
  "    <title>Hand written</title>",
  "  </head>",
  "  <body><p>hi</p></body>",
  "</html>",
].join("\n");

const CLEAN_HTML = [
  "<!doctype html>",
  "<html>",
  "  <head>",
  '    <meta charset="utf-8">',
  "  </head>",
  "  <body><p>hi</p></body>",
  "</html>",
].join("\n");

const APP_PAGE = [
  'import Link from "next/link";',
  "import {",
  "  Thing,",
  '} from "./thing";',
  "",
  "export default function Page() {",
  "  return <main><h1>Hi</h1></main>;",
  "}",
].join("\n");

describe("writing a head into source", () => {
  it("HTML: lands inside the head, AFTER the charset", () => {
    // The encoding has to be declared inside the first 1024 bytes, and a long
    // title can push it out.
    const plan = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.action, "insert");
    const lines = plan.newContents.split("\n");
    assert.ok(lines.indexOf(`    ${HTML_SEO_OPEN}`) > lines.findIndex(line => line.includes("charset")));
    assert.ok(lines.indexOf(`    ${HTML_SEO_OPEN}`) < lines.findIndex(line => line.includes("</head>")));
    assert.match(plan.summary, /after its charset/);
    // The indentation of the head's own lines, not a hard-coded two spaces.
    assert.ok(plan.lines.every(line => line.startsWith("    ")));
  });

  it("HTML: emits a tag ONLY for a field with a value", () => {
    const plan = planPageSeoEdit({
      contents: CLEAN_HTML, file: "index.html",
      seo: normalisePageSeo({ title: "Only a title" }),
    });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    // An empty `<meta name="description" content="">` tells a crawler the page
    // has decided it has no description, which is worse than saying nothing.
    assert.equal(plan.lines.some(line => line.includes("description")), false);
    assert.equal(plan.lines.some(line => line.includes("robots")), false, "index+follow is what a page does anyway");
    assert.equal(plan.lines.some(line => line.includes("twitter:card")), false, "no social fields, no card");
    assert.deepEqual(plan.lines.filter(line => line.includes("<title>")).length, 1);
  });

  it("REFUSES a page that already writes its own head — by name, with the reason", () => {
    const plan = planPageSeoEdit({ contents: HTML_PAGE, file: "index.html", seo: FULL });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "conflict");
    assert.match(plan.detail, /already has its own <title>/);

    const described = planPageSeoEdit({
      contents: CLEAN_HTML.replace("</head>", '  <meta name="description" content="x">\n  </head>'),
      file: "index.html", seo: FULL,
    });
    assert.equal(described.ok, false);
    if (!described.ok) assert.match(described.detail, /two/);
  });

  it("REFUSES an .html file with no head, rather than inventing one", () => {
    const plan = planPageSeoEdit({ contents: "<p>fragment</p>\n", file: "part.html", seo: FULL });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.equal(plan.reason, "no-head");
      assert.match(plan.detail, /has no <head>/);
    }
  });

  it("Next: lands after the imports, including a multi-line one", () => {
    const plan = planPageSeoEdit({ contents: APP_PAGE, file: "app/about/page.tsx", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    const lines = plan.newContents.split("\n");
    assert.ok(lines.indexOf(TS_SEO_OPEN) > lines.indexOf('} from "./thing";'));
    assert.ok(lines.indexOf(TS_SEO_OPEN) < lines.findIndex(line => line.startsWith("export default")));
    // Valid JSON in valid source — that is what makes the read-back exact.
    const json = plan.lines.join("\n").match(/export const metadata = ([\s\S]*?);\n/)?.[1];
    assert.ok(json);
    assert.doesNotThrow(() => JSON.parse(json!));
    // No import added, and no type annotation demanding one.
    assert.equal(plan.newContents.includes("import type { Metadata }"), false);
    assert.equal(plan.lines.some(line => line.includes(": Metadata")), false);
  });

  it("Next: REFUSES a client component, a generateMetadata, and an existing export", () => {
    const client = ['"use client";', "", 'import x from "y";', "export default function P() { return null; }"].join("\n");
    const clientPlan = planPageSeoEdit({ contents: client, file: "app/p/page.tsx", seo: FULL });
    assert.equal(clientPlan.ok, false);
    if (!clientPlan.ok) assert.match(clientPlan.detail, /Client Component/);

    const generated = [...APP_PAGE.split("\n"), "export async function generateMetadata() { return {}; }"].join("\n");
    const generatedPlan = planPageSeoEdit({ contents: generated, file: "app/p/page.tsx", seo: FULL });
    assert.equal(generatedPlan.ok, false);
    if (!generatedPlan.ok) assert.match(generatedPlan.detail, /generateMetadata/);

    const existing = [...APP_PAGE.split("\n"), 'export const metadata = { title: "theirs" };'].join("\n");
    const existingPlan = planPageSeoEdit({ contents: existing, file: "app/p/page.tsx", seo: FULL });
    assert.equal(existingPlan.ok, false);
    if (!existingPlan.ok) assert.match(existingPlan.detail, /will not delete somebody's/);
  });

  it("REPLACES its own block, and REMOVES it when everything is cleared", () => {
    const first = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: FULL });
    assert.ok(first.ok);
    if (!first.ok) return;
    const changed = planPageSeoEdit({
      contents: first.newContents, file: "index.html",
      seo: normalisePageSeo({ ...FULL, title: "Renamed" }),
    });
    assert.ok(changed.ok);
    if (!changed.ok) return;
    assert.equal(changed.action, "replace");
    assert.equal(changed.newContents.match(new RegExp(HTML_SEO_OPEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length, 1,
      "replacing must never leave two blocks");

    const cleared = planPageSeoEdit({ contents: first.newContents, file: "index.html", seo: EMPTY_PAGE_SEO });
    assert.ok(cleared.ok);
    if (!cleared.ok) return;
    assert.equal(cleared.action, "remove");
    assert.equal(cleared.newContents, CLEAN_HTML, "removing puts the file back exactly as it was");
    assert.deepEqual(cleared.lines, []);
  });

  it("says NO CHANGE rather than committing the same bytes twice", () => {
    const first = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: FULL });
    assert.ok(first.ok);
    if (!first.ok) return;
    const again = planPageSeoEdit({ contents: first.newContents, file: "index.html", seo: FULL });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.reason, "no-change");
    // …and clearing a page that never had a block is not a removal.
    const nothing = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: EMPTY_PAGE_SEO });
    assert.equal(nothing.ok, false);
    if (!nothing.ok) assert.equal(nothing.reason, "no-change");
  });

  it("REFUSES values that would misdirect, before touching the file", () => {
    const plan = planPageSeoEdit({
      contents: CLEAN_HTML, file: "index.html",
      seo: normalisePageSeo({ title: "x", canonical: "/relative" }),
    });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.equal(plan.reason, "invalid");
      assert.match(plan.detail, /full address/);
    }
  });

  it("refuses a file whose head it does not know, without reading a line of it", () => {
    for (const file of ["pages/about.tsx", "docs/x.md", "src/lib/util.ts"]) {
      const plan = planPageSeoEdit({ contents: "anything", file, seo: FULL });
      assert.equal(plan.ok, false, file);
      if (!plan.ok) assert.equal(plan.reason, "unsupported");
    }
  });
});

describe("the round trip — the panel shows what the page actually says", () => {
  it("HTML: read(emit(x)) === x, including the JSON-LD", () => {
    const plan = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    const read = readPageSeo({ contents: plan.newContents, file: "index.html" });
    assert.equal(read.found, true);
    assert.equal(read.conflict, null);
    assert.ok(pageSeoEquals(read.seo, FULL), JSON.stringify(read.seo));
  });

  it("Next: read(emit(x)) === x, minus the one field it cannot carry", () => {
    const plan = planPageSeoEdit({ contents: APP_PAGE, file: "app/about/page.tsx", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    const read = readPageSeo({ contents: plan.newContents, file: "app/about/page.tsx" });
    assert.equal(read.found, true);
    assert.ok(pageSeoEquals(read.seo, normalisePageSeo({ ...FULL, structuredData: "" })), JSON.stringify(read.seo));
  });

  it("survives characters that would otherwise change the document", () => {
    const nasty = normalisePageSeo({
      title: 'A & B "quoted" <tag>',
      description: "50% off — <b>now</b>",
      ogTitle: "5 > 3 & 2 < 4",
    });
    const plan = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: nasty });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    // Escaped in the file…
    assert.equal(plan.newContents.includes("<tag>"), false);
    assert.match(plan.newContents, /&amp;/);
    // …and back out again, unchanged.
    assert.ok(pageSeoEquals(readPageSeo({ contents: plan.newContents, file: "index.html" }).seo, nasty));
  });

  it("changes NOTHING outside the two markers", () => {
    const outside = (contents: string, open: string, close: string) => {
      const lines = contents.split("\n");
      const start = lines.findIndex(line => line.trim() === open);
      const end = lines.findIndex(line => line.trim() === close);
      return start < 0 ? contents : [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
    };
    const html = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: FULL });
    assert.ok(html.ok);
    if (html.ok) assert.equal(outside(html.newContents, HTML_SEO_OPEN, HTML_SEO_CLOSE), CLEAN_HTML);

    const next = planPageSeoEdit({ contents: APP_PAGE, file: "app/p/page.tsx", seo: FULL });
    assert.ok(next.ok);
    if (next.ok) {
      // One blank line is added either side so the export does not weld itself
      // to the last import; the code itself is untouched.
      assert.equal(
        outside(next.newContents, TS_SEO_OPEN, TS_SEO_CLOSE).replace(/\n{2,}/g, "\n\n"),
        APP_PAGE,
      );
    }
  });

  it("reads an EMPTY answer for a page that has no block, and names a rival head", () => {
    const none = readPageSeo({ contents: CLEAN_HTML, file: "index.html" });
    assert.equal(none.found, false);
    assert.deepEqual(none.seo, EMPTY_PAGE_SEO);
    assert.equal(none.conflict, null);
    const rival = readPageSeo({ contents: HTML_PAGE, file: "index.html" });
    assert.equal(rival.found, false);
    assert.match(rival.conflict ?? "", /already has its own <title>/);
  });

  it("emits the markers it looks for — the pair cannot drift apart", () => {
    assert.ok(emitHtmlSeoBlock(FULL)[0].trim() === HTML_SEO_OPEN);
    assert.ok(emitHtmlSeoBlock(FULL).at(-1)!.trim() === HTML_SEO_CLOSE);
    assert.equal(emitNextMetadataBlock(FULL)[0], TS_SEO_OPEN);
    assert.equal(emitNextMetadataBlock(FULL).at(-1), TS_SEO_CLOSE);
  });
});

// ─── 6. THE PORTAL DOCUMENT — stored, and byte-identical when untouched ──────

describe("a portal page's SEO lives in the portal document", () => {
  it("a document nobody has touched carries NO seo key at all", () => {
    // The whole reason `seo` is optional-and-omitted rather than defaulted: a
    // document that predates the field must normalise to the JSON it always
    // did, because fixtures across the portal suite are asserting against it.
    const normalised = normalisePortalDesign(STUNNING_STANDARD_PORTAL);
    for (const page of Object.values(normalised.pages)) {
      assert.equal("seo" in page, false);
    }
    for (const page of normalised.builder?.customPages ?? []) {
      assert.equal("seo" in page, false);
    }
    assert.equal(JSON.stringify(normalised).includes('"seo"'), false);
    // And the JSON is byte-identical to normalising it a second time, which is
    // the invariant a stored document actually round-trips through.
    assert.equal(JSON.stringify(normalisePortalDesign(normalised)), JSON.stringify(normalised));
  });

  it("carries a page's SEO through, and drops it again when cleared", () => {
    const withSeo = normalisePortalDesign({
      ...STUNNING_STANDARD_PORTAL,
      pages: { ...STUNNING_STANDARD_PORTAL.pages, home: { ...STUNNING_STANDARD_PORTAL.pages.home, seo: FULL } },
    });
    assert.deepEqual(withSeo.pages.home.seo, FULL);
    const cleared = normalisePortalDesign({
      ...withSeo,
      pages: { ...withSeo.pages, home: { ...withSeo.pages.home, seo: EMPTY_PAGE_SEO } },
    });
    assert.equal("seo" in cleared.pages.home, false);
  });

  it("sanitises whatever was stored rather than trusting it", () => {
    const dirty = normalisePortalDesign({
      ...STUNNING_STANDARD_PORTAL,
      pages: {
        ...STUNNING_STANDARD_PORTAL.pages,
        home: { ...STUNNING_STANDARD_PORTAL.pages.home, seo: { title: "  a\n b ", evil: "x", index: "yes" } },
      },
    });
    assert.equal(dirty.pages.home.seo?.title, "a b");
    assert.equal((dirty.pages.home.seo as Record<string, unknown>).evil, undefined);
    assert.equal(dirty.pages.home.seo?.index, true);
  });

  it("carries it on a custom page too", () => {
    const document = normalisePortalDesign({
      ...STUNNING_STANDARD_PORTAL,
      builder: {
        pages: {},
        customPages: [{ id: "page-1", slug: "extra", label: "Extra", visible: true, blocks: [], seo: { title: "Extra page" } }],
      },
    });
    assert.equal(document.builder?.customPages[0].seo?.title, "Extra page");
    const bare = normalisePortalDesign({
      ...STUNNING_STANDARD_PORTAL,
      builder: { pages: {}, customPages: [{ id: "page-1", slug: "extra", label: "Extra", visible: true, blocks: [] }] },
    });
    assert.equal("seo" in bare.builder!.customPages[0], false);
  });
});

// ─── 7. THE WRITE PATH — the same one every other edit uses ──────────────────

function repoProject(fields: Partial<DevProject> = {}): DevProject {
  return {
    id: "proj_seo",
    agencyId: "agency_1",
    name: "Acme site",
    kind: "software",
    repository: "acme/site",
    ref: "main",
    createdAt: 0,
    updatedAt: 0,
    createdBy: "user_1",
    ...fields,
  } as DevProject;
}

const BRANCH = editBranchName(repoProject());

const BASE_FILES: Record<string, string> = {
  "index.html": CLEAN_HTML,
  "app/about/page.tsx": APP_PAGE,
  "pages/legacy.tsx": APP_PAGE,
  "src/lib/util.ts": "export const x = 1;\n",
};

// The stateful fake GitHub — lineage: smoke-element-insert → smoke-repo-write.
function fakeGitHub(baseFiles: Record<string, string> = BASE_FILES, baseSha = "sha_base") {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const refs = new Map<string, string>([["main", baseSha]]);
  const commits = new Map<string, { parents: string[]; tree: string }>([[baseSha, { parents: [], tree: "tree_base" }]]);
  const trees = new Map<string, Record<string, string>>([["tree_base", { ...baseFiles }]]);
  const treeBase = new Map<string, string>();
  const pulls: Array<{ number: number; head: string; state: string; url: string }> = [];
  let treeCount = 0;
  let commitCount = 0;

  const snapshotAt = (commitSha: string): Record<string, string> => {
    const commit = commits.get(commitSha);
    if (!commit) throw new Error(`fake: unknown commit ${commitSha}`);
    const base = treeBase.get(commit.tree);
    const parent = base ? snapshotAt(base) : {};
    return { ...parent, ...(trees.get(commit.tree) ?? {}) };
  };

  const isAncestor = (ancestor: string, sha: string): boolean => {
    const queue = [sha];
    const seen = new Set<string>();
    while (queue.length) {
      const current = queue.pop()!;
      if (current === ancestor) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(commits.get(current)?.parents ?? []));
    }
    return false;
  };

  const headSha = (ref: string): string => {
    const tip = refs.get(ref);
    if (!tip) throw new Error(`GitHub request failed (404). Branch ${ref} not found`);
    return tip;
  };

  const fileAt = (ref: string, path: string): RepoFile => {
    const snapshot = snapshotAt(headSha(ref));
    if (snapshot[path] !== undefined) {
      return { path, editable: true, contents: snapshot[path], fingerprint: hashFile(snapshot[path]) };
    }
    throw new Error("GitHub request failed (404). Not Found");
  };

  const treeAt = (ref: string) => ({
    sha: headSha(ref),
    truncated: false,
    files: Object.keys(snapshotAt(headSha(ref))).map(path => ({ path })),
  });

  const impl: typeof fetch = async (url, init) => {
    const path = String(url).replace("https://api.github.com", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ method, path, body });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

    if (method === "GET" && path.includes("/git/ref/heads/")) {
      const branch = path.split("/git/ref/heads/")[1];
      const sha = refs.get(branch);
      return sha ? json({ object: { sha } }) : json({ message: "Not Found" }, 404);
    }
    if (method === "POST" && path.endsWith("/git/refs")) {
      const branch = String(body.ref).replace(/^refs\/heads\//, "");
      if (refs.has(branch)) return json({ message: "Reference already exists" }, 422);
      refs.set(branch, String(body.sha));
      return json({ ref: body.ref });
    }
    if (method === "POST" && path.endsWith("/git/trees")) {
      treeCount += 1;
      const sha = `tree_sha_${treeCount}`;
      const overlay: Record<string, string> = {};
      for (const entry of (body.tree as Array<{ path: string; content: string }> ?? [])) {
        overlay[entry.path] = entry.content;
      }
      trees.set(sha, overlay);
      treeBase.set(sha, String(body.base_tree));
      return json({ sha });
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      commitCount += 1;
      const sha = `commit_sha_${commitCount}`;
      commits.set(sha, {
        parents: Array.isArray(body.parents) ? body.parents.map(String) : [],
        tree: String(body.tree),
      });
      return json({ sha });
    }
    if (method === "PATCH" && path.includes("/git/refs/heads/")) {
      const branch = path.split("/git/refs/heads/")[1];
      const current = refs.get(branch);
      if (!current) return json({ message: "Reference does not exist" }, 422);
      if (body.force !== true && !isAncestor(current, String(body.sha))) {
        return json({ message: "Update is not a fast forward" }, 422);
      }
      refs.set(branch, String(body.sha));
      return json({ ref: `refs/heads/${branch}` });
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };

  return { impl, calls, refs, commits, pulls, snapshotAt, headSha, fileAt, treeAt };
}

function deps(files: Record<string, string> = BASE_FILES) {
  const github = fakeGitHub(files);
  const reads: Array<{ ref: string; path: string }> = [];
  const published: PublishRequest[] = [];
  const value: RepoWriteDeps & {
    github: ReturnType<typeof fakeGitHub>;
    reads: typeof reads;
    published: typeof published;
  } = {
    githubToken: "token_from_the_vault",
    readFile: async (source, path) => {
      reads.push({ ref: source.ref, path });
      return github.fileAt(source.ref, path);
    },
    readHeadSha: async source => github.headSha(source.ref),
    readTree: async source => github.treeAt(source.ref),
    publish: async request => {
      published.push(request);
      return publishEdits({ ...request, fetchImpl: github.impl });
    },
    openPr: async input => openPullRequest({ ...input, fetchImpl: github.impl }),
    github,
    reads,
    published,
  };
  return value;
}

describe("reading a page's head out of the repository", () => {
  it("reads the DRAFT BRANCH first, falling back to base before the first commit", async () => {
    const dependencies = deps();
    const first = await readPageSeoFromRepo({ agencyId: "agency_1", project: repoProject(), path: "index.html" }, dependencies);
    assert.ok(first.ok);
    if (!first.ok) return;
    assert.equal(first.found, false);
    assert.equal(first.mechanism, "html");
    assert.deepEqual(dependencies.reads.map(read => read.ref), [BRANCH, "main"],
      "the branch is asked first, and only its 404 falls back to base");

    // Commit something, then read again: the branch now answers.
    const written = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL, confirm: true },
      dependencies,
    );
    assert.ok(written.ok);
    const second = await readPageSeoFromRepo({ agencyId: "agency_1", project: repoProject(), path: "index.html" }, dependencies);
    assert.ok(second.ok);
    if (!second.ok) return;
    assert.equal(second.found, true);
    assert.ok(pageSeoEquals(second.seo, FULL), "what the page says on the branch, not what base says");
  });

  it("refuses a file whose head it cannot write, with that file's own sentence", async () => {
    const result = await readPageSeoFromRepo(
      { agencyId: "agency_1", project: repoProject(), path: "pages/legacy.tsx" },
      deps(),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "seo-unsupported");
      assert.match(result.error, /Pages Router/);
    }
  });

  it("keeps the same path refusals as every other write", async () => {
    for (const path of ["../secrets", ".env", "a\\b"]) {
      const result = await readPageSeoFromRepo({ agencyId: "agency_1", project: repoProject(), path }, deps());
      assert.equal(result.ok, false, path);
      if (!result.ok) assert.equal(result.reason, "bad-path");
    }
  });
});

describe("writing it — preview, then confirm, onto the draft branch", () => {
  it("the preview writes NOTHING and returns the exact lines", async () => {
    const dependencies = deps();
    const preview = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL },
      dependencies,
    );
    assert.ok(preview.ok);
    if (!preview.ok) return;
    assert.equal(preview.published, false);
    assert.equal(preview.action, "insert");
    assert.equal(dependencies.published.length, 0, "a preview must not reach publishEdits at all");
    assert.ok(preview.lines.some(line => line.includes("<title>About Aqua</title>")));
    assert.match(preview.summary, /Nothing committed yet/);
    assert.match(preview.summary, /Confirm to put it on the draft branch/);
    assert.ok(preview.fingerprint);
  });

  it("confirming commits THROUGH saveRepoFile, on the branch, and the file really changed", async () => {
    const dependencies = deps();
    const preview = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL },
      dependencies,
    );
    assert.ok(preview.ok);
    if (!preview.ok) return;
    const committed = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL, fingerprint: preview.fingerprint, confirm: true },
      dependencies,
    );
    assert.ok(committed.ok);
    if (!committed.ok) return;
    assert.equal(committed.published, true);
    assert.equal(committed.branch, BRANCH);
    assert.ok(committed.commitSha);
    // The branch, never the default one.
    assert.equal(dependencies.github.refs.get("main"), "sha_base");
    const onBranch = dependencies.github.snapshotAt(dependencies.github.headSha(BRANCH))["index.html"];
    assert.match(onBranch, /aqua:seo/);
    assert.ok(pageSeoEquals(readPageSeo({ contents: onBranch, file: "index.html" }).seo, FULL));
    // …and the summary is the SAVE's, which says draft branch rather than live.
    assert.match(committed.summary, /branch/i);
  });

  it("names the page in the commit message, and says 'remove' when it removes", async () => {
    const dependencies = deps();
    await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL, confirm: true },
      dependencies,
    );
    assert.match(String(dependencies.published[0].message), /Aqua Editor: set the page SEO on index\.html/);
    await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: EMPTY_PAGE_SEO, confirm: true },
      dependencies,
    );
    assert.match(String(dependencies.published[1].message), /remove the SEO block from index\.html/);
    const after = dependencies.github.snapshotAt(dependencies.github.headSha(BRANCH))["index.html"];
    assert.equal(after, CLEAN_HTML, "removing puts the page back exactly as it was");
  });

  it("REFUSES when the page moved between the preview and the confirm", async () => {
    const dependencies = deps();
    const preview = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL },
      dependencies,
    );
    assert.ok(preview.ok);
    if (!preview.ok) return;
    // Somebody else commits to the same file in the window.
    const meanwhile = await saveRepoFile({
      agencyId: "agency_1", project: repoProject(), path: "index.html",
      contents: `${CLEAN_HTML}\n<!-- theirs -->`, fingerprint: hashFile(CLEAN_HTML), confirm: true,
    }, dependencies);
    assert.ok(meanwhile.ok);
    const late = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: FULL, fingerprint: preview.fingerprint, confirm: true },
      dependencies,
    );
    assert.equal(late.ok, false);
    if (!late.ok) {
      assert.equal(late.reason, "stale-fingerprint");
      assert.match(late.error, /changed since you opened it/);
    }
  });

  it("maps each plan refusal to its OWN reason — they are fixed in different ways", async () => {
    const dependencies = deps({ ...BASE_FILES, "hand.html": HTML_PAGE, "fragment.html": "<p>x</p>\n" });
    const conflict = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "hand.html", seo: FULL }, dependencies,
    );
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.reason, "seo-conflict");

    const noHead = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "fragment.html", seo: FULL }, dependencies,
    );
    assert.equal(noHead.ok, false);
    if (!noHead.ok) assert.equal(noHead.reason, "seo-no-head");

    const invalid = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "index.html", seo: normalisePageSeo({ canonical: "/x" }) },
      dependencies,
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.reason, "seo-invalid");

    const unsupported = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "src/lib/util.ts", seo: FULL }, dependencies,
    );
    assert.equal(unsupported.ok, false);
    if (!unsupported.ok) assert.equal(unsupported.reason, "seo-unsupported");
  });

  it("works on an App Router page as well as an .html one", async () => {
    const dependencies = deps();
    const committed = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "app/about/page.tsx", seo: FULL, confirm: true },
      dependencies,
    );
    assert.ok(committed.ok);
    if (!committed.ok) return;
    assert.equal(committed.mechanism, "next-metadata");
    const onBranch = dependencies.github.snapshotAt(dependencies.github.headSha(BRANCH))["app/about/page.tsx"];
    assert.match(onBranch, /export const metadata = \{/);
    assert.match(onBranch, /export default function Page/, "the component itself is untouched");
  });

  it("AND ON A LAYOUT — the file the UI could not reach until 2026-08-22", async () => {
    // The engine always accepted `app/layout.tsx`; nothing on screen could
    // point at one. Driven end to end here, through the real
    // `writePageSeoToRepo` onto the real draft branch, so "the panel can now
    // select it" is backed by "and the write works when it does".
    const dependencies = deps({ ...BASE_FILES, "app/layout.tsx": APP_PAGE });
    const committed = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "app/layout.tsx", seo: FULL, confirm: true },
      dependencies,
    );
    assert.ok(committed.ok);
    if (!committed.ok) return;
    assert.equal(committed.mechanism, "next-metadata");
    const onBranch = dependencies.github.snapshotAt(dependencies.github.headSha(BRANCH))["app/layout.tsx"];
    assert.match(onBranch, /export const metadata = \{/);
    // …and the page under it is untouched, which is the whole distinction.
    assert.equal(
      dependencies.github.snapshotAt(dependencies.github.headSha(BRANCH))["app/about/page.tsx"],
      APP_PAGE,
    );
  });

  it("a plain JavaScript App Router page is written too, not refused by name", async () => {
    const dependencies = deps({ ...BASE_FILES, "app/js/page.js": APP_PAGE });
    const committed = await writePageSeoToRepo(
      { agencyId: "agency_1", project: repoProject(), path: "app/js/page.js", seo: FULL, confirm: true },
      dependencies,
    );
    assert.ok(committed.ok, committed.ok ? "" : `refused: ${committed.error}`);
    if (!committed.ok) return;
    assert.equal(committed.mechanism, "next-metadata");
  });
});

// ─── 8. THE ROUTE — the two-step is enforced at the door ─────────────────────

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "SEO Co", slug: `seo-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@seo.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "seo-operator-pass",
  });
  return {
    agency,
    userId: user.id,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

interface RouteBody { ok?: boolean; error?: string; reason?: string }

async function post(token: string, body: unknown) {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/repo-write",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ) as never)));
  return { status: response.status, body: await response.json() as RouteBody };
}

describe("the SEO actions on /api/portal/dev/repo-write", () => {
  it("needs a page file", async () => {
    const { token, agency, userId } = await founder();
    const target = await saveDevProject({ agencyId: agency.id, actorUserId: userId, name: "P", repository: "acme/site" } as never);
    for (const action of ["seo-read", "seo-write"]) {
      const result = await post(token, { action, project: target.id });
      assert.equal(result.status, 400, action);
    }
  });

  it("confirming without the preview's fingerprint is a 400, not a commit", async () => {
    const { token, agency, userId } = await founder();
    const target = await saveDevProject({ agencyId: agency.id, actorUserId: userId, name: "P", repository: "acme/site" } as never);
    const result = await post(token, {
      action: "seo-write", project: target.id, path: "index.html", seo: { title: "x" }, confirm: true,
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error ?? "", /[Pp]review first/);
  });

  it("sits INSIDE the route's existing gate — no new door was cut", () => {
    // The SEO actions add no guard of their own, and must not: they run after
    // the same founder role check, the same Dev Mode check, the same origin
    // check and the same tenant-then-project lookup as save, create and
    // publish. This pins that they are inside that block rather than beside it.
    const route = readFileSync(new URL("../src/app/api/portal/dev/repo-write/route.ts", import.meta.url), "utf8");
    const gateAt = route.indexOf("const session = await requireRole([\"agency-owner\", \"agency-manager\"]);");
    const lookupAt = route.indexOf("const project = getDevProject(session.agencyId, projectId);");
    const seoAt = route.indexOf('body?.action === "seo-read"');
    const writeAt = route.indexOf('body?.action === "seo-write"');
    assert.ok(gateAt > 0 && lookupAt > gateAt);
    assert.ok(seoAt > lookupAt, "seo-read must be after the tenant-then-project lookup");
    assert.ok(writeAt > lookupAt, "seo-write must be after the tenant-then-project lookup");
    // The repository, the ref and the token are never read from the body.
    assert.equal(/body\.(repository|ref|token)/.test(route), false);
  });

  it("still names every action it takes when it does not recognise one", async () => {
    const { token, agency, userId } = await founder();
    const target = await saveDevProject({ agencyId: agency.id, actorUserId: userId, name: "P", repository: "acme/site" } as never);
    const result = await post(token, { action: "nonsense", project: target.id });
    assert.equal(result.status, 400);
    assert.match(result.body.error ?? "", /seo-read/);
    assert.match(result.body.error ?? "", /seo-write/);
  });
});

// ─── 9. THE WIRING — mounted, and in the right place ─────────────────────────

describe("the editor actually mounts all of it", () => {
  it("THREE switchers in the header, and only three", () => {
    // Ed: "2 of them in total projects selector and the navigation selector",
    // then "maybe its worth having a 3rd switcher to switch what it is".
    assert.equal((editor.match(/aria-label="Dev project"/g) ?? []).length, 1);
    assert.equal((editor.match(/<PageNavigator /g) ?? []).length, 1);
    assert.equal((editor.match(/<SurfaceSwitch /g) ?? []).length, 1);
    // The mode switch is the depth axis, not one of the three.
    assert.equal((editor.match(/<EditorModeSwitch/g) ?? []).length, 1);
  });

  it("the surface switcher is in the row that renders at EVERY width", () => {
    // The top bar is `xl:` and up. A switcher that decides whether the SEO
    // panel is reachable cannot be one that disappears at 1279px — the same
    // trap the navigator avoided.
    const secondRow = editor.slice(editor.indexOf("col-span-3 col-start-1 row-start-2"));
    const surfaceAt = secondRow.indexOf("<SurfaceSwitch ");
    const navigatorAt = secondRow.indexOf("<PageNavigator ");
    assert.ok(surfaceAt > 0, "the surface switcher must live in the always-visible row");
    assert.ok(surfaceAt < navigatorAt, "what this is reads before which page of it");
  });

  it("passes the surface to the ONE rule that decides which tabs exist", () => {
    assert.match(editor, /inspectorTabsFor\(editingModeId, \{ portalTarget, tagMapped, surface \}\)/);
    assert.match(editor, /const resolvedSurface = resolveSurface\(/);
    assert.match(editor, /<SurfaceSwitch resolved=\{resolvedSurface\} onChange=\{changeSurface\}/);
  });

  it("does not read projectKind to decide the surface", () => {
    const block = editor.slice(editor.indexOf("const resolvedSurface = resolveSurface("), editor.indexOf("const surface = resolvedSurface.surface;"));
    assert.equal(/projectKind/.test(block), false);
    assert.match(block, /tagMapped, siteUrl: browserUrl \|\| projectBrowserUrl/);
  });

  it("carries the SEO tab's row and its panel — one compile unit with the tab list", () => {
    assert.match(editor, /seo: \{ label: "SEO", icon: Globe \}/);
    assert.match(editor, /if \(tab === "seo"\) \{/);
    assert.match(editor, /<PageSeoPanel\s+target=\{seoTarget\}/);
    // Above the portal-document guard, like Repo and Drafts: the case that
    // matters most is exactly the one with no portal document.
    assert.ok(
      editor.indexOf('if (tab === "seo")') < editor.indexOf("These tools apply to an Aqua-hosted portal"),
      "the SEO panel must not sit below the portal-document guard",
    );
  });

  it("resolves WHICH PAGE from the navigator, and refuses rather than guessing", () => {
    assert.match(editor, /const seoTarget: PageSeoTarget = \(\(\) => \{/);
    // The file the navigator carried, not a re-derivation.
    assert.match(editor, /navigatorDestination\?\.source === "repository" && navigatorDestination\.file/);
    // A tag-seen page with no matching route is refused, and says why.
    assert.match(editor, /The Aqua Tag can see this page/);
    assert.match(editor, /kind: "none"/);
  });

  it("writes a portal page's SEO through the document's OWN edit path", () => {
    // Not a second write mechanism: the same `edit()` every other portal
    // panel uses, so it rides the existing Save draft and Publish.
    assert.match(editor, /function setPortalPageSeo\(next: PageSeo\) \{/);
    assert.match(editor, /const stored = storedPageSeo\(next\);/);
    assert.match(editor, /delete page\.seo;/);
  });
});

describe("the panel and the switch say what is true", () => {
  it("the SEO panel previews before it commits, and repeats the SERVER's sentence", () => {
    const panel = readFileSync(PANEL_FILE, "utf8");
    assert.match(panel, /action: "seo-write"/);
    assert.match(panel, /\.\.\.\(confirm \? \{ confirm: true, fingerprint: preview\?\.fingerprint \} : \{\}\)/);
    assert.match(panel, /setNotice\(payload\.summary/);
    // One endpoint. No SEO store, no second write path.
    assert.equal((panel.match(/fetch\(/g) ?? []).length, 2, "read and write, both on repo-write");
    assert.match(panel, /const REPO_WRITE_ENDPOINT = "\/api\/portal\/dev\/repo-write"/);
    assert.equal(/api\/portal\/dev\/seo/.test(panel), false, "there must be no separate SEO endpoint");
  });

  it("the portal branch says plainly that nothing public renders it", () => {
    // The "surfaces that state a falsehood" rule, applied to our own new
    // surface: an Aqua-hosted portal is behind a login.
    const panel = readFileSync(PANEL_FILE, "utf8");
    assert.match(panel, /behind a login — nothing public renders these/);
  });

  it("the switch shows both states at rest and carries the WHY", () => {
    const control = readFileSync(SWITCH_FILE, "utf8");
    assert.match(control, /aria-label="Editor surface"/);
    assert.match(control, /aria-pressed=\{active\}/);
    assert.match(control, /resolved\.sentence/);
    assert.match(control, /title=\{resolved\.sentence\}/, "the whole sentence survives truncation");
  });

  it("the tab list, the meta row and the panel branch are one compile unit", () => {
    // TAB_META is an exhaustive Record<InspectorTab, …>, so tsc holds the
    // three together. This pins the note that says so, because the note is
    // what stops the next agent adding a tab and wondering why it will not
    // build.
    const modes = readFileSync(MODES_FILE, "utf8");
    assert.match(modes, /Same compile-unit rule as every[\s\S]{0,120}TAB_META/);
    assert.match(modes, /if \(tab === "seo"\) return target\.surface === "website";/);
  });
});

// ─── 10. WHAT THE FLOW VERIFIER FOUND, 2026-08-22 ────────────────────────────
//
// Four defects in the phase-9 work, each proven by driving the real thing
// rather than reading it. Pinned here beside the code they belong to rather
// than in a suite of their own, so the next person changing `pageSeo.ts` reads
// them in the same file as the rule they constrain.

describe("a file's own line endings survive the edit", () => {
  // THE FINDING, verbatim: "pageSeo.ts:711 splits on /\r?\n/ and joins with
  // '\n' — an 8-line CRLF .html went in at 170 bytes and came out 233 with
  // ZERO CRLF left. The 'nothing outside the markers changed' claim is false."
  const CRLF_HTML = [
    "<!doctype html>",
    "<html>",
    "  <head>",
    '    <meta charset="utf-8">',
    "  </head>",
    "  <body><p>hi</p></body>",
    "</html>",
  ].join("\r\n");

  it("a CRLF page comes back a CRLF page, and gains not one lone LF", () => {
    const plan = planPageSeoEdit({ contents: CRLF_HTML, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    // Every newline in the result is a CRLF — including the ones the editor
    // itself wrote, which take the file's own ending rather than the module's.
    assert.equal(/(^|[^\r])\n/.test(plan.newContents), false, "a lone LF appeared in a CRLF file");
    assert.equal((plan.newContents.match(/\r\n/g) ?? []).length, plan.newContents.split("\n").length - 1);
  });

  it("EVERY byte outside the two markers is the byte that was there before", () => {
    // The claim the finding falsified, now asserted on bytes rather than on
    // lines — splitting into lines is exactly what hid it.
    const plan = planPageSeoEdit({ contents: CRLF_HTML, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    const open = plan.newContents.indexOf(HTML_SEO_OPEN);
    const close = plan.newContents.indexOf(HTML_SEO_CLOSE) + HTML_SEO_CLOSE.length;
    assert.ok(open > 0 && close > open);
    // Drop the block and the whitespace of the line it sits on, and what is
    // left must be the original document, byte for byte.
    const before = plan.newContents.slice(0, open).replace(/[ \t]*$/, "");
    const after = plan.newContents.slice(close);
    assert.equal(before + after.replace(/^\r\n/, ""), CRLF_HTML);
  });

  it("and an LF file is still an LF file — the rule is 'preserve', not 'prefer CRLF'", () => {
    const plan = planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (plan.ok) assert.equal(plan.newContents.includes("\r"), false);
  });

  it("holds on the Next metadata path, on a replace, and on a remove", () => {
    const crlfPage = APP_PAGE.split("\n").join("\r\n");
    const insert = planPageSeoEdit({ contents: crlfPage, file: "app/p/page.tsx", seo: FULL });
    assert.ok(insert.ok);
    if (!insert.ok) return;
    assert.equal(/(^|[^\r])\n/.test(insert.newContents), false);

    // Replace: the block is already there, and the file is still CRLF.
    const changed = normalisePageSeo({ ...FULL, title: "Something else" });
    const replaced = planPageSeoEdit({ contents: insert.newContents, file: "app/p/page.tsx", seo: changed });
    assert.ok(replaced.ok);
    if (!replaced.ok) return;
    assert.equal(replaced.action, "replace");
    assert.equal(/(^|[^\r])\n/.test(replaced.newContents), false);

    // Remove: everything cleared takes the block out and leaves the rest.
    const removed = planPageSeoEdit({ contents: insert.newContents, file: "app/p/page.tsx", seo: EMPTY_PAGE_SEO });
    assert.ok(removed.ok);
    if (!removed.ok) return;
    assert.equal(removed.action, "remove");
    assert.equal(/(^|[^\r])\n/.test(removed.newContents), false);
    assert.equal(removed.newContents.includes("export default function Page()"), true);
  });

  it("a mixed-ending file keeps each line's OWN ending, not a majority vote", () => {
    const mixed = "<html>\r\n  <head>\n  </head>\r\n  <body></body>\n</html>";
    const plan = planPageSeoEdit({ contents: mixed, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    // The untouched `</head>` line still ends CRLF and the `<head>` line still
    // ends LF, exactly as they did.
    assert.match(plan.newContents, /<\/head>\r\n/);
    assert.match(plan.newContents, /<head>\n/);
    assert.match(plan.newContents, /<\/html>$/);
  });

  it("reading it back is the same round trip it always was", () => {
    const plan = planPageSeoEdit({ contents: CRLF_HTML, file: "index.html", seo: FULL });
    assert.ok(plan.ok);
    if (plan.ok) {
      assert.ok(pageSeoEquals(readPageSeo({ contents: plan.newContents, file: "index.html" }).seo, FULL));
    }
  });
});

describe("the card size says so when it cannot be written", () => {
  // THE FINDING: "The card-size choice is silently unwritable unless a social
  // field is filled." Both emitters only put a `twitter:card` out when there is
  // something to put ON the card, which is right. The panel offered the select
  // regardless, so changing it enabled Preview, sent a request, and came back
  // "already says exactly this" — a control that did nothing and did not say so.
  const CARD_ONLY = normalisePageSeo({ title: "A page", twitterCard: "summary" });

  it("names the reason on the field, rather than leaving it inert and silent", () => {
    assert.match(pageSeoFieldInert(CARD_ONLY, "twitterCard") ?? "", /only written when there is a card to size/);
    // With any one social field filled it is live again.
    for (const field of ["ogTitle", "ogDescription", "ogImage"] as const) {
      const withSocial = normalisePageSeo({ ...CARD_ONLY, [field]: field === "ogImage" ? "https://a.test/x.png" : "x" });
      assert.equal(pageSeoFieldInert(withSocial, "twitterCard"), null, `${field} should make the card size live`);
    }
    // It is the ONLY inert field — every other one writes on its own.
    for (const field of PAGE_SEO_FIELDS) {
      if (field === "twitterCard") continue;
      assert.equal(pageSeoFieldInert(CARD_ONLY, field), null, `${field} must not be declared inert`);
    }
  });

  it("is not counted as a change, because no emitter would emit it", () => {
    const flipped = normalisePageSeo({ ...CARD_ONLY, twitterCard: "summary_large_image" });
    // Raw: the two objects genuinely differ…
    assert.equal(pageSeoEquals(CARD_ONLY, flipped), false);
    // …but nothing would be WRITTEN differently, which is what the panel's
    // Preview button is asking about.
    assert.ok(pageSeoWriteEquals(CARD_ONLY, flipped));
    assert.equal(effectivePageSeo(CARD_ONLY).twitterCard, EMPTY_PAGE_SEO.twitterCard);
    // And with a social field present the change is real again.
    const social = normalisePageSeo({ ...CARD_ONLY, ogTitle: "Shared" });
    assert.equal(pageSeoWriteEquals(social, normalisePageSeo({ ...social, twitterCard: "summary_large_image" })), false);
  });

  it("the emitters agree with the rule — that is the reason the rule exists", () => {
    assert.equal(emitHtmlSeoBlock(CARD_ONLY).some(line => line.includes("twitter:card")), false);
    assert.equal(JSON.stringify(planPageSeoEdit({ contents: CLEAN_HTML, file: "index.html", seo: CARD_ONLY })).includes("twitter:card"), false);
    const withSocial = normalisePageSeo({ ...CARD_ONLY, ogTitle: "Shared" });
    assert.ok(emitHtmlSeoBlock(withSocial).some(line => line.includes('name="twitter:card" content="summary"')));
  });

  it("the panel shows the reason and gates its own Preview on the writable difference", () => {
    const panel = readFileSync(PANEL_FILE, "utf8");
    assert.match(panel, /const dirty = !pageSeoWriteEquals\(draft, saved\);/);
    assert.match(panel, /const inertCardSize = pageSeoFieldInert\(draft, "twitterCard"\);/);
    assert.match(panel, /<Field label="Card size" hint=\{inertCardSize \?\? undefined\}>/);
    assert.equal(/const dirty = !pageSeoEquals\(/.test(panel), false, "the raw comparison is back");
  });
});

describe("the layout the engine can write is reachable from the panel", () => {
  // THE FINDING: "app/layout.tsx is writable by the engine but unreachable
  // from the UI — and the panel points at it." The navigator lists ROUTES and
  // a layout is not a route, so the one file the refusal sentence advertised
  // could never be selected. Mounted rather than deleted: "built and never
  // mounted" is this editor's oldest disease, and a site's default title
  // genuinely does live in the root layout.
  const FILES = [
    "app/layout.tsx",
    "app/page.tsx",
    "app/(marketing)/layout.tsx",
    "app/(marketing)/pricing/page.tsx",
    "app/blog/layout.js",
    "app/blog/[slug]/page.tsx",
    "src/components/Card.tsx",
  ];

  it("resolves the NEAREST layout above a page, exactly as Next merges them", () => {
    assert.equal(governingLayout("app/page.tsx", FILES), "app/layout.tsx");
    assert.equal(governingLayout("app/(marketing)/pricing/page.tsx", FILES), "app/(marketing)/layout.tsx");
    assert.equal(governingLayout("app/blog/[slug]/page.tsx", FILES), "app/blog/layout.js");
  });

  it("answers null rather than guessing", () => {
    assert.equal(governingLayout("app/page.tsx", ["app/page.tsx"]), null, "no layout in the repository");
    assert.equal(governingLayout("index.html", FILES), null, "an .html page has no layout");
    assert.equal(governingLayout("pages/about.tsx", ["pages/about.tsx", "layout.tsx"]), null, "Pages Router");
    assert.equal(governingLayout("app/layout.tsx", FILES), null, "a layout does not have a layout of its own here");
    // Never above the router root: a `layout.tsx` in the repository root is
    // somebody's component, not Next's.
    assert.equal(governingLayout("src/app/page.tsx", ["src/app/page.tsx", "layout.tsx", "src/layout.tsx"]), null);
    assert.equal(governingLayout("src/app/a/page.tsx", ["src/app/a/page.tsx", "src/app/layout.tsx"]), "src/app/layout.tsx");
  });

  it("the editor puts it ON the target, and the panel offers it as a second file", () => {
    assert.match(editor, /const layout = repoFiles \? governingLayout\(navigatorDestination\.file, repoFiles\) : null;/);
    assert.match(editor, /layout: layout \? \{ path: layout, label: layout \} : null,/);
    const panel = readFileSync(PANEL_FILE, "utf8");
    assert.match(panel, /const layoutFile = target\.kind === "repository" \? target\.layout \?\? null : null;/);
    assert.match(panel, /aria-label="Which file's head"/);
    // The page is always the default — per-page is what the surface is for.
    assert.match(panel, /const \[editingLayout, setEditingLayout\] = useState\(false\);/);
    assert.match(panel, /useEffect\(\(\) => \{ setEditingLayout\(false\); \}, \[pageFile\]\);/);
    // …and the file the requests actually carry is the chosen one, not the page.
    assert.match(panel, /const activePath = editingLayout && layoutFile \? layoutFile\.path : pageFile;/);
    assert.match(panel, /action: "seo-read", project: target\.projectId, path: activePath/);
    assert.match(panel, /path: activePath,/);
    assert.match(panel, /\$\{target\.projectId\}:\$\{activePath\}/, "the reload key must follow the chosen file");
    // …and the HEADING follows it too. A form headed `/about` while writing
    // `app/layout.tsx` is the confusion that block exists to prevent.
    assert.match(panel, /editingLayout && layoutFile \? layoutFile\.label : target\.label/);
  });

  it("REVERSE CROSS-PIN — every file the engine accepts is a file the UI can point at", () => {
    // The forward direction (every route the navigator derives has a head
    // answer) has been pinned since phase 9. This is the direction that was
    // missing, and it is the one that caught both `page.js` and the layout: a
    // capability the panel advertises and cannot reach is a lie in a sentence.
    const reachable = new Set<string>();
    for (const route of repositoryRoutes(FILES)) if (route.file) reachable.add(route.file);
    for (const page of [...reachable]) {
      const layout = governingLayout(page, FILES);
      if (layout) reachable.add(layout);
    }
    for (const file of FILES) {
      const answer = seoMechanismFor(file);
      if (answer.mechanism === "unsupported") continue;
      assert.ok(reachable.has(file), `${file} is writable by the engine and unreachable from the navigator`);
    }
    // And the two that made the finding are in there.
    assert.ok(reachable.has("app/layout.tsx"));
    assert.ok(reachable.has("app/blog/layout.js"));
    // The forward direction still holds for a JavaScript repository.
    for (const route of repositoryRoutes(["app/page.js", "app/about/page.mjs"])) {
      assert.equal(seoMechanismFor(route.file!).mechanism, "next-metadata");
    }
  });
});
