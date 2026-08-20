# `src/built-ins/modules/memberships/src/lib/time.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Clock indirection so timestamp-sensitive tests can stub.

## Exports (5)

- `type Clock`
- `now(): number`
- `setClock(c: Clock): void`
- `resetClock(): void`
- `isoNow(): string`

## Used by (4)

- [`src/built-ins/modules/memberships/src/server/benefits.ts`](../server/benefits.md)
- [`src/built-ins/modules/memberships/src/server/plans.ts`](../server/plans.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](../server/subscriptions.md)
- [`src/built-ins/modules/memberships/src/server/webhook.ts`](../server/webhook.md)

