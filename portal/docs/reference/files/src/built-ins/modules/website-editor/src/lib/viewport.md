# `src/built-ins/modules/website-editor/src/lib/viewport.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R019 — Viewport switching helpers.  `Viewport` is the canonical viewport-size category — the editor's topbar switcher, BlockStyles' `hideOn*` flags, and the overflow detector all key off these three values.  Pure module — no DOM imports at module scope; safe in SSR / smoke contexts.

## Exports (8)

- `type Viewport`
- `interface ViewportSpec (4 members)`
- `VIEWPORT_SPECS: readonly ViewportSpec[]`
- `widthForViewport(v: Viewport): number`
- `isHiddenOn(styles: BlockStyles | undefined, v: Viewport): boolean`
- `pruneForViewport(blocks: Block[], v: Viewport): Block[]`
- `interface OverflowReport (3 members)`
- `detectOverflows(doc: Document | null | undefined, viewportWidth: number): OverflowReport[]`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r019-mobile-viewport.test.ts`](../__smoke__/r019-mobile-viewport.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/ViewportSwitcher.tsx`](../components/editor/ViewportSwitcher.md)

