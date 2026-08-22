# `src/engines/editor/elements/definition.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** What an element *is*, as far as an editor and a renderer are concerned.  Lifted in P1 from `src/built-ins/modules/website-editor/src/components/blockRegistry.ts`, which still declares the 70 website element definitions but no longer owns the shape of one. The plugin re-exports every name below from its old path, so no import site changed.  Dependency rule, same as `./block`: type-only imports and React types. Nothing server-side, nothing that breaks under `--conditions react-server`.

## Exports (14)

- `type ElementCategory`
- `type ElementSurface`
- `DEFAULT_ELEMENT_SURFACES: readonly ElementSurface[]`
- `interface BlockRenderProps (4 members)`
- `type BlockComponentType`
- `type ElementRenderProps`
- `type ElementComponentType`
- `type PropFieldType`
- `interface PropField (16 members)`
- `type ElementPropField`
- `interface BlockDefinition (14 members)`
- `type ElementDefinition`
- `elementSurfaces(def: Pick<BlockDefinition, "surfaces">): readonly ElementSurface[]`
- `servesSurface(def: Pick<BlockDefinition, "surfaces">, surface: ElementSurface): boolean`

## Depends on (2)

- [`src/engines/editor/elements/block.ts`](./block.md)
- [`src/engines/editor/elements/schema.ts`](./schema.md)

## Used by (12)

- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../../../built-ins/modules/website-editor/src/components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../../built-ins/modules/website-editor/src/lib/aquaPluginTypes.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/elements/emit.ts`](./emit.md)
- [`src/engines/editor/elements/index.ts`](./index.md)
- [`src/engines/editor/elements/palette.ts`](./palette.md)
- [`src/engines/editor/elements/portalElements.ts`](./portalElements.md)
- [`src/engines/editor/elements/registry.ts`](./registry.md)
- [`src/engines/editor/elements/schema.ts`](./schema.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../../../lib/server/editing/appConfigAdapter.md)

