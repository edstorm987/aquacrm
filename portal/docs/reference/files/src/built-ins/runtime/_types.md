# `src/built-ins/runtime/_types.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Aqua plugin platform — type contract.  Lifted from `02 felicias aqua portal work/src/plugins/_types.ts` and adapted for the three-level tenancy model in `04-architecture.md`. Aligned in Round 2 with T2's local `aquaPluginTypes.ts` so the fulfillment plugin (and future first-party plugins) compile against one source of truth.  Every feature in the portal (Fulfillment, Website editor, E-commerce, Memberships, …) is an `AquaPlugin`. The registry collects them; the runtime installs them into a tenant scope (agency-wide or client- scoped); the chrome reads installs to assemble the sidebar nav.  New feature workflow: 1. mkdir 04-the-final-portal/plugins/<id>/ 2. Author manifest exporting `default: AquaPlugin` 3. Register it in src/plugins/_registry.ts 4. Done. Sidebar nav, API routes and pages mount from the manifest.

## Exports (53)

- `type PluginCategory`
- `type PluginStatus`
- `type PlanId`
- `interface CreateClientInput (7 members)`
- `interface UpdateClientPatch (6 members)`
- `interface ClientStorePort (5 members)`
- `interface UpsertPluginInstallInput (7 members)`
- `interface PluginInstallPatch (4 members)`
- `interface PluginInstallStorePort (6 members)`
- `interface PluginRuntimePort (3 members)`
- `interface PluginRegistryEntry (10 members)`
- `interface PluginRegistryPort (3 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type EventName`
- `interface EventBusPort (1 members)`
- `type PortalRole`
- `PORTAL_ROLES: readonly PortalRole[]`
- `assertPortalRole(v: unknown): PortalRole`
- `isPortalRole(v: unknown): v is PortalRole`
- `interface PortalVariantPort (1 members)`
- `interface PhaseStorePort (4 members)`
- `interface PublicMediaStoreInput (5 members)`
- `interface StoredPublicMedia (2 members)`
- `interface PublicMediaPort (1 members)`
- `interface PluginServices (9 members)`
- `interface PluginCtx (6 members)`
- `interface PluginStorage (4 members)`
- `interface SetupStep (6 members)`
- `interface SetupField (7 members)`
- `interface NavGroup (3 members)`
- `type PanelId`
- `interface NavItem (14 members)`
- `interface PluginPage (6 members)`
- `interface PluginPageProps (8 members)`
- `interface PluginApiRoute (7 members)`
- `interface BlockDescriptor (6 members)`
- `interface StorefrontRoute (3 members)`
- `interface HeadInjection (4 members)`
- `interface SettingsSchema (2 members)`
- `interface SettingsGroup (4 members)`
- `interface SettingsField (8 members)`
- `interface PluginFeature (6 members)`
- `interface HealthStatus (3 members)`
- `type PluginScopePolicy`
- `interface ErasureSubject (3 members)`
- `type PluginDataDisposition`
- `interface AquaPlugin (29 members)`
- `interface AquaPreset (7 members)`
- `interface PresetPluginEntry (3 members)`
- `navItemAllowedRoles(item: NavItem): Role[] | undefined`
- `pluginPageAllowedRoles(page: PluginPage): Role[] | undefined`

## Depends on (1)

- [`src/server/types.ts`](../../server/types.md)

## Used by (23)

- [`scripts/smoke-portal-role-brandkit.test.ts`](../../../scripts/smoke-portal-role-brandkit.test.md)
- [`src/app/api/portal/[module]/[...rest]/route.ts`](../../app/api/portal/[module]/[...rest]/route.md)
- [`src/app/portal/agency/[...rest]/page.tsx`](../../app/portal/agency/[...rest]/page.md)
- [`src/app/portal/clients/[clientId]/[...rest]/page.tsx`](../../app/portal/clients/[clientId]/[...rest]/page.md)
- [`src/app/portal/customer/[...rest]/page.tsx`](../../app/portal/customer/[...rest]/page.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorRoutePage.tsx`](../modules/website-editor/src/pages/EditorRoutePage.md)
- [`src/built-ins/runtime/_presets.ts`](./_presets.md)
- [`src/built-ins/runtime/_registry.ts`](./_registry.md)
- [`src/built-ins/runtime/_routeResolver.ts`](./_routeResolver.md)
- [`src/built-ins/runtime/_runtime.ts`](./_runtime.md)
- [`src/built-ins/runtime/_validate.ts`](./_validate.md)
- [`src/built-ins/runtime/foundation-adapters/activityLogAdapter.ts`](./foundation-adapters/activityLogAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/clientStoreAdapter.ts`](./foundation-adapters/clientStoreAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/eventBusAdapter.ts`](./foundation-adapters/eventBusAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](./foundation-adapters/index.md)
- [`src/built-ins/runtime/foundation-adapters/phaseStoreAdapter.ts`](./foundation-adapters/phaseStoreAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/pluginInstallStoreAdapter.ts`](./foundation-adapters/pluginInstallStoreAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/pluginRegistryAdapter.ts`](./foundation-adapters/pluginRegistryAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/pluginRuntimeAdapter.ts`](./foundation-adapters/pluginRuntimeAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/portalVariantAdapter.ts`](./foundation-adapters/portalVariantAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts`](./foundation-adapters/publicMediaAdapter.md)
- [`src/lib/chrome/sidebarLayout.ts`](../../lib/chrome/sidebarLayout.md)
- [`src/lib/server/pluginStorage.ts`](../../lib/server/pluginStorage.md)

