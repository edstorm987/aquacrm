# `src/built-ins/modules/fulfillment/src/lib/time.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `now()` indirection — stubbed in tests to make timestamp-sensitive assertions deterministic. Production calls `Date.now()` directly.

## Exports (4)

- `type Clock`
- `now(): number`
- `setClock(c: Clock): void`
- `resetClock(): void`

## Used by (1)

- [`src/built-ins/modules/fulfillment/src/server/checklist.ts`](../server/checklist.md)

