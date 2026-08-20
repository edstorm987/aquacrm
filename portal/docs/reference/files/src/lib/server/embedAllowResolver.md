# `src/lib/server/embedAllowResolver.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** T1 R16 — middleware-side embed allow-list resolver.  Reads foundation client state + the website-editor PluginStorage's `embed-allow` record for the resolved client and returns the list of origins permitted to iframe `/embed/<slug>/<variant>`. Empty list (or unknown slug) → frame-ancestors: 'none' (default deny).

## Exports (3)

- `interface EmbedAllowResult (4 members)`
- `async resolveEmbedAllowList(slug: string): Promise<EmbedAllowResult>`
- `frameAncestorsValue(origins: readonly string[]): string`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/server/embedAllow.ts`](../../built-ins/modules/website-editor/src/server/embedAllow.md)
- [`src/built-ins/runtime/_runtime.ts`](../../built-ins/runtime/_runtime.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tenants.ts`](../../server/tenants.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

