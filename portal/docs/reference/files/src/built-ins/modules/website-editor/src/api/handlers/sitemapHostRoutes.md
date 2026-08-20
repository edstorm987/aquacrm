# `src/built-ins/modules/website-editor/src/api/handlers/sitemapHostRoutes.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R044 — Host routes for advanced sitemap.xml + robots.txt.  R036 shipped the generators (`lib/sitemap.ts`); this round wires them into actual host routes the foundation mounts. R014 handlers stay in `seoMeta.ts` for the static-export pipeline (byte-stable narrow output); R036 handlers serve runtime crawler traffic with per-locale alternates + redirect-source filtering.

## Exports (3)

- `async handleAdvancedSitemapXml(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleLocaleSitemapXml(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleAdvancedRobotsTxt(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/sitemap.ts`](../../lib/sitemap.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../../server/sites.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r044-sitemap-host-routes.test.ts`](../../__smoke__/r044-sitemap-host-routes.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

