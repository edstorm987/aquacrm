# `src/built-ins/modules/email-sender/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the email-sender plugin.

## Exports (12)

- `async listMessagesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getMessageHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async retryMessageHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listIdentitiesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createIdentityHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateIdentityHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async verifyIdentityHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getProviderHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateProviderHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async testSendHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async postmarkWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async internalEnqueueHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by (1)

- [`src/built-ins/modules/email-sender/src/api/routes.ts`](./routes.md)

