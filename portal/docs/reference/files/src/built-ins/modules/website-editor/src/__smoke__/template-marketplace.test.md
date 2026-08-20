# `src/built-ins/modules/website-editor/src/__smoke__/template-marketplace.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R006 Portal Template Marketplace.  Pure structural tests against templateMarketplace.ts: - listBuiltinTemplates surfaces all PAGE_TEMPLATES + brand-page-pack - tag inference covers expected groupings - saveTemplate round-trips through in-memory storage - listAllTemplates surfaces saved + builtin together - deleteSavedTemplate removes only the targeted record And against handlers/templates.ts (HTTP shape): - GET /templates 200 with templates array - POST /templates 201 with template, missing label → 400 - DELETE /templates 200 / 404 unknown id

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/api/handlers/templates.ts`](../api/handlers/templates.md)
- [`src/built-ins/modules/website-editor/src/components/pageTemplates.ts`](../components/pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`](../server/templateMarketplace.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

