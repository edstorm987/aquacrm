# `src/built-ins/modules/website-editor/src/lib/portalCache.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Three-tier resolution cache. Adapted from `02/src/lib/admin/portalCache.ts`.  Lookup precedence: 1. portal published overrides (per siteId) 2. legacy CMS keys (foundation-side) 3. compile-time fallbacks (passed by caller)  Round-1 implements the in-memory cache + localStorage persistence and exposes a tiny pub/sub for re-rendering when overrides change.

## Exports (4)

- `loadPortalCache(siteId: string): Record<string, ContentValue>`
- `setPortalCache(siteId: string, values: Record<string, ContentValue>): void`
- `getPortalValue<T extends ContentValue>(siteId: string, key: string, fallback: T): T | ContentValue`
- `onPortalCacheChange(siteId: string, fn: () => void): () => void`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/content.ts`](../types/content.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/lib/useContent.ts`](./useContent.md)

