# `src/built-ins/modules/website-editor/src/lib/ids.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Lightweight id generator. Mirrors T2's pattern; avoids a runtime dep on `nanoid` so the plugin keeps its `dependencies` empty.

## Exports (8)

- `makeId(prefix: string, length = 12): string`
- `slugify(s: string): string`
- `blockId(type: string)`
- `pageId()`
- `siteId()`
- `themeId()`
- `variantId()`
- `assetId()`

## Used by (10)

- [`src/built-ins/modules/website-editor/src/api/handlers/assets.ts`](../api/handlers/assets.md)
- [`src/built-ins/modules/website-editor/src/components/pageTemplates.ts`](../components/pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/lib/blockSchemaMigrations.ts`](./blockSchemaMigrations.md)
- [`src/built-ins/modules/website-editor/src/lib/pageTemplates.ts`](./pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/server/blog.ts`](../server/blog.md)
- [`src/built-ins/modules/website-editor/src/server/content.ts`](../server/content.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../server/sites.md)
- [`src/built-ins/modules/website-editor/src/server/themes.ts`](../server/themes.md)

