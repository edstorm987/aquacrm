# `src/built-ins/modules/website-editor/src/__smoke__/r016-marketplace-polish.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R016 Marketplace + template gallery polish.  Asserts the new marketplace surface: - listAllTemplates carries `category` per entry - categoryForTags maps tag families correctly - filterTemplates honours query + category + tag + sort - listInstallCounts / bumpInstallCount round-trip + survive listAll - listFeaturedIds / setFeaturedIds round-trip + 8-id cap + dedupe - listSavedTemplates skips sidecar records (_install-counts/_featured) - HTTP shape (GET /templates with q/category/sort, install-tick, featured GET/POST/400)

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/api/handlers/templates.ts`](../api/handlers/templates.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`](../server/templateMarketplace.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

