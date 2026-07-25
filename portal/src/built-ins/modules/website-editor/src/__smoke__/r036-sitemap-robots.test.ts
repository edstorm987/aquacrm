// Smoke — R036 sitemap.xml + robots.txt advanced generators.

import {
  buildSitemap, buildRobotsTxt, validateSitemap, selectSitemapPages,
  type SitemapPageInput,
} from "../lib/sitemap";
import type { LocalePageMap } from "../lib/i18n";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const BASE = "https://example.com";

(async () => {
  // ─── A: selectSitemapPages filters ────────────────────────────────────
  const pages: SitemapPageInput[] = [
    { slug: "/", status: "published", isHomepage: true, publishedAt: 1700000000000 },
    { slug: "/about", status: "published", publishedAt: 1700000000000 },
    { slug: "/draft", status: "draft" },
    { slug: "/secret", status: "published", privacy: "password" },
    { slug: "/hidden", status: "published", noIndex: true },
    { slug: "/login", status: "published", portalRole: "login" },
    { slug: "/_internal", status: "published" },
    { slug: "/old", status: "published" },          // redirect source
    { slug: "/members", status: "published", privacy: "members-only" },
  ];
  const sel = selectSitemapPages(pages, { redirectFromSlugs: ["/old"] });
  const slugs = sel.map(p => p.slug).sort();
  expect("only / + /about survive filter",
    slugs.length === 2 && slugs.includes("/") && slugs.includes("/about"),
    `got ${slugs.join(",")}`);
  expect("draft excluded", !slugs.includes("/draft"));
  expect("password-private excluded", !slugs.includes("/secret"));
  expect("noIndex excluded", !slugs.includes("/hidden"));
  expect("portal-variant excluded", !slugs.includes("/login"));
  expect("underscore-prefixed excluded", !slugs.includes("/_internal"));
  expect("redirect-source excluded", !slugs.includes("/old"));
  expect("members-only excluded", !slugs.includes("/members"));

  // accepts an array as well as a Set
  const sel2 = selectSitemapPages(pages, { redirectFromSlugs: new Set(["/old"]) });
  expect("Set form of redirect input works", sel2.length === 2);

  // ─── B: buildSitemap basics ───────────────────────────────────────────
  const xml = buildSitemap(sel, { baseUrl: BASE });
  expect("xml has declaration", xml.startsWith('<?xml version="1.0"'));
  expect("xml has urlset open + close",
    xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') &&
    xml.includes("</urlset>"));
  expect("xml has /about loc", xml.includes("<loc>https://example.com/about</loc>"));
  expect("xml has homepage loc", xml.includes("<loc>https://example.com/</loc>"));
  expect("homepage priority defaults to 1.0", /<loc>https:\/\/example\.com\/<\/loc>[\s\S]*?<priority>1\.0<\/priority>/.test(xml));
  expect("non-home priority defaults to 0.5", /<loc>https:\/\/example\.com\/about<\/loc>[\s\S]*?<priority>0\.5<\/priority>/.test(xml));
  expect("default changefreq weekly", /<changefreq>weekly<\/changefreq>/.test(xml));
  expect("lastmod ISO day", /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(xml));
  expect("base trailing slash collapsed",
    !xml.includes("https://example.com//") &&
    buildSitemap(sel, { baseUrl: "https://example.com/" }).includes("https://example.com/about"));

  // overrides
  const xmlOver = buildSitemap(
    [{ slug: "/news", status: "published", publishedAt: 1, priority: 0.8, changefreq: "daily" }],
    { baseUrl: BASE },
  );
  expect("per-page priority override emitted", /<priority>0\.8<\/priority>/.test(xmlOver));
  expect("per-page changefreq override emitted", /<changefreq>daily<\/changefreq>/.test(xmlOver));

  // priority clamps to [0,1]
  const xmlClamp = buildSitemap(
    [{ slug: "/x", status: "published", priority: 99 }],
    { baseUrl: BASE },
  );
  expect("priority clamped to 1.0", /<priority>1\.0<\/priority>/.test(xmlClamp));

  // ─── C: hreflang alternates from R032 LocalePageMap ───────────────────
  const locales: LocalePageMap = {
    defaultLocale: "en",
    locales: {
      en: { tree: [], updatedAt: 1 },
      fr: { tree: [], updatedAt: 1 },
    },
  };
  const xmlI18n = buildSitemap(
    [{ slug: "/about", status: "published", locales }],
    { baseUrl: BASE },
  );
  expect("xhtml namespace declared on i18n sitemap",
    xmlI18n.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
  expect("hreflang en emitted",
    /xhtml:link[^>]*hreflang="en"[^>]*href="https:\/\/example\.com\/about"/.test(xmlI18n));
  expect("hreflang fr emitted",
    /xhtml:link[^>]*hreflang="fr"[^>]*href="https:\/\/example\.com\/fr\/about"/.test(xmlI18n));
  expect("x-default emitted",
    /xhtml:link[^>]*hreflang="x-default"/.test(xmlI18n));

  // sitemap without any locales doesn't declare xhtml namespace
  expect("no xhtml namespace on monolingual sitemap",
    !xml.includes("xmlns:xhtml"));

  // XML escape on weird slug
  const xmlEsc = buildSitemap(
    [{ slug: "/q?a=1&b=2", status: "published" }],
    { baseUrl: BASE },
  );
  expect("ampersand escaped in loc",
    xmlEsc.includes("/q?a=1&amp;b=2") && !xmlEsc.includes("/q?a=1&b=2"));

  // ─── D: validateSitemap ───────────────────────────────────────────────
  const v = validateSitemap(xml);
  expect("valid sitemap passes", v.ok, v.errors.join(" | "));
  expect("valid sitemap has no errors", v.errors.length === 0);

  const vBad = validateSitemap("<urlset><url><loc>x</loc><loc>y</loc></url></urlset>");
  expect("bad sitemap rejected", !vBad.ok);
  expect("missing-decl reported", vBad.errors.some(e => e.includes("declaration")));
  expect("multi-loc reported", vBad.errors.some(e => e.includes("<loc>")));

  const vUnbal = validateSitemap('<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>x</loc></urlset>');
  expect("unbalanced <url> reported",
    !vUnbal.ok && vUnbal.errors.some(e => e.includes("<url>")));

  // i18n sitemap also passes
  expect("i18n sitemap is well-formed", validateSitemap(xmlI18n).ok);

  // ─── E: buildRobotsTxt ────────────────────────────────────────────────
  const robots = buildRobotsTxt({ sitemapUrl: `${BASE}/sitemap.xml` });
  expect("robots starts with User-agent: *", robots.startsWith("User-agent: *"));
  expect("robots disallows /admin /embed /api by default",
    robots.includes("Disallow: /admin") &&
    robots.includes("Disallow: /embed") &&
    robots.includes("Disallow: /api"));
  expect("robots ends with sitemap pointer",
    robots.includes(`Sitemap: ${BASE}/sitemap.xml`));
  expect("robots has trailing newline", robots.endsWith("\n"));

  const robotsCustom = buildRobotsTxt({
    sitemapUrl: `${BASE}/sitemap.xml`,
    disallow: ["/private", "ops"],
    crawlDelay: 5,
    userAgent: "Googlebot",
    extraLines: ["Allow: /api/public"],
  });
  expect("robots custom user-agent", robotsCustom.startsWith("User-agent: Googlebot"));
  expect("robots leading-slash auto-added",
    robotsCustom.includes("Disallow: /ops"));
  expect("robots crawl-delay emitted",
    /Crawl-delay: 5/.test(robotsCustom));
  expect("robots extra lines appended",
    robotsCustom.includes("Allow: /api/public"));
  expect("robots disallow override drops defaults",
    !robotsCustom.includes("Disallow: /admin"));

  // ─── F: empty input still produces valid sitemap ──────────────────────
  const xmlEmpty = buildSitemap([], { baseUrl: BASE });
  expect("empty sitemap valid", validateSitemap(xmlEmpty).ok);
  expect("empty sitemap has no <url>", !xmlEmpty.includes("<url>"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
