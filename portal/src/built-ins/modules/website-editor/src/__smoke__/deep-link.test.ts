// Smoke — R10 deep-link contract + page picker.
//
// Pure tests: every helper in lib/editorDeepLink.ts is framework-free
// so we exercise the whole contract without React or Next routing.

import {
  parseEditorDeepLink, buildEditorDeepLink, pagesForVariant,
  availableVariants, shouldShowVariantSwitcher, resolveStartPage,
  slugify, uniqueSlug, DEFAULT_VARIANT, type PageLike,
} from "../lib/editorDeepLink";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const pages: PageLike[] = [
  { id: "p_home", slug: "/", title: "Home", isHomepage: true, updatedAt: Date.now() - 86_400_000 },
  { id: "p_about", slug: "/about", title: "About", updatedAt: Date.now() - 5 * 86_400_000 },
  { id: "p_pricing", slug: "/pricing", title: "Pricing" },
  { id: "p_login", slug: "/login", title: "Login", variantId: "customer" },
  { id: "p_dashboard", slug: "/dashboard", title: "Dashboard", variantId: "customer" },
];

console.log("parseEditorDeepLink");
const empty = parseEditorDeepLink(new URLSearchParams(""));
expect("empty params: page null + variant default + both defaulted",
  empty.pageId === null && empty.variant === DEFAULT_VARIANT && empty.pageDefaulted && empty.variantDefaulted,
  JSON.stringify(empty));

const explicit = parseEditorDeepLink(new URLSearchParams("page=p_about&variant=customer"));
expect("explicit page+variant: nothing defaulted",
  explicit.pageId === "p_about" && explicit.variant === "customer" && !explicit.pageDefaulted && !explicit.variantDefaulted,
  JSON.stringify(explicit));

const partial = parseEditorDeepLink(new URLSearchParams("page=p_about"));
expect("explicit page only: variant defaulted",
  partial.pageId === "p_about" && partial.variant === DEFAULT_VARIANT && partial.variantDefaulted,
  JSON.stringify(partial));

const recordShape = parseEditorDeepLink({ page: "p_x", variant: undefined });
expect("plain-record shape works", recordShape.pageId === "p_x" && recordShape.variant === DEFAULT_VARIANT);

console.log("\nbuildEditorDeepLink");
expect(
  "builds pure path when defaults",
  buildEditorDeepLink({ clientId: "luv-and-ker" }) === "/portal/clients/luv-and-ker/edit-website",
);
expect(
  "encodes clientId + appends page query",
  buildEditorDeepLink({ clientId: "luv-and-ker", pageId: "p_about" })
    === "/portal/clients/luv-and-ker/edit-website?page=p_about",
);
expect(
  "appends variant only when not default",
  buildEditorDeepLink({ clientId: "c1", pageId: "p1", variant: "customer" })
    === "/portal/clients/c1/edit-website?page=p1&variant=customer",
);
expect(
  "drops variant when default",
  buildEditorDeepLink({ clientId: "c1", pageId: "p1", variant: DEFAULT_VARIANT })
    === "/portal/clients/c1/edit-website?page=p1",
);
let threw = false;
try { buildEditorDeepLink({ clientId: "" }); } catch { threw = true; }
expect("missing clientId throws", threw);

console.log("\npagesForVariant + availableVariants + switcher");
expect("default variant returns 3 pages",
  pagesForVariant(pages, DEFAULT_VARIANT).map(p => p.id).join(",") === "p_home,p_about,p_pricing");
expect("customer variant returns 2 pages",
  pagesForVariant(pages, "customer").map(p => p.id).join(",") === "p_login,p_dashboard");
expect("availableVariants includes default+customer",
  availableVariants(pages).sort().join(",") === "customer,default");
expect("only default → switcher hidden",
  !shouldShowVariantSwitcher(availableVariants(pages.filter(p => !p.variantId))));
expect("multi → switcher visible", shouldShowVariantSwitcher(availableVariants(pages)));

console.log("\nresolveStartPage");
expect("explicit + present: returns it", resolveStartPage(pages, "p_about") === "p_about");
expect("explicit + absent: falls through to home",
  resolveStartPage(pagesForVariant(pages, DEFAULT_VARIANT), "p_does_not_exist") === "p_home");
expect("no request: returns home flag",
  resolveStartPage(pagesForVariant(pages, DEFAULT_VARIANT), null) === "p_home");
expect("no homepage flag: returns first",
  resolveStartPage([{ id: "x", slug: "/x" }, { id: "y", slug: "/y" }], null) === "x");
expect("empty pages: returns null", resolveStartPage([], null) === null);

console.log("\nslugify + uniqueSlug");
expect("slugify lowercases + hyphenates", slugify("My New Page!") === "my-new-page");
expect("slugify strips diacritics", slugify("Café Résumé") === "cafe-resume");
expect("slugify on empty falls back", slugify("") === "untitled");
expect("uniqueSlug returns root when free",
  uniqueSlug(pages, "blog") === "/blog");
expect("uniqueSlug appends -2 when taken",
  uniqueSlug(pages, "about") === "/about-2");
expect("uniqueSlug walks past -2 collision",
  uniqueSlug([...pages, { id: "z", slug: "/about-2" }], "about") === "/about-3");

console.log("\nround-trip: build → parse");
const url = buildEditorDeepLink({ clientId: "luv-and-ker", pageId: "p_about", variant: "customer" });
const tail = url.split("?")[1] ?? "";
const reparsed = parseEditorDeepLink(new URLSearchParams(tail));
expect("URL round-trips through parse",
  reparsed.pageId === "p_about" && reparsed.variant === "customer");

console.log(`\n${passes} passed · ${failures} failed`);
if (failures > 0) process.exit(1);
