# `src/built-ins/modules/agency-hr/src/server/leave.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Leave-request service. Persists `LeaveRequest` rows under `leave:<id>` keys + a `leave/index` list. Per-staff filtering walks the index — fine for v1 volumes (≤ a few thousand rows per agency).

## Exports (1)

- `class LeaveService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort, private staff: StaffService)`
    - `async list(filter?: LeaveFilter): Promise<LeaveRequest[]>`
    - `async get(id: string): Promise<LeaveRequest | null>`
    - `async request(input: CreateLeaveInput, actor: UserId): Promise<LeaveRequest>`
    - `async decide(id: string, decision: DecideLeaveInput): Promise<LeaveRequest | null>`
    - `async cancel(id: string, actor: UserId): Promise<boolean>`

## Depends on (7)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-hr/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](./staff.md)

## Used by (1)

- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)

