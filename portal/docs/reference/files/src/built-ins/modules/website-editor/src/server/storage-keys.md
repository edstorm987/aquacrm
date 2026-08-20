# `src/built-ins/modules/website-editor/src/server/storage-keys.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Centralised PluginStorage key paths for the website-editor plugin.  Every key is namespaced by `agencyId/clientId` so the foundation's per-install storage scopes work cleanly. Per architecture §6, every read/write must thread tenant identifiers; centralising here makes the boundary inspection trivial during code review.

## Exports (1)

- `storageKeys`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](../lib/portalRole.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (10)

- [`scripts/smoke-public-media-promotion.test.ts`](../../../../../../scripts/smoke-public-media-promotion.test.md)
- [`src/built-ins/modules/website-editor/src/server/blog.ts`](./blog.md)
- [`src/built-ins/modules/website-editor/src/server/content.ts`](./content.md)
- [`src/built-ins/modules/website-editor/src/server/discovery.ts`](./discovery.md)
- [`src/built-ins/modules/website-editor/src/server/embedTheme.ts`](./embedTheme.md)
- [`src/built-ins/modules/website-editor/src/server/embeds.ts`](./embeds.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](./pages.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](./sites.md)
- [`src/built-ins/modules/website-editor/src/server/themes.ts`](./themes.md)

