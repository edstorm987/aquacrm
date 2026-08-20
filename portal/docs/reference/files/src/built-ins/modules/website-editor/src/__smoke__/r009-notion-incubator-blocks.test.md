# `src/built-ins/modules/website-editor/src/__smoke__/r009-notion-incubator-blocks.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R009 4 Notion-Incubator blocks (icon · property-strip · toggle · card-grid). Validates registry shape + render contract (no DOM — exercises the React renderer via react-dom/server) + theme-overlay CSS-var hooks. `react-dom/server` types aren't bundled with @types/react-dom in this plugin's devDeps — the function is stable enough that a typed dynamic import keeps the smoke decoupled from a deps update.

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/CardGridBlock.tsx`](../components/blocks/CardGridBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/IconBlock.tsx`](../components/blocks/IconBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/PropertyStripBlock.tsx`](../components/blocks/PropertyStripBlock.md)
- [`src/built-ins/modules/website-editor/src/components/blocks/ToggleBlock.tsx`](../components/blocks/ToggleBlock.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

