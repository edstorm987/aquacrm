# `src/built-ins/modules/website-editor/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts.  Mirrors T2's `plugins/fulfillment/src/server/ports.ts` — these are the interfaces T1's foundation will bind at boot. T3 only **consumes** these via `PluginCtx.services`; T3 does NOT implement them. (T3 exports `applyStarterVariant` from `./portalVariants.ts` — the foundation adapter wraps that into the `PortalVariantPort` shape T2 calls.)  Kept here so `aquaPluginTypes.ts` (which references them in `PluginServices`) stays tsc-clean standalone.

## Exports (16)

- `interface CreateClientInput (6 members)`
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

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

