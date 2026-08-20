# `src/built-ins/modules/website-editor/src/lib/useContent.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** useContent — three-tier resolution hook used by content components. Adapted from `02/src/lib/useContent.ts`. The hook itself is a thin wrapper around `portalCache.ts`; the actual subscription wiring is kept simple for round 1.

## Exports (1)

- `useContent<T extends ContentValue>(siteId: string, key: string, fallback: T): T | ContentValue`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/lib/portalCache.ts`](./portalCache.md)
- [`src/built-ins/modules/website-editor/src/types/content.ts`](../types/content.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/lib/useContentImage.ts`](./useContentImage.md)

