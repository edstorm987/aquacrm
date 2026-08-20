# `src/built-ins/modules/website-editor/src/server/sitemap.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R014 — Sitemap.xml + robots.txt generation.  `buildSitemapXml(pages, baseUrl)` emits a valid `<urlset>` document listing every published, non-noIndex page. `buildRobotsTxt(pages, baseUrl)` emits a sitemap pointer + per-noIndex disallow lines.  Pure string builders — XML/text only, no foundation imports.

## Exports (3)

- `interface SitemapPage (5 members)`
- `buildSitemapXml(pages: SitemapPage[], baseUrl: string): string`
- `buildRobotsTxt(pages: SitemapPage[], baseUrl: string): string`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/lib/safeDate.ts`](../lib/safeDate.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`](../__smoke__/r014-seo-meta.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](../api/handlers/seoMeta.md)

