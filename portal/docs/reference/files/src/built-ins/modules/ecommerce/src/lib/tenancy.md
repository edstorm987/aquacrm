# `src/built-ins/modules/ecommerce/src/lib/tenancy.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Tenancy aliases — vendored mirror of T1's `04-the-final-portal/portal/src/server/types.ts`.  Same approach as the fulfillment plugin (Round 1): keep the plugin tsc-clean standalone by mirroring the types we need. The chief commander's planned post-merge refactor swaps these for a single `import * from "@/server/types"` once the foundation tsconfig path aliases are exposed to plugin builds.

## Exports (15)

- `type AgencyId`
- `type ClientId`
- `type EndCustomerId`
- `type UserId`
- `type PluginId`
- `type Role`
- `type ClientStage`
- `interface BrandKit (8 members)`
- `type EntityStatus`
- `interface Agency (8 members)`
- `interface Client (11 members)`
- `interface PluginInstallScope (2 members)`
- `interface PluginInstall (12 members)`
- `type ActivityCategory`
- `interface ActivityEntry (10 members)`

## Used by (7)

- [`src/built-ins/modules/ecommerce/src/__smoke__/discount-membership.test.ts`](../__smoke__/discount-membership.test.md)
- [`src/built-ins/modules/ecommerce/src/__smoke__/order-created-event.test.ts`](../__smoke__/order-created-event.test.md)
- [`src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts`](./aquaPluginTypes.md)
- [`src/built-ins/modules/ecommerce/src/server/billing.ts`](../server/billing.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](../server/discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](../server/orders.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](../server/ports.md)

