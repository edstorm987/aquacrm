# `src/built-ins/modules/website-editor/src/components/pageTemplates.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Starter page templates surfaced on /admin/sites/[siteId]/pages when the admin clicks "New page". Each template seeds a block tree the operator can then edit. Mirrors the structure Wix / Squarespace use ("Start from a template, then customise").  Faithful port of `02/src/components/editor/pageTemplates.ts`. Block ids use `blockId(type)` from the plugin's id helper rather than 02's inline `Math.random()`.

## Exports (7)

- `interface PageTemplate (7 members)`
- `PAGE_TEMPLATES: PageTemplate[]`
- `AQUA_INCUBATOR_TEMPLATE_IDS: readonly string[]`
- `BRAND_PAGE_TEMPLATE_IDS: readonly string[]`
- `BRAND_PAGE_PACK_ID`
- `getTemplate(id: string): PageTemplate | undefined`
- `selectStarterForPhase(phase: string | null | undefined): string | null`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](./blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (8)

- [`src/built-ins/modules/website-editor/src/__smoke__/brand-page-templates.test.ts`](../__smoke__/brand-page-templates.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/incubator-template.test.ts`](../__smoke__/incubator-template.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r010-incubator-template-preset.test.ts`](../__smoke__/r010-incubator-template-preset.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/template-marketplace.test.ts`](../__smoke__/template-marketplace.test.md)
- [`src/built-ins/modules/website-editor/src/components/index.ts`](./index.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)
- [`src/built-ins/modules/website-editor/src/server/starterLoader.ts`](../server/starterLoader.md)
- [`src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`](../server/templateMarketplace.md)

