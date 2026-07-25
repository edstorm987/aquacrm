// Smoke — R032 i18n / multi-language per page.

import {
  normaliseLocale,
  parseLocalePrefix,
  parseAcceptLanguage,
  resolveLocale,
  localizedTree,
  localizedUrl,
  buildHreflangLinks,
  cloneTreeForLocale,
  auditLocale,
  type LocalePageMap,
} from "../lib/i18n";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── A: normaliseLocale ────────────────────────────────────────────────
  expect("'en' → 'en'", normaliseLocale("en") === "en");
  expect("'EN' → 'en'", normaliseLocale("EN") === "en");
  expect("'en-us' → 'en-US'", normaliseLocale("en-us") === "en-US");
  expect("'EN-us' → 'en-US'", normaliseLocale("EN-us") === "en-US");
  expect("'en_US' → 'en-US'", normaliseLocale("en_US") === "en-US");
  expect("'fr-CA' → 'fr-CA'", normaliseLocale("fr-CA") === "fr-CA");
  expect("garbage → null", normaliseLocale("xx-yy-zz") === null);
  expect("empty → null", normaliseLocale("") === null);
  expect("null → null", normaliseLocale(null) === null);

  // ─── B: parseLocalePrefix ──────────────────────────────────────────────
  const avail = ["en", "fr", "es"];
  expect("/fr/about → fr",
    parseLocalePrefix("/fr/about", avail)?.locale === "fr" &&
    parseLocalePrefix("/fr/about", avail)?.restPath === "/about");
  expect("/FR/About case-insensitive prefix matches",
    parseLocalePrefix("/FR/About", avail)?.locale === "fr");
  expect("/fr → fr w/ restPath '/'",
    parseLocalePrefix("/fr", avail)?.restPath === "/");
  expect("/about → null (no locale prefix)",
    parseLocalePrefix("/about", avail) === null);
  expect("/de/about → null (locale not available)",
    parseLocalePrefix("/de/about", avail) === null);

  // ─── C: parseAcceptLanguage ───────────────────────────────────────────
  expect("'fr,en;q=0.9' sorted by quality",
    JSON.stringify(parseAcceptLanguage("fr,en;q=0.9")) === JSON.stringify(["fr", "en"]));
  expect("explicit quality wins",
    JSON.stringify(parseAcceptLanguage("en;q=0.5,fr;q=0.9")) === JSON.stringify(["fr", "en"]));
  expect("'*' wildcard skipped",
    JSON.stringify(parseAcceptLanguage("*,en")) === JSON.stringify(["en"]));
  expect("malformed entries skipped",
    JSON.stringify(parseAcceptLanguage("garbage---,en")) === JSON.stringify(["en"]));
  expect("null → []",
    parseAcceptLanguage(null).length === 0);
  expect("regional preserved + uppercased",
    parseAcceptLanguage("en-us,fr-ca")[0] === "en-US");

  // ─── D: resolveLocale priority ────────────────────────────────────────
  const page: LocalePageMap = {
    defaultLocale: "en",
    locales: {
      en: { tree: [{ id: "h", type: "heading", props: { text: "Hello", level: 1 } }] },
      fr: { tree: [{ id: "h_loc", type: "heading", props: { text: "Bonjour", level: 1 } }] },
    },
  };

  // 1. Override wins over URL + accept-language.
  const r1 = resolveLocale({
    pathname: "/fr/about",
    acceptLanguage: "es",
    override: "en",
  }, page);
  expect("override wins (en even though URL is /fr)",
    r1.locale === "en" && r1.source === "override");

  // 2. URL wins over accept-language.
  const r2 = resolveLocale({
    pathname: "/fr/about",
    acceptLanguage: "es",
  }, page);
  expect("URL prefix wins over accept-language",
    r2.locale === "fr" && r2.source === "url" && r2.restPath === "/about");

  // 3. Accept-language matches.
  const r3 = resolveLocale({
    pathname: "/about",
    acceptLanguage: "fr;q=0.9,en;q=0.5",
  }, page);
  expect("accept-language picks fr",
    r3.locale === "fr" && r3.source === "accept-language" && r3.restPath === "/about");

  // 4. Accept-language language-only fallback (fr-CA → fr).
  const r4 = resolveLocale({
    pathname: "/about",
    acceptLanguage: "fr-CA",
  }, page);
  expect("fr-CA falls back to available 'fr'",
    r4.locale === "fr" && r4.source === "accept-language");

  // 5. No match → default.
  const r5 = resolveLocale({
    pathname: "/about",
    acceptLanguage: "de,it",
  }, page);
  expect("no match → defaultLocale, source=default",
    r5.locale === "en" && r5.source === "default");

  // 6. Override that doesn't match available falls through.
  const r6 = resolveLocale({
    pathname: "/about",
    acceptLanguage: "fr",
    override: "de",
  }, page);
  expect("invalid override falls through to accept-language",
    r6.locale === "fr" && r6.source === "accept-language");

  // ─── E: localizedTree fallback ────────────────────────────────────────
  const en = localizedTree(page, "en");
  expect("localizedTree(en) returns en, no fallback",
    en.locale === "en" && !en.wasFallback &&
    (en.tree[0]!.props.text as string) === "Hello");

  const missing = localizedTree(page, "de");
  expect("localizedTree(de) → fallback to default w/ wasFallback=true",
    missing.locale === "en" && missing.wasFallback === true);

  const emptyMap: LocalePageMap = { defaultLocale: "en", locales: {} };
  const emptyResult = localizedTree(emptyMap, "en");
  expect("missing default → empty tree, wasFallback",
    emptyResult.tree.length === 0 && emptyResult.wasFallback === true);

  // ─── F: localizedUrl ──────────────────────────────────────────────────
  expect("default locale stays unprefixed",
    localizedUrl("/about", "en", "en") === "/about");
  expect("non-default prepends locale",
    localizedUrl("/about", "fr", "en") === "/fr/about");
  expect("root '/' for non-default → /fr",
    localizedUrl("/", "fr", "en") === "/fr");
  expect("missing leading slash → added",
    localizedUrl("about", "fr", "en") === "/fr/about");

  // ─── G: buildHreflangLinks ────────────────────────────────────────────
  const links = buildHreflangLinks("/about", page, "https://example.com");
  expect("hreflang en (default, no prefix)",
    links.includes('hreflang="en"') && links.includes('href="https://example.com/about"'));
  expect("hreflang fr (prefixed)",
    links.includes('hreflang="fr"') && links.includes('href="https://example.com/fr/about"'));
  expect("hreflang x-default present",
    links.includes('hreflang="x-default"'));
  expect("attribute escaping safe (no raw quotes leaking)",
    !links.includes('href="https://example.com/about" foo='));

  // ─── H: cloneTreeForLocale ────────────────────────────────────────────
  const src: Block[] = [
    { id: "s1", type: "section", props: {}, children: [
      { id: "h1", type: "heading", props: { text: "Welcome", level: 1 } },
      { id: "img1", type: "image", props: { src: "/x.jpg", alt: "Hero" } },
    ]},
  ];
  const cloned = await cloneTreeForLocale(src, {
    translate: (s) => `[FR] ${s}`,
    idSuffix: "_fr",
  });
  expect("cloneTreeForLocale rewrites text",
    (cloned[0]!.children![0]!.props.text as string) === "[FR] Welcome");
  expect("cloneTreeForLocale rewrites alt",
    (cloned[0]!.children![1]!.props.alt as string) === "[FR] Hero");
  expect("cloneTreeForLocale preserves non-translatable props",
    (cloned[0]!.children![1]!.props.src as string) === "/x.jpg");
  expect("cloneTreeForLocale stamps id suffix",
    cloned[0]!.id === "s1_fr" &&
    cloned[0]!.children![0]!.id === "h1_fr");
  expect("cloneTreeForLocale doesn't mutate source",
    (src[0]!.children![0]!.props.text as string) === "Welcome");

  // Default identity translator preserves source — operator paste path.
  const identity = await cloneTreeForLocale(src);
  expect("default identity translator preserves text",
    (identity[0]!.children![0]!.props.text as string) === "Welcome");
  expect("default identity uses _loc suffix",
    identity[0]!.id === "s1_loc");

  // ─── I: auditLocale ──────────────────────────────────────────────────
  // Source has 2 strings: "Welcome" + "Hero" + nothing else translatable.
  const halfTranslated: Block[] = [
    { id: "s1_fr", type: "section", props: {}, children: [
      { id: "h1_fr", type: "heading", props: { text: "Bienvenue", level: 1 } },
      { id: "img1_fr", type: "image", props: { src: "/x.jpg", alt: "Hero" } }, // untranslated (same)
    ]},
  ];
  const audit = auditLocale(src, halfTranslated);
  expect("audit totalStrings counts translatable props",
    audit.totalStrings === 2);
  expect("audit translated=1 (Welcome→Bienvenue)",
    audit.translated === 1);
  expect("audit untranslated=1 (alt unchanged)",
    audit.untranslated === 1);
  expect("audit missingBlocks=0",
    audit.missingBlocks === 0);
  expect("audit complete=false",
    audit.complete === false);

  // Fully translated.
  const fullTranslated: Block[] = [
    { id: "s1_fr", type: "section", props: {}, children: [
      { id: "h1_fr", type: "heading", props: { text: "Bienvenue", level: 1 } },
      { id: "img1_fr", type: "image", props: { src: "/x.jpg", alt: "Image héroïque" } },
    ]},
  ];
  const fullAudit = auditLocale(src, fullTranslated);
  expect("fully translated → complete=true",
    fullAudit.complete === true && fullAudit.translated === 2 && fullAudit.untranslated === 0);

  // Missing blocks.
  const missingChild: Block[] = [
    { id: "s1_fr", type: "section", props: {}, children: [
      { id: "h1_fr", type: "heading", props: { text: "Bienvenue", level: 1 } },
    ]},
  ];
  const missingAudit = auditLocale(src, missingChild);
  expect("missing block flagged",
    missingAudit.missingBlocks > 0 && missingAudit.complete === false);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
