# `src/built-ins/modules/agency-hr/src/server/staff.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Staff directory service. Persists `Staff` rows under `staff:<id>` keys + an `staff/index` set for cheap listing.  Why store keys instead of a single blob: the foundation's PluginStorage is a key-value store; storing one row per key keeps individual reads O(1), and the index key holds the id list so list pages don't fan out to `list("staff:")` every render.

## Exports (1)

- `class StaffService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: StaffFilter): Promise<Staff[]>`
    - `async get(id: string): Promise<Staff | null>`
    - `async create(input: CreateStaffInput, actor: UserId): Promise<Staff>`
    - `async update(id: string, patch: UpdateStaffPatch, actor: UserId): Promise<Staff | null>`
    - `async archive(id: string, actor: UserId, leftAt: string): Promise<Staff | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`

## Depends on (6)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-hr/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](./leave.md)

