# `src/built-ins/modules/website-editor/src/api/handlers/templates.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R006 — Template marketplace handlers.

## Exports (6)

- `async handleListTemplates(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleInstallTick(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleGetFeatured(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleSetFeatured(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleSaveTemplate(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleDeleteTemplate(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/templateMarketplace.ts`](../../server/templateMarketplace.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../../types/block.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/r016-marketplace-polish.test.ts`](../../__smoke__/r016-marketplace-polish.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/template-marketplace.test.ts`](../../__smoke__/template-marketplace.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

