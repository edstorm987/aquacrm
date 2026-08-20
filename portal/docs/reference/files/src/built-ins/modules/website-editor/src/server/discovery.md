# `src/built-ins/modules/website-editor/src/server/discovery.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Auto-site discovery — receives heartbeats from unknown hosts and records them so the agency operator can confirm them as new clients. Adapted from `02/src/portal/server/discovery.ts` — host-scoped (NOT per-clientId) since by definition we don't know which client/agency the host belongs to until it's confirmed.  In 04 we additionally scope by `agencyId` because each agency has its own discovery pipeline (so `agency-a.example.com` heartbeating doesn't leak into `agency-b`'s confirmation queue).

## Exports (6)

- `interface DiscoveryRecord (7 members)`
- `async listDiscoveries(storage: PluginStorage, agencyId: AgencyId): Promise<DiscoveryRecord[]>`
- `async getDiscovery(storage: PluginStorage, agencyId: AgencyId, host: string): Promise<DiscoveryRecord | null>`
- `async recordHeartbeat(storage: PluginStorage, agencyId: AgencyId, host: string, metadata?: Record<string, unknown>): Promise<DiscoveryRecord>`
- `async dismissDiscovery(storage: PluginStorage, agencyId: AgencyId, host: string): Promise<boolean>`
- `async confirmDiscovery(storage: PluginStorage, agencyId: AgencyId, host: string): Promise<boolean>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/api/handlers/discoveries.ts`](../api/handlers/discoveries.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

