# `src/app/portal/agency/sop-library/composerBlocks.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** The interactive-SOP composer's palette + block factory.  This is the SIMPLE side of the SOP Engine: it lets an agency assemble an interactive SOP out of a small set of the element-engine block types that already ship — no website-editor plugin, no drag canvas, no nested containers. It deliberately reuses the element engine for everything that matters:  • `createBlock(type)` seeds a block with the element's own `defaultProps`, so a freshly-added block is already a valid element (its required props, if any, are satisfied by the definition's defaults). • The editable fields below are a hand-picked SUBSET of each element's real `fields`, keyed by the same prop keys, so what the composer writes is what the definition understands. Everything not listed keeps its default.  Because both the composed tree and the library's `BlockRenderer` resolve the same registered definitions, what you compose here renders identically in the library viewer and validates against `validateSopBlockTree` (the element engine's own schema check) on save.  Runtime-dependency-free by design: this module is imported by the client composer AND by the smoke suite, so it must not reach for `server-only`, the DOM, or a plugin. The one requirement is that a caller has loaded the element registry (the website block registry side-effect import) before calling `createComposerBlock` — the client component and the test both do.

## Exports (7)

- `type ComposerFieldControl`
- `interface ComposerField (5 members)`
- `interface ComposerBlockType (4 members)`
- `COMPOSER_BLOCK_TYPES: readonly ComposerBlockType[]`
- `composerBlockType(type: string): ComposerBlockType | undefined`
- `createComposerBlock(type: BlockType): Block`
- `isComposerEditable(block: Block): boolean`

## Depends on (1)

- [`src/engines/editor/elements/index.ts`](../../../../engines/editor/elements/index.md)

## Used by (2)

- [`scripts/smoke-sop-composer.test.ts`](../../../../../scripts/smoke-sop-composer.test.md)
- [`src/app/portal/agency/sop-library/_SopLibrary.tsx`](./_SopLibrary.md)

