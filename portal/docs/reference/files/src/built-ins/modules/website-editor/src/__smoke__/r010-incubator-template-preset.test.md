# `src/built-ins/modules/website-editor/src/__smoke__/r010-incubator-template-preset.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R010 Incubator template preset.  Asserts (1) the §15e root template + 4 sub-page templates from R002 are still wired through `AQUA_INCUBATOR_TEMPLATE_IDS` + resolve via `loadStarterTree`, (2) the root carries the correct §15e block recipe, (3) the new `applyIncubatorClientMetadata` helper resolves placeholders from client metadata, and (4) the templateMarketplace surfaces all 5 ids under the "Aqua Incubator" tag so the gallery route works.

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/components/pageTemplates.ts`](../components/pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/server/incubatorTemplate.ts`](../server/incubatorTemplate.md)
- [`src/built-ins/modules/website-editor/src/server/starterLoader.ts`](../server/starterLoader.md)
- [`src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`](../server/templateMarketplace.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

