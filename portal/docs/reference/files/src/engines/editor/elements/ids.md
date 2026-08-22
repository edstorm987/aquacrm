# `src/engines/editor/elements/ids.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Lightweight id generator, lifted with the rest of the element vocabulary in P1. It was `.../website-editor/src/lib/ids.ts`, which still owns the domain-specific helpers (`pageId`, `siteId`, `themeId`, …) and now re-exports these two rather than declaring a second copy.  Avoids a runtime dep on `nanoid` so the plugin keeps its `dependencies` empty.

## Exports (2)

- `makeId(prefix: string, length = 12): string`
- `slugify(s: string): string`

## Used by (5)

- [`scripts/smoke-dev-editor-tag-bridge.test.ts`](../../../../scripts/smoke-dev-editor-tag-bridge.test.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../../../built-ins/modules/website-editor/src/lib/ids.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/elements/blockSchemaMigrations.ts`](./blockSchemaMigrations.md)
- [`src/engines/editor/elements/index.ts`](./index.md)

