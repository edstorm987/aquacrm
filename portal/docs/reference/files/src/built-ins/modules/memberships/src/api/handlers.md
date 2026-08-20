# `src/built-ins/modules/memberships/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** API handlers for the memberships plugin. Each handler builds a per-request container via `containerFor({...})` and delegates to a service method. Response envelope: 200/201 with `{ ok: true, ... }` on success 400 validation 404 not-in-scope 422 business rule 500 unexpected throw

## Exports (15)

- `async listPlansHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createPlanHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updatePlanHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deletePlanHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listBenefitsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createBenefitHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateBenefitHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listSubscribersHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getSubscriberHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async adminCancelSubscriberHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meSubscribeHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meCancelHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async mePortalHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by (1)

- [`src/built-ins/modules/memberships/src/api/routes.ts`](./routes.md)

