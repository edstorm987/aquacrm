// R036 — Advanced sitemap.xml + robots.txt generators.
//
// Distinct from R014's `server/sitemap.ts` (which ships the minimal
// shape used by R033 static-export). R036 adds:
//   - per-page <changefreq> + <priority>
//   - per-locale <xhtml:link rel="alternate" hreflang="…"> tags
//     (R032 i18n integration)
//   - selectSitemapPages(): filters drafts + private + noIndex +
//     R025-redirected slugs
//   - validateSitemap(xml): basic well-formedness check used in smoke
//   - buildRobotsTxt(opts): structured-options API replacing the
//     R014 page-array form
//
// Pure string builders. No foundation imports. R014 module stays
// in place for the static-export smoke + early callers.

import type { EditorPage, EditorPagePrivacy } from "../types/editorPage";
import type { LocalePageMap } from "./i18n";
import { localizedUrl } from "./i18n";

// ─── Inputs ───────────────────────────────────────────────────────────

export interface SitemapPageInput {
  slug: string;
  status: EditorPage["status"];
  publishedAt?: number;
  privacy?: EditorPagePrivacy;
  noIndex?: boolean;
  isHomepage?: boolean;
  portalRole?: string;
  // Per-page sitemap overrides.
  priority?: number;        // 0.0 – 1.0
  changefreq?: ChangeFreq;
  // R032 — locale alternates. Optional per page.
  locales?: LocalePageMap;
}

export type ChangeFreq =
  | "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface BuildSitemapOpts {
  baseUrl: string;
  defaultChangefreq?: ChangeFreq;   // default "weekly"
  defaultPriority?: number;          // default 0.5
  homepagePriority?: number;         // default 1.0
}

// ─── Filtering ────────────────────────────────────────────────────────

export interface SelectOpts {
  // R025 redirect map: slug → target. Slugs in this map are skipped
  // (the canonical sits on the target slug).
  redirectFromSlugs?: Set<string> | string[];
}

export function selectSitemapPages<T extends SitemapPageInput>(
  pages: readonly T[],
  opts: SelectOpts = {},
): T[] {
  const redir = opts.redirectFromSlugs instanceof Set
    ? opts.redirectFromSlugs
    : new Set(opts.redirectFromSlugs ?? []);
  return pages.filter(p => {
    if (p.status !== "published") return false;
    if (p.noIndex) return false;
    if (p.portalRole) return false;
    if (p.privacy && p.privacy !== "public") return false;
    if (p.slug.startsWith("_") || p.slug.startsWith("/_")) return false;
    if (redir.has(p.slug)) return false;
    if (redir.has(normSlug(p.slug))) return false;
    return true;
  });
}

// ─── XML helpers ──────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normSlug(slug: string): string {
  return slug.startsWith("/") ? slug : `/${slug}`;
}

function joinUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${normSlug(slug)}`;
}

function clampPriority(n: number): string {
  const v = Math.max(0, Math.min(1, n));
  return v.toFixed(1);
}

function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// Sitemap-flavour hreflang alternates. Note this uses
// `<xhtml:link>`, not the HTML `<link>` form R032 emits.
function buildSitemapHreflang(slug: string, page: SitemapPageInput, baseUrl: string): string {
  if (!page.locales) return "";
  const tags: string[] = [];
  const origin = baseUrl.replace(/\/$/, "");
  for (const loc of Object.keys(page.locales.locales)) {
    const href = origin + localizedUrl(slug, loc, page.locales.defaultLocale);
    tags.push(
      `    <xhtml:link rel="alternate" hreflang="${escapeXml(loc)}" href="${escapeXml(href)}" />`,
    );
  }
  const defHref = origin + localizedUrl(slug, page.locales.defaultLocale, page.locales.defaultLocale);
  tags.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defHref)}" />`,
  );
  return "\n" + tags.join("\n");
}

// ─── buildSitemap ─────────────────────────────────────────────────────

