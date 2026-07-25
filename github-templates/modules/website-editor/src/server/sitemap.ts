// R014 — Sitemap.xml + robots.txt generation.
//
// `buildSitemapXml(pages, baseUrl)` emits a valid `<urlset>` document
// listing every published, non-noIndex page. `buildRobotsTxt(pages,
// baseUrl)` emits a sitemap pointer + per-noIndex disallow lines.
//
// Pure string builders — XML/text only, no foundation imports.

import type { EditorPage } from "../types/editorPage";

export interface SitemapPage {
  slug: string;
  status: EditorPage["status"];
  updatedAt?: number;
  isPortalVariant?: boolean;
  noIndex?: boolean;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlForPage(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const path = slug.startsWith("/") ? slug : `/${slug}`;
  return `${base}${path}`;
}

export function buildSitemapXml(pages: SitemapPage[], baseUrl: string): string {
  const visible = pages.filter(p =>
    p.status === "published" &&
    !p.noIndex &&
    !p.isPortalVariant &&            // portal variants live under /embed/...
    !p.slug.startsWith("_"),         // private internal slugs (e.g. _portal-…)
  );
  const entries = visible.map(p => {
    const lastmod = p.updatedAt
      ? `\n    <lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>`
      : "";
    return `  <url>
    <loc>${escapeXml(urlForPage(baseUrl, p.slug))}</loc>${lastmod}
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
}

export function buildRobotsTxt(pages: SitemapPage[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const lines: string[] = [
    "User-agent: *",
    "Allow: /",
  ];
  // noIndex pages get an explicit Disallow so crawlers honour the page
  // even before they fetch it.
  for (const p of pages) {
    if (p.status === "published" && p.noIndex) {
      const path = p.slug.startsWith("/") ? p.slug : `/${p.slug}`;
      lines.push(`Disallow: ${path}`);
    }
  }
  // Always disallow internal/portal-variant slugs.
  lines.push("Disallow: /_*");
  lines.push("Disallow: /embed/");
  lines.push("");
  lines.push(`Sitemap: ${base}/sitemap.xml`);
  return lines.join("\n") + "\n";
}
