# `src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R014 — Sitemap.xml + robots.txt + OG-card handlers.  All three return non-JSON content (XML / text / SVG) so they bypass the standard `ok()` / `fail()` JSON helpers.

## Exports (3)

- `async handleSitemapXml(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleRobotsTxt(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleOgCard(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/ogImageGenerator.ts`](../../server/ogImageGenerator.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/sitemap.ts`](../../server/sitemap.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../../server/sites.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`](../../__smoke__/r014-seo-meta.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

