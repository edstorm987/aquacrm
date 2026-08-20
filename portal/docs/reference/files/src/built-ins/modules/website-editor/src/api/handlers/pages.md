# `src/built-ins/modules/website-editor/src/api/handlers/pages.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Page CRUD + portal-variant handlers. Adapted from `02/src/app/api/portal/pages/[siteId]/...` Next.js route files into declarative `PluginApiRoute.handler` functions.

## Exports (11)

- `async handleListPages(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleCreatePage(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleGetPage(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleGetPageBySlug(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleUpdatePage(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handlePublishPage(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleRevertPage(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleDeletePage(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleListPortalVariants(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleListAllPortalVariants(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleSetActivePortalVariant(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](../../lib/portalRole.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../../server/portalVariants.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`](../../__smoke__/r012-portal-variant-editor.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

