# `src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Local copy of the Aqua plugin contract.  **TODO** — this file is a vendored copy of the canonical contract that T1's foundation will publish at `portal/src/plugins/_types.ts`. It exists here so the plugin tsc-clean-checks standalone in autonomous-mesh round 1. Once T1 ships, replace this file with:  export * from '../../../../portal/src/plugins/_types';  The contract is adapted from `02 felicias aqua portal work/src/plugins/_types.ts`, retaining the manifest shape but rewriting `OrgPluginInstall` (org-scoped) to `PluginInstall` (agency + optional client scoped) per `04-architecture.md`.

## Exports (19)

- `type PluginCategory`
- `type PluginStatus`
- `interface PluginCtx (6 members)`
- `interface PluginStorage (4 members)`
- `interface PluginServices (8 members)`
- `interface SetupStep (6 members)`
- `interface SetupField (7 members)`
- `interface NavGroup (3 members)`
- `type PluginRoleVisibility`
- `interface NavItem (11 members)`
- `interface PluginPage (4 members)`
- `interface PluginPageProps (8 members)`
- `interface PluginApiRoute (4 members)`
- `interface SettingsSchema (2 members)`
- `interface SettingsGroup (4 members)`
- `interface SettingsField (7 members)`
- `interface PluginFeature (5 members)`
- `interface HealthStatus (3 members)`
- `interface AquaPlugin (25 members)`

## Depends on (2)

- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](./tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](../server/ports.md)

## Used by (11)

- [`src/built-ins/modules/fulfillment/index.ts`](../../index.md)
- [`src/built-ins/modules/fulfillment/src/__smoke__/lifecycle.test.ts`](../__smoke__/lifecycle.test.md)
- [`src/built-ins/modules/fulfillment/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/fulfillment/src/api/routes.ts`](../api/routes.md)
- [`src/built-ins/modules/fulfillment/src/pages/ChecklistPage.tsx`](../pages/ChecklistPage.md)
- [`src/built-ins/modules/fulfillment/src/pages/ClientsPage.tsx`](../pages/ClientsPage.md)
- [`src/built-ins/modules/fulfillment/src/pages/MarketplacePage.tsx`](../pages/MarketplacePage.md)
- [`src/built-ins/modules/fulfillment/src/pages/PhaseBoardPage.tsx`](../pages/PhaseBoardPage.md)
- [`src/built-ins/modules/fulfillment/src/pages/PhasesPage.tsx`](../pages/PhasesPage.md)
- [`src/built-ins/modules/fulfillment/src/server/checklist.ts`](../server/checklist.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](../server/index.md)

