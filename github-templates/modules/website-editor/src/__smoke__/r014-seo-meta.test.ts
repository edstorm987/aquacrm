// Smoke — R014 SEO meta + favicon + sitemap + OG card.
//
// Asserts:
//   - EditorPageSeo accepts canonical + keywords (typecheck only)
//   - deriveFaviconUrls picks brand logo when set, fallback when not
//   - faviconHeadLinks emits 5 link/meta tags
//   - buildSitemapXml: published-only, no portal-variants, no noIndex,
//     no underscore-prefixed slugs, valid XML escape
//   - buildRobotsTxt: Disallow per noIndex, /_*, /embed/, sitemap pointer
//   - buildOgCardSvg: title wrapping, brand line, light/dark text choice
//   - HTTP handlers shape (200 with right content-type, 400 missing title)

import { deriveFaviconUrls, faviconHeadLinks } from "../lib/faviconUrls";
import { buildSitemapXml, buildRobotsTxt, type SitemapPage } from "../server/sitemap";
import { buildOgCardSvg, buildOgCardDataUrl } from "../server/ogImageGenerator";
import { handleSitemapXml, handleRobotsTxt, handleOgCard } from "../api/handlers/seoMeta";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { BrandKit } from "../lib/tenancy";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── faviconUrls ────────────────────────────────────────────────────────
  const brandWithLogo: BrandKit = { primaryColor: "#0ea5e9", logoUrl: "https://example.com/logo.png" };
  const withLogo = deriveFaviconUrls(brandWithLogo);
  expect("with logoUrl, all 4 favicon urls point to the logo",
    withLogo.ico === "https://example.com/logo.png" &&
    withLogo.favicon32 === "https://example.com/logo.png" &&
    withLogo.favicon192 === "https://example.com/logo.png" &&
    withLogo.appleTouch === "https://example.com/logo.png");
  expect("manifestThemeColor mirrors primaryColor",
    withLogo.manifestThemeColor === "#0ea5e9");

  const brandNoLogo: BrandKit = { primaryColor: "#ff6b35" };
  const noLogo = deriveFaviconUrls(brandNoLogo);
  expect("without logoUrl, fallbacks land at /favicon-default-…",
    noLogo.favicon32 === "/favicon-default-32.png" &&
    noLogo.favicon192 === "/favicon-default-192.png" &&
    noLogo.appleTouch === "/favicon-default-180.png");

  // Per-variant override.
  const overridden = deriveFaviconUrls(brandWithLogo, { logoUrl: "https://example.com/variant.png" });
  expect("variant override wins over brand logo",
    overridden.ico === "https://example.com/variant.png");

  const links = faviconHeadLinks(noLogo);
  expect("faviconHeadLinks emits 5 head fragments",
    links.length === 5 &&
    links[0]!.startsWith('<link rel="icon"') &&
    links[3]!.startsWith('<link rel="apple-touch-icon"') &&
    links[4]!.startsWith('<meta name="theme-color"'));

  // ─── sitemap ────────────────────────────────────────────────────────────
  const pages: SitemapPage[] = [
    { slug: "/", status: "published", updatedAt: 1717000000000 },
    { slug: "about", status: "published" },
    { slug: "/blog/post-with-special-chars", status: "published" },
    { slug: "draft-page", status: "draft" },                 // excluded
    { slug: "noindex-page", status: "published", noIndex: true }, // excluded
    { slug: "_portal-login-x", status: "published", isPortalVariant: true }, // excluded
    { slug: "_internal", status: "published" },              // excluded (underscore)
  ];
  const xml = buildSitemapXml(pages, "https://luvandker.com");
  expect("sitemap is XML 1.0 with urlset",
    xml.startsWith('<?xml version="1.0"') && xml.includes("<urlset"));
  expect("sitemap includes published-non-noindex-non-portal pages only",
    xml.includes("<loc>https://luvandker.com/</loc>") &&
    xml.includes("<loc>https://luvandker.com/about</loc>") &&
    xml.includes("<loc>https://luvandker.com/blog/post-with-special-chars</loc>"));
  expect("sitemap excludes drafts", !xml.includes("draft-page"));
  expect("sitemap excludes noIndex pages", !xml.includes("noindex-page"));
  expect("sitemap excludes portal variants", !xml.includes("_portal-login-x"));
  expect("sitemap excludes underscore-prefixed slugs", !xml.includes("_internal"));
  expect("sitemap emits lastmod when updatedAt present",
    xml.includes("<lastmod>"));
  expect("sitemap base URL trailing slash stripped",
    !xml.includes("<loc>https://luvandker.com//</loc>"));

  // XML escape in slug.
  const escapeTest = buildSitemapXml(
    [{ slug: "page?a=1&b=2", status: "published" }],
    "https://x.com",
  );
  expect("sitemap escapes ampersand in slug",
    escapeTest.includes("&amp;") && !escapeTest.includes("a=1&b="));

  // ─── robots ─────────────────────────────────────────────────────────────
  const robots = buildRobotsTxt(pages, "https://luvandker.com");
  expect("robots starts with User-agent: *",
    robots.startsWith("User-agent: *"));
  expect("robots Disallow line for noIndex page",
    robots.includes("Disallow: /noindex-page"));
  expect("robots disallows /_* + /embed/",
    robots.includes("Disallow: /_*") && robots.includes("Disallow: /embed/"));
  expect("robots ends with sitemap pointer",
    robots.includes("Sitemap: https://luvandker.com/sitemap.xml"));

  // ─── OG card ────────────────────────────────────────────────────────────
  const og = buildOgCardSvg({
    title: "How we built the Aqua Incubator: a deep-dive on Notion-style portals",
    brandName: "Aqua",
    primaryColor: "#0b1220",
  });
  expect("og card is valid SVG",
    og.startsWith('<?xml version="1.0"') && og.includes("<svg") && og.endsWith("</svg>"));
  expect("og card includes brand name",
    og.includes(">Aqua</text>"));
  expect("og card wraps long title across multiple tspans",
    (og.match(/<tspan/g) ?? []).length >= 2);
  expect("og dark background → white text",
    og.includes('fill="#f5f3ec"'));

  // Light background → dark text.
  const ogLight = buildOgCardSvg({
    title: "Hello",
    primaryColor: "#fefefe",
  });
  expect("og light background → dark text",
    ogLight.includes('fill="#0b1220"'));

  // Custom textColor wins.
  const ogCustom = buildOgCardSvg({
    title: "Hi",
    primaryColor: "#000",
    textColor: "#fbbf24",
  });
  expect("og textColor override honoured",
    ogCustom.includes('fill="#fbbf24"'));

  // XML escape for title.
  const ogEscape = buildOgCardSvg({
    title: "Tom & Jerry <chase> them",
    primaryColor: "#000",
  });
  expect("og card escapes title XML",
    ogEscape.includes("Tom &amp; Jerry &lt;chase&gt;"));

  // Data URL surface.
  const data = buildOgCardDataUrl({ title: "Hi", primaryColor: "#000" });
  expect("buildOgCardDataUrl returns SVG data URL",
    data.startsWith("data:image/svg+xml;base64,"));

  // ─── HTTP handlers ─────────────────────────────────────────────────────
  const ctx = {
    agencyId: "ag_smoke",
    clientId: "cl_smoke",
    actor: "u_smoke",
    storage: memStorage(),
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleSitemapXml>[1];

  // Empty: no sites yet.
  const emptySitemap = await handleSitemapXml(new Request("https://luvandker.com/sitemap.xml"), ctx);
  expect("GET /sitemap.xml 200 with no sites",
    emptySitemap.status === 200 &&
    (emptySitemap.headers.get("content-type") ?? "").startsWith("application/xml"));
  const emptyXml = await emptySitemap.text();
  expect("empty sitemap still emits valid <urlset>",
    emptyXml.includes("<urlset") && emptyXml.includes("</urlset>"));

  const emptyRobots = await handleRobotsTxt(new Request("https://luvandker.com/robots.txt"), ctx);
  expect("GET /robots.txt 200 + text/plain",
    emptyRobots.status === 200 &&
    (emptyRobots.headers.get("content-type") ?? "").startsWith("text/plain"));
  const robotsTxt = await emptyRobots.text();
  expect("robots.txt always emits sitemap pointer",
    robotsTxt.includes("Sitemap: https://luvandker.com/sitemap.xml"));

  // OG handler — public-ish, returns 200 with title, 400 without.
  const ogRes = await handleOgCard(
    new Request("https://x/og?title=" + encodeURIComponent("Welcome to Aqua") + "&color=" + encodeURIComponent("#0ea5e9") + "&brand=Aqua"),
    ctx,
  );
  expect("GET /og 200 + image/svg+xml",
    ogRes.status === 200 &&
    (ogRes.headers.get("content-type") ?? "").startsWith("image/svg+xml"));
  const ogText = await ogRes.text();
  expect("og response renders title",
    ogText.includes("Welcome to Aqua") || ogText.includes("Welcome to") && ogText.includes("Aqua"));

  const og400 = await handleOgCard(new Request("https://x/og"), ctx);
  expect("GET /og without title → 400", og400.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
