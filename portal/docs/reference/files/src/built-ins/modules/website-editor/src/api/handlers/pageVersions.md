# `src/built-ins/modules/website-editor/src/api/handlers/pageVersions.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R022 — Page version handlers (auto-save + named).

## Exports (5)

- `async handleSaveVersion(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleListVersions(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleGetVersion(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleDeleteVersion(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleRenameVersion(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/pageVersions.ts`](../../server/pageVersions.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r022-version-history.test.ts`](../../__smoke__/r022-version-history.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

