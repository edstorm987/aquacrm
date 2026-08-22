# `src/engines/editor/elements/registry.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** The element lookup — one registry, filtered by surface.  P1 lifted the *vocabulary* out of the website-editor plugin. The 70 website element definitions themselves stay where they are, in `.../website-editor/src/components/blockRegistry.ts`, because that is where the 78 lazy component loaders live and where `lazyBlock` has to keep being a hand-rolled `React.lazy` (see the header of `components/lazyBlock.tsx` — `next/dynamic` throws under `--conditions react-server`).  What moved here is the *lookup*. The renderer and the tree operations are now shared code in `src/engines/editor/elements`, so they cannot import a plugin. They ask this module instead, and the plugin fills it on import:  blockRegistry.ts  ──registerElementDefinitions()──▶  this module ▲ BlockRenderer / blockTreeOps ──getElementRenderer()───────┘  Every existing import site still reaches the plugin path first (its modules are thin re-export shims that import `blockRegistry` for exactly this side-effect), so the population guarantee is identical to the direct import it replaced.  Registration is idempotent and last-write-wins per type, which reproduces the object-spread semantics of the `RENDERER_REGISTRATIONS` literal it replaced: natives register first, external-plugin renderers register after and win.

## Exports (7)

- `registerElementDefinitions(defs: Record<string, BlockDefinition>): void`
- `registerElementRenderers(renderers: Record<string, BlockComponentType>): void`
- `getElementDefinition(type: string): BlockDefinition | undefined`
- `getElementRenderer(type: string): BlockComponentType | undefined`
- `listElementDefinitions(surface?: ElementSurface): BlockDefinition[]`
- `listElementTypes(surface?: ElementSurface): string[]`
- `listElementRendererIds(): string[]`

## Depends on (2)

- [`src/engines/editor/elements/definition.ts`](./definition.md)
- [`src/engines/editor/elements/schema.ts`](./schema.md)

## Used by (13)

- [`scripts/smoke-editor-element-palette.test.ts`](../../../../scripts/smoke-editor-element-palette.test.md)
- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-portal-elements.test.ts`](../../../../scripts/smoke-portal-elements.test.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../../../built-ins/modules/website-editor/src/components/blockRegistry.md)
- [`src/components/editing/ElementInsertPanel.tsx`](../../../components/editing/ElementInsertPanel.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/elements/BlockRenderer.tsx`](./BlockRenderer.md)
- [`src/engines/editor/elements/blockTreeOps.ts`](./blockTreeOps.md)
- [`src/engines/editor/elements/index.ts`](./index.md)
- [`src/engines/editor/elements/palette.ts`](./palette.md)
- [`src/engines/editor/elements/portalElements.ts`](./portalElements.md)
- [`src/engines/editor/elements/websiteElements.ts`](./websiteElements.md)

