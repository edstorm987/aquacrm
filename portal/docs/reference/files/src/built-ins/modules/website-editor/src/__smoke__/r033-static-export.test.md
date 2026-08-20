# `src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R033 Static site export.  Asserts: - exportSiteToZip emits a valid store-only ZIP (PK\x03\x04 magic, EOCD) - homepage exports as `index.html` with title + content - non-home pages export as `<slug>/index.html` with brand.css link - draft + portal-variant + underscore-prefixed pages are excluded - sitemap.xml + robots.txt + README.txt + brand.css present - HTML escapes user content (no XSS via heading text or button label) - handler returns 200 + content-type application/zip + headers - handler 400s without siteId

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts`](../api/handlers/staticExport.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../server/staticExport.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

