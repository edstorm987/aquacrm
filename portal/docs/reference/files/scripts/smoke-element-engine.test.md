# `scripts/smoke-element-engine.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The element engine — P1 (lift the vocabulary) and P2 (additive ABI + one prop schema).  What this file is defending, in one sentence each:  P1  `Block`, `BlockStyles`, `BlockDefinition`, `PropField`, `BlockRenderer`, `blockStyles`, `blockTreeOps` and `blockSchemaMigrations` live in `src/lib/elements` now, and the website-editor plugin re-exports its old paths. The re-export must be the SAME module, not a copy — a copy is the failure this whole phase exists to stop, and it is invisible until two surfaces disagree about a block.  P2  Three optional additions — `BlockRenderProps.context`, `Block.binding` / `Block.visibility`, `BlockDefinition.surfaces` / `.schema` — and one prop-schema vocabulary instead of two.  Everything here is driven, not grepped. The renderer is exercised by calling it and walking the element tree it returns, which works under `--conditions react-server` where a DOM render would not. Loading these modules at all is itself part of the contract: `src/lib/elements` may never reach `server-only`, and `lazyBlock` stays a hand-rolled `React.lazy` because `next/dynamic` throws under that condition — if either regressed, this file would fail to import.

_No exported symbols (side-effect / internal module)._

## Depends on (15)

- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../src/built-ins/modules/website-editor/src/components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/components/blockStyles.ts`](../src/built-ins/modules/website-editor/src/components/blockStyles.md)
- [`src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps.ts`](../src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps.md)
- [`src/built-ins/modules/website-editor/src/lib/blockSchemaMigrations.ts`](../src/built-ins/modules/website-editor/src/lib/blockSchemaMigrations.md)
- [`src/lib/editing/engine.ts`](../src/lib/editing/engine.md)
- [`src/lib/elements/BlockRenderer.tsx`](../src/lib/elements/BlockRenderer.md)
- [`src/lib/elements/block.ts`](../src/lib/elements/block.md)
- [`src/lib/elements/blockSchemaMigrations.ts`](../src/lib/elements/blockSchemaMigrations.md)
- [`src/lib/elements/blockStyles.ts`](../src/lib/elements/blockStyles.md)
- [`src/lib/elements/blockTreeOps.ts`](../src/lib/elements/blockTreeOps.md)
- [`src/lib/elements/definition.ts`](../src/lib/elements/definition.md)
- [`src/lib/elements/index.ts`](../src/lib/elements/index.md)
- [`src/lib/elements/registry.ts`](../src/lib/elements/registry.md)
- [`src/lib/elements/schema.ts`](../src/lib/elements/schema.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../src/lib/server/editing/appConfigAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

