# `src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R033 — Static export handler. GET /export?siteId=…&baseUrl=… returns a ZIP buffer (application/zip) containing every published page in the site rendered to static HTML, plus brand.css, sitemap.xml, robots.txt, and a README that spells out which dynamic surfaces won't survive the snapshot.

## Exports (1)

- `async handleExportSite(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../../server/staticExport.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts`](../../__smoke__/r033-static-export.test.md)

