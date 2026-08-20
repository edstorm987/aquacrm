# `src/built-ins/modules/ecommerce/src/api/routes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** API route manifest. Mounted by the foundation under `/api/portal/ecommerce/<path>`.  Routes:  GET    /products                       list products (?includeHidden=true) GET    /products/get?slug=             single product POST   /products                       upsert product DELETE /products?slug=                 remove product  GET    /orders                         list orders for current client GET    /orders/get?id=                 single order POST   /orders/status                  update order status (+ tracking)  POST   /stripe/checkout                create Stripe Checkout Session POST   /stripe/webhook                 Stripe webhook (signed) POST   /stripe/billing-portal          mint a Stripe Billing Portal URL  GET    /discounts                      list custom discount codes POST   /discounts                      upsert a custom discount code DELETE /discounts?code=                remove a code POST   /discounts/apply                resolve { code, subtotal } → discount  GET    /giftcards                      list issued gift cards POST   /giftcards                      issue a new card  GET    /inventory                      list inventory snapshots POST   /inventory                      upsert one inventory item POST   /inventory/reserve              cart → SKU reservations  GET    /shipping                       zones + rates POST   /shipping                       save zones / rates  GET    /collections                    list collections POST   /collections                    save collections

## Exports (1)

- `apiRoutes: readonly PluginApiRoute[]`

## Depends on (2)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](./handlers.md)
- [`src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by (1)

- [`src/built-ins/modules/ecommerce/index.ts`](../../index.md)

