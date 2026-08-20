# `src/built-ins/modules/ecommerce/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** API handlers — pure request/response functions invoked by the manifest's `api` routes. Each handler receives `PluginCtx` and uses `containerFor(ctx.storage)` to assemble a per-request services bundle.  Convention: every handler returns a Web `Response` and never throws. Errors become JSON responses with shape `{ ok: false, error }`.

## Exports (27)

- `async listProductsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getProductHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async upsertProductHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteProductHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listOrdersHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getOrderHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `interface UpdateOrderStatusBody (4 members)`
- `async updateOrderStatusHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateOrderHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async downloadOrderHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `interface CheckoutBody (4 members)`
- `async stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeBillingPortalHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listDiscountsHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async upsertDiscountHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteDiscountHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async applyDiscountHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listGiftCardsHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async issueGiftCardHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listInventoryHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async setInventoryHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async reserveInventoryHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listShippingHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async saveShippingHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listCollectionsHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async saveCollectionsHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (10)

- [`src/built-ins/modules/ecommerce/src/lib/admin/collections.ts`](../lib/admin/collections.md)
- [`src/built-ins/modules/ecommerce/src/lib/admin/shipping.ts`](../lib/admin/shipping.md)
- [`src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/ecommerce/src/lib/products.ts`](../lib/products.md)
- [`src/built-ins/modules/ecommerce/src/lib/safeDate.ts`](../lib/safeDate.md)
- [`src/built-ins/modules/ecommerce/src/lib/stripe/server.ts`](../lib/stripe/server.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](../server/discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/ecommerce/src/server/giftCards.ts`](../server/giftCards.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](../server/orders.md)

## Used by (1)

- [`src/built-ins/modules/ecommerce/src/api/routes.ts`](./routes.md)

