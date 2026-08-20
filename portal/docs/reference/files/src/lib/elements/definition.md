# `src/lib/elements/definition.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

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

- [`src/lib/elements/block.ts`](./block.md)
- [`src/lib/elements/schema.ts`](./schema.md)

## Used by (8)

- [`scripts/smoke-element-engine.test.ts`](../../../scripts/smoke-element-engine.test.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../../built-ins/modules/website-editor/src/components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../built-ins/modules/website-editor/src/lib/aquaPluginTypes.md)
- [`src/lib/elements/index.ts`](./index.md)
- [`src/lib/elements/portalElements.ts`](./portalElements.md)
- [`src/lib/elements/registry.ts`](./registry.md)
- [`src/lib/elements/schema.ts`](./schema.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../server/editing/appConfigAdapter.md)

