# `src/built-ins/modules/website-editor/src/lib/sitemap.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R036 — Advanced sitemap.xml + robots.txt generators.  Distinct from R014's `server/sitemap.ts` (which ships the minimal shape used by R033 static-export). R036 adds: - per-page <changefreq> + <priority> - per-locale <xhtml:link rel="alternate" hreflang="…"> tags (R032 i18n integration) - selectSitemapPages(): filters drafts + private + noIndex + R025-redirected slugs - validateSitemap(xml): basic well-formedness check used in smoke - buildRobotsTxt(opts): structured-options API replacing the R014 page-array form  Pure string builders. No foundation imports. R014 module stays in place for the static-export smoke + early callers.

## Exports (10)

- `interface SitemapPageInput (10 members)`
- `type ChangeFreq`
- `interface BuildSitemapOpts (4 members)`
- `interface SelectOpts (1 members)`
- `selectSitemapPages<T extends SitemapPageInput>(pages: readonly T[], opts: SelectOpts = {}): T[]`
- `buildSitemap(pages: readonly SitemapPageInput[], opts: BuildSitemapOpts): string`
- `interface BuildRobotsOpts (5 members)`
- `buildRobotsTxt(opts: BuildRobotsOpts): string`
- `interface SitemapValidationResult (2 members)`
- `validateSitemap(xml: string): SitemapValidationResult`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/i18n.ts`](./i18n.md)
- [`src/built-ins/modules/website-editor/src/lib/safeDate.ts`](./safeDate.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/r036-sitemap-robots.test.ts`](../__smoke__/r036-sitemap-robots.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sitemapHostRoutes.ts`](../api/handlers/sitemapHostRoutes.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../server/staticExport.md)

