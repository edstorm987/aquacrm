# `src/built-ins/modules/ecommerce/src/server/index.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-side barrel + container builder.  `buildEcommerceContainer(deps)` is the integration handshake — the foundation calls it per request (or once at boot) with concrete port implementations and gets back the bundle of services that pages + API handlers consume.  Integration patch (T1 R3 cross-team): re-export `registerEcommerceFoundation` and friends from `./foundationAdapter` so foundation can register the boot-time adapter without piercing the package's `exports` map. Authored by T1 per the round-2-prompt's cross-team-patch authorisation; matched by a TASK note in `terminal-2/from-orchestrator.md`.

## Exports (3)

- `interface EcommerceDeps (6 members)`
- `interface EcommerceContainer (10 members)`
- `buildEcommerceContainer(deps: EcommerceDeps): EcommerceContainer`

## Depends on (8)

- [`src/built-ins/modules/ecommerce/src/server/billing.ts`](./billing.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](./discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/ecommerce/src/server/giftCards.ts`](./giftCards.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](./orders.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/ecommerce/src/server/productsStore.ts`](./productsStore.md)
- [`src/built-ins/modules/ecommerce/src/server/referralCodes.ts`](./referralCodes.md)

## Used by (3)

- [`src/built-ins/modules/ecommerce/src/__smoke__/discount-membership.test.ts`](../__smoke__/discount-membership.test.md)
- [`src/built-ins/modules/ecommerce/src/__smoke__/order-created-event.test.ts`](../__smoke__/order-created-event.test.md)
- [`src/built-ins/modules/ecommerce/src/server/foundationAdapter.ts`](./foundationAdapter.md)

