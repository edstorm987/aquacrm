# `src/built-ins/modules/leads-pipeline/src/lib/time.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Clock indirection so timestamp-sensitive smoke tests can stub.

## Exports (4)

- `type Clock`
- `now(): number`
- `setClock(c: Clock): void`
- `resetClock(): void`

## Used by (5)

- [`src/built-ins/modules/leads-pipeline/src/server/campaigns.ts`](../server/campaigns.md)
- [`src/built-ins/modules/leads-pipeline/src/server/commercial.ts`](../server/commercial.md)
- [`src/built-ins/modules/leads-pipeline/src/server/contacts.ts`](../server/contacts.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](../server/leads.md)
- [`src/built-ins/modules/leads-pipeline/src/server/prospects.ts`](../server/prospects.md)