export function buildSitemap(
  pages: readonly SitemapPageInput[],
  opts: BuildSitemapOpts,
): string {
  const defaultChangefreq = opts.defaultChangefreq ?? "weekly";
  const defaultPriority = opts.defaultPriority ?? 0.5;
  const homepagePriority = opts.homepagePriority ?? 1.0;

  const hasAnyLocales = pages.some(p => p.locales);
  const xmlnsXhtml = hasAnyLocales ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";

  const entries = pages.map(p => {
    const loc = joinUrl(opts.baseUrl, p.slug);
    const priority = p.priority ?? (p.isHomepage ? homepagePriority : defaultPriority);
    const changefreq = p.changefreq ?? defaultChangefreq;
    const lastmod = p.publishedAt ? `\n    <lastmod>${isoDay(p.publishedAt)}</lastmod>` : "";
    const alternates = buildSitemapHreflang(p.slug, p, opts.baseUrl);
    return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod}
    <changefreq>${changefreq}</changefreq>
    <priority>${clampPriority(priority)}</priority>${alternates}
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlnsXhtml}>
${entries.join("\n")}
</urlset>
`;
}

// ─── buildRobotsTxt ───────────────────────────────────────────────────

export interface BuildRobotsOpts {
  sitemapUrl: string;
  // Path prefixes to disallow. Defaults: /admin, /embed, /api.
  disallow?: string[];
  // Optional crawl-delay (seconds). Most modern crawlers ignore;
  // included for legacy bots.
  crawlDelay?: number;
  // Override the default User-agent target. Defaults to "*".
  userAgent?: string;
  // Extra raw lines appended verbatim (e.g. "Allow: /api/public").
  extraLines?: string[];
}

const DEFAULT_DISALLOW = ["/admin", "/embed", "/api"];

export function buildRobotsTxt(opts: BuildRobotsOpts): string {
  const disallow = opts.disallow ?? DEFAULT_DISALLOW;
  const lines: string[] = [];
  lines.push(`User-agent: ${opts.userAgent ?? "*"}`);
  for (const path of disallow) {
    lines.push(`Disallow: ${path.startsWith("/") ? path : `/${path}`}`);
  }
  if (typeof opts.crawlDelay === "number" && opts.crawlDelay > 0) {
    lines.push(`Crawl-delay: ${opts.crawlDelay}`);
  }
  if (opts.extraLines?.length) {
    for (const l of opts.extraLines) lines.push(l);
  }
  lines.push("");
  lines.push(`Sitemap: ${opts.sitemapUrl}`);
  return lines.join("\n") + "\n";
}

// ─── validateSitemap ──────────────────────────────────────────────────

export interface SitemapValidationResult {
  ok: boolean;
  errors: string[];
}

// Lightweight well-formedness check — no XML parser dep. Validates:
//   - declaration present
//   - <urlset> root with sitemap namespace
//   - balanced <url>...</url> blocks
//   - every <url> contains exactly one <loc>
//   - tag balance overall (open count == close count for every tag)
export function validateSitemap(xml: string): SitemapValidationResult {
  const errors: string[] = [];
  if (!xml.startsWith('<?xml')) {
    errors.push("missing XML declaration");
  }
  if (!/<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(xml)) {
    errors.push("missing or wrong urlset namespace");
  }
  if (!xml.includes("</urlset>")) {
    errors.push("missing </urlset> close tag");
  }

  // Balanced <url> blocks.
  const urlOpens = (xml.match(/<url>/g) ?? []).length;
  const urlCloses = (xml.match(/<\/url>/g) ?? []).length;
  if (urlOpens !== urlCloses) {
    errors.push(`unbalanced <url> tags: ${urlOpens} open / ${urlCloses} close`);
  }

  // Every <url>...</url> has exactly one <loc>.
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const locs = (block.match(/<loc>/g) ?? []).length;
    if (locs !== 1) errors.push(`<url> #${i + 1} has ${locs} <loc> tags (expected 1)`);
  }

  // Generic balance check across all named tags inside urlset.
  const tagOpen = xml.match(/<([a-zA-Z][\w:.-]*)\b[^>]*?(?<!\/)>/g) ?? [];
  const tagClose = xml.match(/<\/([a-zA-Z][\w:.-]*)>/g) ?? [];
  const counts: Record<string, number> = {};
  const re = /<\/?([a-zA-Z][\w:.-]*)/;
  for (const t of tagOpen) {
    const m = t.match(re); if (!m) continue;
    counts[m[1]!] = (counts[m[1]!] ?? 0) + 1;
  }
  for (const t of tagClose) {
    const m = t.match(re); if (!m) continue;
    counts[m[1]!] = (counts[m[1]!] ?? 0) - 1;
  }
  for (const [name, n] of Object.entries(counts)) {
    if (n !== 0) errors.push(`tag <${name}> unbalanced (${n > 0 ? "+" : ""}${n})`);
  }

  return { ok: errors.length === 0, errors };
}
