# `src/built-ins/modules/bos-auth-gate/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (9)

- `interface GateFoundation (4 members)`
- `registerGateFoundation(deps: GateFoundation): void`
- `clearGateFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): GateFoundation`
- `interface ContainerForArgs (3 members)`
- `containerFor(args: ContainerForArgs): GateContainer`
- `containerWithDeps(args: { agencyId: AgencyId; activity: ActivityLogPort; events: EventBusPort; user: UserPort; funnel?: FunnelMePort; }): GateContainer`
- `_containerFromCtx(args: { agencyId: AgencyId }): GateContainer | null`

## Depends on (4)

- [`src/built-ins/modules/bos-auth-gate/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/bos-auth-gate/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/bos-auth-gate/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/bos-auth-gate/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/bos-auth-gate/index.ts`](../../index.md)
- [`src/built-ins/modules/bos-auth-gate/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/bos-auth-gate/src/server/index.ts`](./index.md)

