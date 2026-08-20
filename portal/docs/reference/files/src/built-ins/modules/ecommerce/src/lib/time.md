# `src/built-ins/modules/ecommerce/src/lib/time.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Clock indirection for testable timestamps. Production calls Date.now() directly; tests can swap via setClock().

## Exports (4)

- `type Clock`
- `now(): number`
- `setClock(c: Clock): void`
- `resetClock(): void`

## Used by (6)

- [`src/built-ins/modules/ecommerce/src/server/billing.ts`](../server/billing.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](../server/discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/giftCards.ts`](../server/giftCards.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](../server/orders.md)
- [`src/built-ins/modules/ecommerce/src/server/productsStore.ts`](../server/productsStore.md)
- [`src/built-ins/modules/ecommerce/src/server/referralCodes.ts`](../server/referralCodes.md)

