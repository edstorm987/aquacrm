# `src/built-ins/modules/website-editor/index.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `@aqua/plugin-website-editor` — entry point.  Default-exports the `AquaPlugin` manifest. The foundation reads this at boot, registers nav items / pages / API routes, merges the 70 blocks into the editor's storefront block registry, and wires plugin storage.

## Exports (1)

- `default websiteEditorPlugin`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/api/routes.ts`](./src/api/routes.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](./src/components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](./src/lib/aquaPluginTypes.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/blocks.test.ts`](./src/__smoke__/blocks.test.md)

