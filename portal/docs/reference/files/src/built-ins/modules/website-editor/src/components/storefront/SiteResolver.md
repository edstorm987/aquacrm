# `src/built-ins/modules/website-editor/src/components/storefront/SiteResolver.tsx`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server component that resolves the current `Site` from a clientId. Round-1: a thin wrapper — the foundation passes the client ID in via props. Round-2 plugin adds host-based custom-domain resolution.  Faithful port from `02/src/components/SiteResolver.tsx` minus the host-matching branch (custom-domain support is deferred).

## Exports (2)

- `interface SiteResolverProps (3 members)`
- `SiteResolver({ site, fallback, children }: SiteResolverProps)`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/site.ts`](../../types/site.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/components/index.ts`](../index.md)

