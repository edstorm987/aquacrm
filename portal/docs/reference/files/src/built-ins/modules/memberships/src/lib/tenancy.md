# `src/built-ins/modules/memberships/src/lib/tenancy.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Tenancy aliases mirrored from `04-the-final-portal/portal/src/server/types.ts` (T1's foundation). Vendored to keep the plugin tsc-clean standalone — the orchestrator rewrites this to a re-export once T1 unifies the canonical types.

## Exports (15)

- `type AgencyId`
- `type ClientId`
- `type UserId`
- `type PluginId`
- `type EndCustomerId`
- `type Role`
- `interface BrandKit (8 members)`
- `type EntityStatus`
- `type ClientStage`
- `interface Client (11 members)`
- `interface PluginInstallScope (2 members)`
- `interface PluginInstall (12 members)`
- `type ActivityCategory`
- `interface ActivityEntry (10 members)`
- `interface EndCustomerProfile (5 members)`

## Used by (9)

- [`src/built-ins/modules/memberships/src/__smoke__/memberships.test.ts`](../__smoke__/memberships.test.md)
- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](./aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/lib/domain.ts`](./domain.md)
- [`src/built-ins/modules/memberships/src/server/benefits.ts`](../server/benefits.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/memberships/src/server/plans.ts`](../server/plans.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](../server/ports.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](../server/subscriptions.md)

