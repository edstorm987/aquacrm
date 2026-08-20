# `src/built-ins/modules/fulfillment/src/server/marketplace.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Marketplace — per-client install / disable / uninstall helpers.  Thin orchestration over `services.pluginRuntime` + `services.registry`. The marketplace UI calls these via API handlers; the new-client wizard also reuses them under the hood.  All operations scope to a (agencyId, clientId) tuple — agency-wide installs of optional plugins go through a separate admin path (out of scope for v1; agency-only marketplace lives in foundation).

## Exports (4)

- `interface MarketplaceCard (3 members)`
- `interface MarketplaceListResult (3 members)`
- `interface MarketplaceFilter (3 members)`
- `class MarketplaceService`
    - `constructor(private registry: PluginRegistryPort, private installs: PluginInstallStorePort, private runtime: PluginRuntimePort, private activity: ActivityLogPort)`
    - `async listForClient(args: { agencyId: AgencyId; clientId: ClientId; filter?: MarketplaceFilter; }): Promise<MarketplaceListResult>`
    - `async installForClient(args: { agencyId: AgencyId; clientId: ClientId; pluginId: string; actor: UserId; setupAnswers?: Record<string, string>; }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>`
    - `async setEnabledForClient(args: { agencyId: AgencyId; clientId: ClientId; pluginId: string; enabled: boolean; actor: UserId; }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>`
    - `async uninstallForClient(args: { agencyId: AgencyId; clientId: ClientId; pluginId: string; actor: UserId; }): Promise<{ ok: true } | { ok: false; error: string }>`

## Depends on (2)

- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)

