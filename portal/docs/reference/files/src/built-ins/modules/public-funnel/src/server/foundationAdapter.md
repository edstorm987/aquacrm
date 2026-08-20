# `src/built-ins/modules/public-funnel/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (9)

- `interface FunnelFoundation (6 members)`
- `registerFunnelFoundation(deps: FunnelFoundation): void`
- `clearFunnelFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): FunnelFoundation`
- `interface ContainerForArgs (3 members)`
- `containerFor(args: ContainerForArgs): FunnelContainer`
- `containerWithDeps(args: { agencyId: AgencyId; storage: PluginStorage; activity: ActivityLogPort; events: EventBusPort; leadUsers: LeadUserPort; sessions?: SessionPort; }): FunnelContainer`
- `_containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): FunnelContainer | null`

## Depends on (4)

- [`src/built-ins/modules/public-funnel/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/public-funnel/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/public-funnel/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/public-funnel/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/public-funnel/index.ts`](../../index.md)
- [`src/built-ins/modules/public-funnel/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/public-funnel/src/server/index.ts`](./index.md)

