# `src/built-ins/modules/website-editor/src/api/handlers/blog.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R008 — Blog admin + storefront handlers.

## Exports (6)

- `async handleListBlogPosts(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleGetBlogPost(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleGetBlogPostBySlug(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleCreateBlogPost(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleUpdateBlogPost(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleDeleteBlogPost(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/blog.ts`](../../server/blog.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r008-blog.test.ts`](../../__smoke__/r008-blog.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

