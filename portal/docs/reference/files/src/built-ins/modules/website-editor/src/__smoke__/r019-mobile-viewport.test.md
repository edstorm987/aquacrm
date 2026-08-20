# `src/built-ins/modules/website-editor/src/__smoke__/r019-mobile-viewport.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R019 Multi-device viewport + mobile preview.  Asserts: - VIEWPORT_SPECS has Desktop/Tablet/Mobile with correct widths - widthForViewport returns the right number per viewport - isHiddenOn flag matrix - pruneForViewport filters recursively + deep-clones (input untouched) - detectOverflows returns [] when no DOM, flags blocks wider than viewport - ViewportSwitcher renders 3 chips, marks active, surfaces flag dot

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/components/editor/ViewportSwitcher.tsx`](../components/editor/ViewportSwitcher.md)
- [`src/built-ins/modules/website-editor/src/lib/viewport.ts`](../lib/viewport.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

