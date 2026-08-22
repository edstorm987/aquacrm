/**
 * The navigator — dev-editor-finish phase 8.
 *
 * Ed, pointing the editor at a real website: *"if i put in a website id get
 * stuck"*. The browser loaded ONE address and there was nothing on screen that
 * could reach the site's other pages. The old header carried a portal-only
 * "Portal page" select, so a repository-backed project or a tagged website had
 * no page list at all.
 *
 * What is pinned here, and why each one:
 *
 *  1. The DERIVATION. A repository's routes come from paths alone — App
 *     Router, Pages Router, plain HTML — with route groups dropped, private
 *     and parallel folders refused, and dynamic routes listed but NOT
 *     openable. Pure, so it can be checked without GitHub.
 *  2. The SOURCE LINE. Every plan says who answered and how many they found,
 *     and every way of failing to answer has its own sentence. A page list
 *     with no provenance is the thing this control exists not to be.
 *  3. The WIRING. One navigator for every target, replacing the portal-only
 *     select; picking a portal page changes the section, picking anything else
 *     repoints the browser — which is what makes the tag re-handshake.
 *  4. The two switchers Ed asked for both still being there, sized as they
 *     were, plus the `+` on the inspector rail.
 *
 * The protocol half — the tag's link message and the drift guard that holds
 * both sides together — is pinned in `smoke-aqua-tag-bridge.test.ts`, where
 * every other message lives.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  NAVIGATOR_ROUTE_LIMIT,
  navigatorCurrentId,
  navigatorHref,
  navigatorPlan,
  pageLinkDestinations,
  portalPageDestinations,
  repositoryRoutes,
} from "../src/engines/editor/editing/pageNavigator";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const editor = read("src", "engines", "editor", "DevEditor.tsx");
const control = read("src", "components", "editing", "PageNavigator.tsx");

/** Source with comments stripped, so a pin cannot be satisfied by prose. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ─── 1. A repository's routes, from paths alone ──────────────────────────────

describe("the repository's routes are derived from the file tree", () => {
  it("reads the App Router, with or without a src/ prefix", () => {
    const routes = repositoryRoutes([
      "app/page.tsx",
      "src/app/about/page.tsx",
      "app/blog/latest/page.mdx",
      "app/layout.tsx",
      "app/globals.css",
    ]).map(entry => entry.target);
    assert.deepEqual(routes, ["/", "/about", "/blog/latest"]);
  });

  it("drops route groups, which are organisation and not URL", () => {
    const routes = repositoryRoutes([
      "app/(marketing)/pricing/page.tsx",
      "app/(marketing)/(promos)/deals/page.tsx",
    ]).map(entry => entry.target);
    assert.deepEqual(routes, ["/deals", "/pricing"]);
  });

  it("refuses private folders, parallel slots and intercepts — none has a URL", () => {
    assert.deepEqual(repositoryRoutes([
      "app/_components/page.tsx",
      "app/@modal/login/page.tsx",
      "app/feed/(.)photo/page.tsx",
    ]), []);
  });

  it("lists a dynamic route and refuses to open it", () => {
    const [route] = repositoryRoutes(["app/blog/[slug]/page.tsx"]);
    assert.equal(route.target, "/blog/[slug]");
    assert.equal(route.openable, false);
    assert.equal(route.note, "needs a real value");
    // Opening it would be a 404 with the editor's name on it.
    assert.equal(navigatorHref("https://example.test/", route), null);
  });

  it("reads the Pages Router, dropping index, api and the framework's own files", () => {
    const routes = repositoryRoutes([
      "pages/index.tsx",
      "pages/about.tsx",
      "pages/blog/index.jsx",
      "pages/blog/[slug].tsx",
      "pages/api/hello.ts",
      "pages/api/webhook.tsx",
      "pages/_app.tsx",
      "pages/_document.tsx",
    ]).map(entry => `${entry.target}${entry.openable ? "" : "*"}`);
    assert.deepEqual(routes, ["/", "/about", "/blog", "/blog/[slug]*"]);
  });

  it("REWRITTEN PIN — a static page KEEPS its .html, because stripping it invented a 404", () => {
    // WAS: `["/", "/contact", "/thanks"]`.
    //
    // The flow verifier caught it: on Next, files under `public/` are served
    // verbatim, so `public/thanks.html` is at `/thanks.html` and `/thanks` is
    // a 404 with the editor's name on it. The rule this module lives by is
    // that a route it misses is a gap the sentence admits to, and a route it
    // INVENTS is a lie — so the extension stays. It is also the only answer
    // true on both hosts this can be: a static host rooted at `public/` serves
    // `/thanks.html` too, while `/thanks` needs a clean-URL setting nothing
    // here can see. A ROOT `index.html` keeps `/` — that one every host on
    // earth serves as the directory index.
    const routes = repositoryRoutes([
      "index.html",
      "contact.html",
      "public/thanks.html",
      "src/components/Card.tsx",
    ]).map(entry => entry.target);
    assert.deepEqual(routes, ["/", "/contact.html", "/thanks.html"]);
  });

  it("does not promote public/index.html to / — under Next that is the router's", () => {
    assert.deepEqual(
      repositoryRoutes(["public/index.html", "public/legal/terms.html"]).map(entry => entry.target),
      ["/index.html", "/legal/terms.html"],
    );
    // `.htm` is a page too, and `seoMechanismFor` has always accepted it.
    assert.deepEqual(repositoryRoutes(["about.htm"]).map(entry => entry.target), ["/about.htm"]);
  });

  it("deduplicates, and a real page beats a dynamic one on the same route", () => {
    const routes = repositoryRoutes([
      "app/(a)/thing/page.tsx",
      "app/(b)/thing/page.tsx",
    ]);
    assert.equal(routes.length, 1);
    const both = repositoryRoutes(["app/[slug]/page.tsx", "app/about/page.tsx"]);
    assert.deepEqual(both.map(entry => entry.target), ["/[slug]", "/about"]);
  });

  it("puts the home page first, then reads alphabetically", () => {
    const routes = repositoryRoutes([
      "app/zebra/page.tsx",
      "app/about/page.tsx",
      "app/page.tsx",
    ]).map(entry => entry.target);
    assert.deepEqual(routes, ["/", "/about", "/zebra"]);
  });

  it("refuses a folder merely NAMED app/ or pages/ deep in the tree", () => {
    // Found for real, not imagined: unanchored, this codebase's own
    // `src/built-ins/modules/agency-finance/src/pages/ActivityPage.tsx` read as
    // the route `/ActivityPage`, and the navigator offered 181 rows of which a
    // third were 404s it had promised were pages. A route the navigator MISSES
    // is a gap the sentence admits to; a route it INVENTS is a lie.
    assert.deepEqual(repositoryRoutes([
      "src/built-ins/modules/agency-finance/src/pages/ActivityPage.tsx",
      "packages/ui/src/app/demo/page.tsx",
      "vendor/thing/pages/index.tsx",
    ]), []);
    // …and the root ones still answer.
    assert.deepEqual(
      repositoryRoutes(["app/page.tsx", "src/pages/about.tsx"]).map(entry => entry.target),
      ["/", "/about"],
    );
  });

  it("says nothing about files that are not pages", () => {
    assert.deepEqual(repositoryRoutes([
      "app/api/health/route.ts",
      "README.md",
      "next.config.ts",
      "src/lib/thing.ts",
      "docs/reference/lib.md",
    ]), []);
  });
});

// ─── 2. The source line — who answered, and what they could not answer ───────

describe("the plan always says which source answered", () => {
  it("names the repository and counts its routes", () => {
    const plan = navigatorPlan({
      repository: { name: "edstorm987/Beast-marks", files: ["app/page.tsx", "app/about/page.tsx"] },
    });
    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0].label, "Routes in edstorm987/Beast-marks");
    assert.match(plan.sentence, /2 routes read from edstorm987\/Beast-marks/);
    assert.equal(plan.empty, false);
  });

  it("counts the routes that need a real value, rather than hiding them", () => {
    const plan = navigatorPlan({
      repository: { name: "acme/site", files: ["app/page.tsx", "app/blog/[slug]/page.tsx"] },
    });
    assert.match(plan.sentence, /1 of which need a real value and cannot be opened from here/);
  });

  it("says a truncated GitHub tree out loud — a short list is not a full one", () => {
    const plan = navigatorPlan({
      repository: { name: "acme/site", files: ["app/page.tsx"], truncated: true },
    });
    assert.match(plan.sentence, /GitHub truncated the tree, so some routes are missing/);
  });

  it("caps an enormous repository and says it capped it", () => {
    const files = Array.from({ length: NAVIGATOR_ROUTE_LIMIT + 30 }, (_, index) => `app/p${String(index).padStart(4, "0")}/page.tsx`);
    const plan = navigatorPlan({ repository: { name: "acme/huge", files } });
    assert.equal(plan.destinations.length, NAVIGATOR_ROUTE_LIMIT);
    assert.match(plan.sentence, new RegExp(`the first ${NAVIGATOR_ROUTE_LIMIT} of ${NAVIGATOR_ROUTE_LIMIT + 30}`));
  });

  it("states a repository that could not be read, instead of showing an empty list", () => {
    const plan = navigatorPlan({ repositoryError: "GitHub answered 404 for acme/site" });
    assert.match(plan.sentence, /the repository could not be listed — GitHub answered 404 for acme\/site/);
    assert.equal(plan.empty, true);
  });

  it("distinguishes 'still reading' from 'nothing found'", () => {
    assert.match(navigatorPlan({ repositoryLoading: true }).sentence, /reading the repository's routes…/);
    assert.match(
      navigatorPlan({ repository: { name: "acme/site", files: ["README.md"] } }).sentence,
      /no routes were found in acme\/site — nothing there looks like a page file/,
    );
  });

  it("REWRITTEN PIN — names the tag as the source, and now needs the trusted ORIGIN to accept one", () => {
    // WAS: no `pageLinksOrigin`. The plan took the tag's word that everything
    // it sent was same-origin. See the origin-policy section below for why
    // that is the sender enforcing the receiver's rule.
    const plan = navigatorPlan({
      pageLinks: [{ href: "https://acme.test/pricing", label: "Pricing" }],
      pageLinksOrigin: "https://acme.test",
    });
    assert.equal(plan.groups[0].label, "Links on this page");
    assert.match(plan.sentence, /1 link the Aqua Tag can see on the page in front of you/);
    assert.match(
      navigatorPlan({ pageLinks: [], pageLinksOrigin: "https://acme.test" }).sentence,
      /the Aqua Tag found no links it could follow on this page/,
    );
  });

  it("states a tag that could not answer — silence must become a sentence", () => {
    const plan = navigatorPlan({ pageLinksError: "this page is running an older tag build" });
    assert.match(plan.sentence, /the Aqua Tag could not report this page's links — this page is running an older tag build/);
  });

  it("keeps two sources apart when both answer, and says both", () => {
    const plan = navigatorPlan({
      repository: { name: "acme/site", files: ["app/page.tsx"] },
      pageLinks: [{ href: "https://acme.test/pricing", label: "Pricing" }],
      pageLinksOrigin: "https://acme.test",
    });
    assert.deepEqual(plan.groups.map(group => group.source), ["repository", "page-links"]);
    assert.match(plan.sentence, /1 route read from acme\/site/);
    assert.match(plan.sentence, /1 link the Aqua Tag can see/);
    // Never merged into one anonymous count: every row knows its own source.
    assert.deepEqual([...new Set(plan.destinations.map(entry => entry.source))], ["repository", "page-links"]);
  });

  it("says what would make an answer possible when nothing can answer", () => {
    const plan = navigatorPlan({});
    assert.equal(plan.empty, true);
    assert.match(plan.sentence, /Nothing here can list this project's pages yet/);
    assert.match(plan.sentence, /connect its repository, or install the Aqua Tag/);
  });

  it("puts a portal's own document first — it IS the page list", () => {
    const plan = navigatorPlan({
      portal: { sections: [{ id: "home", label: "Welcome" }], customPages: [{ id: "p1", label: "Handover" }] },
      repository: { name: "acme/site", files: ["app/page.tsx"] },
    });
    assert.deepEqual(plan.groups.map(group => group.label), ["Portal pages", "Routes in acme/site"]);
    assert.match(plan.sentence, /2 pages from this portal's own document/);
  });
});

// ─── 3. What picking one MEANS ───────────────────────────────────────────────

describe("picking a destination", () => {
  it("joins a repository route onto the address the browser is on", () => {
    const [route] = repositoryRoutes(["app/about/page.tsx"]);
    assert.equal(navigatorHref("https://beast-marks.vercel.app/", route), "https://beast-marks.vercel.app/about");
  });

  it("drops the query and hash of the page you were on", () => {
    const [route] = repositoryRoutes(["app/about/page.tsx"]);
    // `?ref=email` belonged to the previous page; carrying it is how a
    // navigator quietly changes what the site renders.
    assert.equal(navigatorHref("https://acme.test/home?ref=email#top", route), "https://acme.test/about");
  });

  it("refuses when there is no address to hang a route off", () => {
    const [route] = repositoryRoutes(["app/about/page.tsx"]);
    assert.equal(navigatorHref("", route), null);
    assert.equal(navigatorHref("not a url", route), null);
    assert.equal(navigatorHref("about:blank", route), null);
  });

  it("REWRITTEN PIN — uses the tag's link exactly as given, once it is on the trusted origin", () => {
    // WAS: `pageLinkDestinations([...])` with no origin. The signature gained
    // one and returns `{ destinations, refused }`, because a refusal is a
    // thing the sentence has to be able to say.
    const { destinations, refused } = pageLinkDestinations(
      [{ href: "https://acme.test/pricing", label: "Pricing" }],
      "https://acme.test",
    );
    assert.equal(refused, 0);
    const [link] = destinations;
    assert.equal(navigatorHref("https://acme.test/", link), "https://acme.test/pricing");
    assert.match(link.label, /^Pricing — \/pricing$/);
  });

  it("is not a URL for a portal page — that changes what renders, not where it points", () => {
    const [page] = portalPageDestinations({ sections: [{ id: "home", label: "Welcome" }], customPages: [] });
    assert.equal(page.target, "home");
    assert.equal(navigatorHref("https://acme.test/", page), null);
  });

  it("lights up the row for the page on screen, and nothing for an unlisted one", () => {
    const plan = navigatorPlan({ repository: { name: "acme/site", files: ["app/page.tsx", "app/about/page.tsx"] } });
    assert.equal(navigatorCurrentId(plan, "https://acme.test/about"), "repository:/about");
    // A trailing slash is the same page.
    assert.equal(navigatorCurrentId(plan, "https://acme.test/about/"), "repository:/about");
    // Typing an address that is not in the list is normal, not an error.
    assert.equal(navigatorCurrentId(plan, "https://acme.test/nowhere"), "");
    assert.equal(navigatorCurrentId(plan, ""), "");
  });
});

// ─── 4. The control, and the two switchers Ed asked for ──────────────────────

describe("the navigator is mounted, and says its source on screen", () => {
  it("is a list you pick from, not a URL bar", () => {
    assert.match(control, /aria-label="Page navigator"/);
    assert.match(control, /<optgroup key=\{group\.source\} label=\{group\.label\}/,
      "each group must be headed by the source that produced it");
    assert.match(control, /disabled=\{!destination\.openable\}/,
      "a route that needs a real value is shown and not openable");
  });

  it("renders the source line, whole in the title and never dropped", () => {
    assert.match(control, /title=\{plan\.sentence\}/);
    assert.match(control, /\{plan\.sentence\}/);
  });

  it("replaced the portal-only page select — one control for every target", () => {
    assert.match(editor, /<PageNavigator plan=\{pageNavigator\} value=\{navigatorValue\} onPick=\{goToPage\}/);
    assert.equal(/aria-label="Portal page"/.test(editor), false,
      "the portal-only select is gone; the navigator lists a portal's pages as one of its sources");
  });

  it("feeds the plan from all three sources and nothing else", () => {
    const at = editor.indexOf("navigatorPlan({");
    assert.ok(at > 0, "the editor no longer builds a navigator plan");
    const block = editor.slice(at, editor.indexOf("}), [", at));
    assert.match(block, /portal: portalTarget/);
    assert.match(block, /repository: repoFiles && selectedProject\?\.repository/);
    assert.match(block, /pageLinks,/);
    // Errors are passed through, never swallowed into an empty list.
    assert.match(block, /repositoryError: repoFilesError/);
    assert.match(block, /pageLinksError: pageLinksError/);
  });

  it("reads the repository through the list the insert picker already uses", () => {
    // REUSE, not a second endpoint: `insert-targets` is already "this
    // repository's files, branch-first", with the tenant-then-project lookup
    // and the per-request vault token that question needs.
    assert.match(editor, /action: "insert-targets", project: projectId/);
    assert.equal(/api\/portal\/dev\/repo-routes/.test(editor), false,
      "a second endpoint answering the same question is a second endpoint that can drift");
  });

  it("asks the tag for this page's links on every handshake, and gives up out loud", () => {
    assert.match(editor, /requestPageLinks\(\);/);
    const at = editor.indexOf("function requestPageLinks");
    const body = editor.slice(at, editor.indexOf("\n  }", at));
    assert.match(body, /aquaTagLinks\(requestId\)/);
    assert.match(body, /tag build from before the navigator existed/,
      "a cached tag answers nothing; silence has to become a sentence");
  });

  it("picking a page repoints the browser, and the tag re-handshakes by itself", () => {
    const at = editor.indexOf("function goToPage");
    const body = editor.slice(at, editor.indexOf("\n  }\n", at));
    assert.match(body, /setSection\(destination\.target as ClientPortalSectionId\)/);
    assert.match(body, /setBrowserUrl\(href\)/);
    // The re-handshake is the frame remounting on a new address, not a manual
    // ping racing a page that has not loaded.
    assert.equal(/pingTag\(\)/.test(body), false, "goToPage must not ping by hand");
    assert.match(editor, /key=\{`\$\{frameKey\}:\$\{url\}`\}/);
    assert.match(editor, /onLoad=\{pingTag\}/);
  });

  it("says so rather than doing nothing when a route has no address to open on", () => {
    const at = editor.indexOf("function goToPage");
    const body = editor.slice(at, editor.indexOf("\n  }\n", at));
    assert.match(body, /point the browser at the site first/);
  });

  it("clears the previous page's links when the preview navigates", () => {
    // The old page's links from the new page is the same class of lie as a
    // stale address left in the browser box.
    const at = editor.indexOf("// A new page is a new handshake");
    const body = editor.slice(at, editor.indexOf("}, [previewSrc, frameKey]);", at));
    assert.match(body, /setPageLinks\(null\)/);
    assert.match(body, /setPageLinksError\(""\)/);
  });
});

describe("Ed's two switchers, and the rail's +, all survived", () => {
  it("the project switcher still leads the mode switch, compact and door-anchored", () => {
    const switcher = editor.indexOf('aria-label="Dev project"');
    const modes = editor.indexOf("<EditorModeSwitch");
    assert.ok(switcher > 0 && switcher < modes);
    const block = editor.slice(editor.lastIndexOf("{availableProjects.length", switcher), editor.indexOf("</select>", switcher));
    assert.equal(/w-full/.test(block), false);
    assert.match(block, /min-h-9/);
    assert.match(block, /w-40/);
    assert.match(editor, /devProjectDoorFamily\(projects, initialProjectId\)/);
  });

  it("the navigator is the SECOND switcher — one project picker, one page picker", () => {
    const stripped = code(editor);
    assert.equal((stripped.match(/aria-label="Dev project"/g) ?? []).length, 1);
    assert.equal((stripped.match(/<PageNavigator /g) ?? []).length, 1);
  });

  it("the + is still on the inspector rail as well as the canvas header", () => {
    const rail = editor.indexOf('<nav aria-label="Inspector tools"');
    assert.ok(rail > 0);
    const block = editor.slice(rail, rail + 900);
    assert.match(block, /<AddMenu/);
    assert.match(block, /align="end"/);
  });
});

// ─── 5. THE EDITOR'S OWN ORIGIN POLICY ON WHAT THE TAG REPORTS ───────────────
//
// Added 2026-08-22 after the flow verifier: *"The links parser trusts the TAG
// to enforce the editor's origin policy, and picking a row MOVES the trusted
// origin."*
//
// Both halves matter, and the second is what makes the first serious.
//
//   • The tag filters same-origin before it sends. That is the right thing for
//     the TAG to do and it is not a rule the EDITOR may rely on — the tag runs
//     inside somebody else's page, its script is served
//     `stale-while-revalidate`, and any script on that page can post into the
//     frame. A receiver that leaves its rule to the sender has no rule.
//   • Picking a row calls `setBrowserUrl`, which becomes the frame's `src`,
//     which is what `aquaTagOrigin` derives the ONE trusted origin from. So an
//     accepted off-origin link does not merely open a page: it silently moves
//     the trust boundary, and the next selection, patch and assistant quote
//     all belong to whoever asked for it.
//
// Two locks on the same door — the parser refuses, and `navigatorHref` refuses
// again at the point of use — because a caller building destinations another
// way must not be able to lose the check.

describe("the editor enforces its own origin policy on the tag's links", () => {
  const here = "https://acme.test";

  it("refuses a link that is not on the trusted origin, and COUNTS it in the sentence", () => {
    const plan = navigatorPlan({
      pageLinks: [
        { href: "https://acme.test/pricing", label: "Pricing" },
        { href: "https://evil.example/steal", label: "Pricing" },
      ],
      pageLinksOrigin: here,
    });
    assert.deepEqual(plan.destinations.map(entry => entry.target), ["https://acme.test/pricing"]);
    assert.match(plan.sentence, /1 link the Aqua Tag can see/);
    assert.match(plan.sentence, /1 link the tag reported is not on https:\/\/acme\.test and was refused/);
  });

  it("a lookalike origin is not the origin — exact, never a prefix or a suffix", () => {
    for (const href of [
      "https://acme.test.evil.net/pricing",
      "https://notacme.test/pricing",
      "http://acme.test/pricing",
      "https://acme.test:8443/pricing",
    ]) {
      const { destinations, refused } = pageLinkDestinations([{ href, label: "x" }], here);
      assert.equal(destinations.length, 0, `${href} was accepted as ${here}`);
      assert.equal(refused, 1);
    }
  });

  it("fails CLOSED — no trusted origin means no links, and the line says so", () => {
    for (const origin of [null, undefined, "", "*", "null"]) {
      const { destinations, refused } = pageLinkDestinations(
        [{ href: "https://acme.test/pricing", label: "Pricing" }],
        origin,
      );
      assert.equal(destinations.length, 0, `origin ${String(origin)} must trust nothing`);
      assert.equal(refused, 1);
    }
    const plan = navigatorPlan({ pageLinks: [{ href: "https://acme.test/a", label: "A" }] });
    assert.equal(plan.groups.length, 0);
    assert.match(plan.sentence, /was refused/);
  });

  it("CHANGED — an href it cannot parse is now refused, where it used to be kept", () => {
    // It used to be kept on the reasoning that "the tag only ever sends
    // absolute same-origin URLs, so an unparseable one is a bug worth seeing".
    // An origin that cannot be read cannot be compared, and a row that cannot
    // be compared must not be openable.
    const { destinations, refused } = pageLinkDestinations(
      [{ href: "/pricing", label: "Pricing" }, { href: "javascript:alert(1)", label: "Go" }],
      here,
    );
    assert.equal(destinations.length, 0);
    assert.equal(refused, 2);
  });

  it("navigatorHref refuses the move as well — the second lock, at the point of use", () => {
    // Built by hand on purpose: this is the path a future caller could take
    // that skips `pageLinkDestinations` entirely.
    const forged = {
      id: "page-links:https://evil.example/",
      label: "Home",
      source: "page-links" as const,
      target: "https://evil.example/",
      openable: true,
    };
    assert.equal(navigatorHref("https://acme.test/", forged), null);
    assert.equal(navigatorHref("https://acme.test/", { ...forged, target: "javascript:alert(1)" }), null);
    // …and the legitimate move still works.
    assert.equal(
      navigatorHref("https://acme.test/", { ...forged, target: "https://acme.test/pricing" }),
      "https://acme.test/pricing",
    );
  });

  it("a repository route still cannot change origin either — it only rewrites the path", () => {
    const [route] = repositoryRoutes(["app/about/page.tsx"]);
    assert.equal(navigatorHref("https://acme.test/x", route), "https://acme.test/about");
  });

  it("the editor hands the navigator the SAME origin its message handler compares against", () => {
    assert.match(editor, /pageLinksOrigin: tagOrigin,/);
    // Resolved BEFORE the navigator memo, or the memo would read a temporal
    // dead zone. Pinned by position, because that ordering is load-bearing.
    assert.ok(
      editor.indexOf("const [tagOrigin, setTagOrigin] = useState<string | null>(null);")
        < editor.indexOf("const pageNavigator = useMemo(() => navigatorPlan({"),
      "tagOrigin must be resolved above the navigator that consumes it",
    );
    assert.match(editor, /allowedOrigin: tagOriginRef\.current/);
  });

  it("and SAYS so when it will not follow a link, rather than doing nothing", () => {
    const at = editor.indexOf("function goToPage");
    const body = editor.slice(at, editor.indexOf("\n  }\n", at));
    assert.match(body, /destination\.source === "page-links"/);
    assert.match(body, /would move the one origin this editor trusts/);
  });
});

// ─── 6. Moving the navigator asks before it throws SEO work away ─────────────

describe("the navigator asks before it discards unsaved SEO", () => {
  it("goToPage is gated on the discard confirmation, before anything moves", () => {
    const at = editor.indexOf("function goToPage");
    const body = editor.slice(at, editor.indexOf("\n  }\n", at));
    assert.match(body, /if \(!confirmSeoDiscard\(\)\) return;/);
    assert.ok(
      body.indexOf("confirmSeoDiscard") < body.indexOf("setBrowserUrl(href)"),
      "the gate must come before the move, not after it",
    );
  });

  it("it is the NARROW gate — a portal draft is not lost by changing page", () => {
    assert.match(editor, /function confirmSeoDiscard\(\) \{[\s\S]{0,240}?window\.confirm\("Discard the SEO fields you have filled in for this page\?"\)/);
    const at = editor.indexOf("function goToPage");
    const body = editor.slice(at, editor.indexOf("\n  }\n", at));
    assert.equal(/confirmDraftDiscard\(\)/.test(body), false,
      "asking about a portal draft that is not at risk teaches people to click through prompts");
  });

  it("the WIDE gate covers both, and still says exactly what it always did for a draft alone", () => {
    assert.match(editor, /if \(dirty\) losing\.push\("the unsaved changes in this draft"\)/);
    assert.match(editor, /if \(seoDirty\) losing\.push\("the SEO fields you have filled in for this page"\)/);
    assert.match(editor, /window\.confirm\(`Discard \$\{losing\.join\(", and "\)\}\?`\)/);
    // Leaving the whole tab loses them too.
    assert.match(editor, /if \(!dirty && !seoDirty\) return;/);
  });

  it("the panel is what reports it — the editor cannot know what a page's head said", () => {
    assert.match(editor, /const \[seoDirty, setSeoDirty\] = useState\(false\);/);
    assert.match(editor, /onSeoDirtyChange=\{setSeoDirty\}/);
    assert.match(editor, /onDirtyChange=\{onSeoDirtyChange\}/);
    const panel = read("src", "components", "editing", "PageSeoPanel.tsx");
    assert.match(panel, /useEffect\(\(\) => \{ onDirtyChange\?\.\(dirty\); \}, \[dirty, onDirtyChange\]\);/);
    // …and reports CLEAN on the way out, or the editor warns about a panel
    // that is no longer on screen.
    assert.match(panel, /useEffect\(\(\) => \(\) => onDirtyChange\?\.\(false\), \[onDirtyChange\]\);/);
  });
});
