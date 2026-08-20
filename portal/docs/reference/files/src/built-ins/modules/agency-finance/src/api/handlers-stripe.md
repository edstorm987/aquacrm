# `src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Stripe handlers — the online payment channel.  SAFETY: money moves client → Ed's own Stripe account directly. These handlers create the pay-link, verify the signed webhook, and issue refunds against Ed's account. The app never holds funds. Keys are Ed's, read from the install config — never logged. The reconciliation logic lives in `server/stripeReconcile.ts` (unit-tested); these are the thin HTTP edges.

## Exports (3)

- `async stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeRefundHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](../lib/stripe.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts`](../server/stripeReconcile.md)

## Used by (1)

- [`src/built-ins/modules/agency-finance/src/api/routes.ts`](./routes.md)

