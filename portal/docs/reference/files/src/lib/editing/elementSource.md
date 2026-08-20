# `src/lib/editing/elementSource.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Which file rendered the thing you just clicked. React keeps this already. In development the JSX transform attaches `_debugSource` — file, line, column — to every element's fiber, and the DOM node carries a `__reactFiber$…` key pointing at it. That is how React DevTools' "view source" works, and it means element-to-source needs no build configuration at all in dev. It is deliberately dev-only. Production builds strip `_debugSource`, and the honest answer there is to say so rather than to guess: shipping a build stamp to every client site is a decision with a cost, and it should be made explicitly rather than snuck in to make one feature work.

## Exports (5)

- `interface ElementSource (3 members)`
- `sourceFromDebugStack(stack: string | undefined): ElementSource | null`
- `elementSource(element: Element | null, maxDepth = 25): ElementSource | null`
- `repoRelativePath(fileName: string, roots = ["src/", "app/", "components/", "lib/"]): string | null`
- `describeSource(source: ElementSource | null): string`

## Used by (2)

- [`scripts/smoke-element-source.test.ts`](../../../scripts/smoke-element-source.test.md)
- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../../app/portal/agency/portals/editor/_ClientPortalStudio.md)

