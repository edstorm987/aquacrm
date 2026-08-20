# `src/lib/elements/blockStyles.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Maps a Block's typed `styles` field onto inline React style props. Kept in its own module so both the editor canvas and the host-side PortalPageRenderer use identical logic — what you see in the canvas matches what visitors see live.  Faithful port of `02/src/components/editor/blockStyles.ts`.

## Exports (3)

- `blockStylesToCss(styles?: BlockStyles): CSSProperties`
- `overridesToCssText(override?: Partial<BlockStyles>): string`
- `STYLE_FIELD_GROUPS: Array<{ label: string; fields: Array<keyof BlockStyles> }>`

## Depends on (1)

- [`src/lib/elements/block.ts`](./block.md)

## Used by (4)

- [`scripts/smoke-element-engine.test.ts`](../../../scripts/smoke-element-engine.test.md)
- [`src/built-ins/modules/website-editor/src/components/blockStyles.ts`](../../built-ins/modules/website-editor/src/components/blockStyles.md)
- [`src/lib/elements/BlockRenderer.tsx`](./BlockRenderer.md)
- [`src/lib/elements/index.ts`](./index.md)

