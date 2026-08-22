# `src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Stripe handlers — the online payment channel.  SAFETY: money moves client → Ed's own Stripe account directly. These handlers create the pay-link, verify the signed webhook, and issue refunds against Ed's account. The app never holds funds. The reconciliation logic lives in `server/stripeReconcile.ts` (unit-tested); these are the thin HTTP edges.  Keys are Ed's, and they are NOT on `install.config` — that record reaches the browser through page props. They live in the encrypted integrations vault and are merged back in here by `installConfigWithSecrets`, so the pure readers below (`stripeConfigured` / `readStripeKeysFromInstall`) keep their shape. Never logged.

## Exports (3)

- `async stripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async stripeRefundHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (5)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](../lib/stripe.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts`](../server/stripeReconcile.md)
- [`src/lib/server/plugins/pluginSecretConfig.ts`](../../../../../lib/server/plugins/pluginSecretConfig.md)

## Used by (1)

- [`src/built-ins/modules/agency-finance/src/api/routes.ts`](./routes.md)

