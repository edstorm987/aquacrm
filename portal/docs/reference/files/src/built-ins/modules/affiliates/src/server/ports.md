# `src/built-ins/modules/affiliates/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the affiliates plugin.  Six ports — same discipline as memberships. The new one is `EcommerceOrdersPort`, a cross-plugin read into ecommerce: lets AttributionService look up an order by id when the ecommerce `order.created` event fires (since order metadata isn't carried in the event payload — keeps the event surface minimal).

## Exports (14)

- `interface StoragePort (4 members)`
- `interface TenantPort (2 members)`
- `interface UserPort (1 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type AffiliateEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`
- `interface EcommerceOrderProjection (10 members)`
- `interface EcommerceOrdersPort (1 members)`
- `type StripeOnboardingStatusValue`
- `interface StripeConnectAccountSnapshot (6 members)`
- `interface StripeConnectPort (5 members)`

## Depends on (1)

- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (9)

- [`src/built-ins/modules/affiliates/src/__smoke__/affiliates.test.ts`](../__smoke__/affiliates.test.md)
- [`src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/affiliates/src/server/affiliates.ts`](./affiliates.md)
- [`src/built-ins/modules/affiliates/src/server/attributions.ts`](./attributions.md)
- [`src/built-ins/modules/affiliates/src/server/codes.ts`](./codes.md)
- [`src/built-ins/modules/affiliates/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/affiliates/src/server/onboarding.ts`](./onboarding.md)
- [`src/built-ins/modules/affiliates/src/server/payouts.ts`](./payouts.md)

