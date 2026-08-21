# `src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Pure functions for manipulating the element tree.  Implementation moved to `src/engines/editor/elements/blockTreeOps.ts` in P1. Re-exported here verbatim.  `import "../blockRegistry"` is load-bearing: `createBlock()` reads `defaultProps` through the shared `src/engines/editor/elements/registry` lookup, and this plugin's registry is what fills it.

_No exported symbols (side-effect / internal module)._

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../blockRegistry.md)
- [`src/engines/editor/elements/blockTreeOps.ts`](../../../../../../engines/editor/elements/blockTreeOps.md)

## Used by (4)

- [`scripts/smoke-element-engine.test.ts`](../../../../../../../scripts/smoke-element-engine.test.md)
- [`scripts/smoke-website-visual-builder.test.ts`](../../../../../../../scripts/smoke-website-visual-builder.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/EditorBlockStage.tsx`](../editor/EditorBlockStage.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../../pages/EditorPage.md)

