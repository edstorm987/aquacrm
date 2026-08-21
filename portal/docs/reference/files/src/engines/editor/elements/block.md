# `src/engines/editor/elements/block.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Element — the leaf unit of a page tree. THE canonical declaration.  This module used to live at `src/built-ins/modules/website-editor/src/types/block.ts`. It moved here in P1 of the element engine because three surfaces need the same vocabulary — the public website, the client portal, and product lifecycle stages — and only one of them is a plugin. The plugin re-exports every name below from its old path verbatim, so no import site changed when this moved.  Naming: `Element`/`ElementDefinition` are the forward-looking names and `Block`/`BlockDefinition` are exported aliases of exactly the same types, so the 78 shipped block components keep compiling untouched. Both spellings are the same type — not two shapes to keep in sync.  `type` remains an open string so other plugins (ecommerce, blog, etc.) can extend the registry. The website-editor plugin contributes the canonical block types; their values are aliased in `BlockType` for in-tree references.  HAZARD: this module must stay dependency-free at runtime. It is imported by client components and by code that runs under `--conditions react-server`. Type-only imports (erased by `isolatedModules`) are fine; a value import of anything server-side is not, and `import "server-only"` never belongs here.

## Exports (18)

- `type BlockType`
- `interface BlockStyles (32 members)`
- `interface BlockA11y (7 members)`
- `interface BlockSeo (2 members)`
- `interface BlockVariant (5 members)`
- `type ElementProductMatch`
- `interface ElementBinding (6 members)`
- `interface ElementVisibility (3 members)`
- `interface ElementContext (5 members)`
- `interface Block (11 members)`
- `type Element`
- `type ElementType`
- `type ElementStyles`
- `type SplitTestStatus`
- `interface SplitTestGroup (13 members)`
- `interface SplitTestResult (5 members)`
- `type BlockTreeJSON`
- `type ElementTreeJSON`

## Depends on (1)

- [`src/server/types.ts`](../../../server/types.md)

## Used by (11)

- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../../../built-ins/modules/website-editor/src/types/block.md)
- [`src/engines/editor/elements/BlockRenderer.tsx`](./BlockRenderer.md)
- [`src/engines/editor/elements/blockSchemaMigrations.ts`](./blockSchemaMigrations.md)
- [`src/engines/editor/elements/blockStyles.ts`](./blockStyles.md)
- [`src/engines/editor/elements/blockTreeOps.ts`](./blockTreeOps.md)
- [`src/engines/editor/elements/definition.ts`](./definition.md)
- [`src/engines/editor/elements/index.ts`](./index.md)
- [`src/engines/editor/elements/portalElements.ts`](./portalElements.md)
- [`src/engines/editor/elements/variantResolver.ts`](./variantResolver.md)
- [`src/server/types.ts`](../../../server/types.md)

