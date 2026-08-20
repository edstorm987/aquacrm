# `src/built-ins/modules/agency-hr/src/lib/time.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Clock indirection so timestamp-sensitive tests can stub.

## Exports (6)

- `type Clock`
- `now(): number`
- `setClock(c: Clock): void`
- `resetClock(): void`
- `toDateString(epochMs: number): string`
- `daysBetween(startDate: string, endDate: string): number`

## Used by (4)

- [`src/built-ins/modules/agency-hr/src/server/departments.ts`](../server/departments.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](../server/leave.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](../server/roles.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](../server/staff.md)

