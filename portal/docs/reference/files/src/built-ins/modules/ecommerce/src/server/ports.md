# `src/built-ins/modules/ecommerce/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the ecommerce plugin.  The plugin reaches into T1's foundation only via these interfaces. T1 binds concrete implementations and constructs an `EcommerceServices` container that pages + handlers consume via the adapter in `src/server/foundationAdapter.ts`.  Mirrors the fulfillment plugin's port discipline.

## Exports (10)

- `interface StoragePort (4 members)`
- `interface TenantPort (2 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityPort (2 members)`
- `type EcommerceEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`
- `interface MembershipDiscountSnapshot (4 members)`
- `interface MembershipBenefitsPort (1 members)`

## Depends on (1)

- [`src/built-ins/modules/ecommerce/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (10)

- [`src/built-ins/modules/ecommerce/src/__smoke__/discount-membership.test.ts`](../__smoke__/discount-membership.test.md)
- [`src/built-ins/modules/ecommerce/src/__smoke__/order-created-event.test.ts`](../__smoke__/order-created-event.test.md)
- [`src/built-ins/modules/ecommerce/src/server/billing.ts`](./billing.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](./discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/ecommerce/src/server/giftCards.ts`](./giftCards.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](./orders.md)
- [`src/built-ins/modules/ecommerce/src/server/productsStore.ts`](./productsStore.md)
- [`src/built-ins/modules/ecommerce/src/server/referralCodes.ts`](./referralCodes.md)

