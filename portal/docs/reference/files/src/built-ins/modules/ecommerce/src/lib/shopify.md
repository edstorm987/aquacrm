# `src/built-ins/modules/ecommerce/src/lib/shopify.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Shopify Storefront API wrapper.  Lifted from `02 felicias aqua portal work/src/lib/shopify.ts` and generalised: domain + access token come from per-install config rather than env vars (since each client may connect to a different Shopify store).

## Exports (4)

- `interface ShopifyConfig (2 members)`
- `async shopifyFetch<T>(config: ShopifyConfig, args: { query: string; variables?: Record<string, unknown> }): Promise<{ status: number; body: T }>`
- `async createShopifyCart(config: ShopifyConfig): Promise<{ id: string; checkoutUrl: string }>`
- `async addLineToShopifyCart(config: ShopifyConfig, cartId: string, variantId: string, quantity: number): Promise<{ id: string; checkoutUrl: string }>`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

