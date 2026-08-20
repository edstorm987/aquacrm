# `src/built-ins/modules/affiliates/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the affiliates plugin. Same response envelope as the other Aqua plugins.

## Exports (20)

- `async listAffiliatesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createAffiliateHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateAffiliateHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteAffiliateHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listCodesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createCodeHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateCodeHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listAttributionsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async approveAttributionHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listPayoutsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async schedulePayoutHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async markPayoutPaidHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async processPayoutHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meEnrollHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meStripeOnboardHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meStripeRefreshHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meCreateCodeHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async recordOrderHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/affiliates/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/affiliates/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by (1)

- [`src/built-ins/modules/affiliates/src/api/routes.ts`](./routes.md)

