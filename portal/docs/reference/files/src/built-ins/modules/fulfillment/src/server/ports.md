# `src/built-ins/modules/fulfillment/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts.  The fulfillment plugin reaches into T1's foundation only via these interfaces. T1 binds concrete implementations (`portal/src/server/*`) at boot and passes them as `PluginCtx.services` to handlers and as `PluginPageProps.services` to pages.  Keeping the surface explicit: - lets the plugin tsc-clean standalone (no foundation import) - makes the integration point obvious for the chief commander - keeps tests trivial (services can be hand-mocked)  Each port mirrors a slice of T1's `04-the-final-portal/portal/src/server/*`. The shapes are aligned to what T1 has already shipped (commit 032100c).

## Exports (16)

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
- `interface PortalVariantPort (1 members)`
- `interface PhaseStorePort (4 members)`

## Depends on (1)

- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (9)

- [`src/built-ins/modules/fulfillment/src/__smoke__/lifecycle.test.ts`](../__smoke__/lifecycle.test.md)
- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/fulfillment/src/server/checklist.ts`](./checklist.md)
- [`src/built-ins/modules/fulfillment/src/server/clients.ts`](./clients.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/fulfillment/src/server/marketplace.ts`](./marketplace.md)
- [`src/built-ins/modules/fulfillment/src/server/phases.ts`](./phases.md)
- [`src/built-ins/modules/fulfillment/src/server/starterVariant.ts`](./starterVariant.md)
- [`src/built-ins/modules/fulfillment/src/server/transitions.ts`](./transitions.md)

