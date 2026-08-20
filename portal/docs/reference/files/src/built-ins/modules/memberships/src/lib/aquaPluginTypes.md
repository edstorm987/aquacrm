# `src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Vendored AquaPlugin contract — same byte-equivalent mirror of T1's canonical `portal/src/plugins/_types.ts` that fulfillment, ecommerce, and agency-hr ship. Keeping a vendored copy lets the plugin run `tsc --noEmit` standalone. Orchestrator unifies in a one-line re-export later.

## Exports (21)

- `type PluginCategory`
- `type PluginStatus`
- `type ScopePolicy`
- `interface PluginCtx (6 members)`
- `interface PluginStorage (4 members)`
- `interface PluginServices (11 members)`
- `interface SetupStep (6 members)`
- `interface SetupField (7 members)`
- `interface NavGroup (3 members)`
- `type PluginRoleVisibility`
- `interface NavItem (11 members)`
- `interface PluginPage (4 members)`
- `interface PluginPageProps (8 members)`
- `interface PluginApiRoute (6 members)`
- `interface SettingsSchema (2 members)`
- `interface SettingsGroup (4 members)`
- `interface SettingsField (7 members)`
- `interface PluginFeature (5 members)`
- `interface BlockDescriptor (5 members)`
- `interface HealthStatus (3 members)`
- `interface AquaPlugin (27 members)`

## Depends on (2)

- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](./tenancy.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](../server/ports.md)

## Used by (13)

- [`src/built-ins/modules/memberships/index.ts`](../../index.md)
- [`src/built-ins/modules/memberships/src/__smoke__/memberships.test.ts`](../__smoke__/memberships.test.md)
- [`src/built-ins/modules/memberships/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/memberships/src/api/routes.ts`](../api/routes.md)
- [`src/built-ins/modules/memberships/src/pages/BenefitsPage.tsx`](../pages/BenefitsPage.md)
- [`src/built-ins/modules/memberships/src/pages/MyMembershipPage.tsx`](../pages/MyMembershipPage.md)
- [`src/built-ins/modules/memberships/src/pages/PlansPage.tsx`](../pages/PlansPage.md)
- [`src/built-ins/modules/memberships/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)
- [`src/built-ins/modules/memberships/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/memberships/src/pages/SubscriberDetailPage.tsx`](../pages/SubscriberDetailPage.md)
- [`src/built-ins/modules/memberships/src/pages/SubscribersPage.tsx`](../pages/SubscribersPage.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](../server/index.md)

