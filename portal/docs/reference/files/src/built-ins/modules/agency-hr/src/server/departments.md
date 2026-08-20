# `src/built-ins/modules/agency-hr/src/server/departments.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Department service. Persists `Department` rows under `dept:<id>` keys + a `dept/index` list. Tree validation refuses cycles via parentId.

## Exports (2)

- `DEFAULT_DEPARTMENTS: readonly { name: string; description?: string }[]`
- `class DepartmentService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(): Promise<Department[]>`
    - `async get(id: string): Promise<Department | null>`
    - `async create(input: CreateDepartmentInput, actor: UserId): Promise<Department>`
    - `async update(id: string, patch: UpdateDepartmentPatch, actor: UserId): Promise<Department | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }>`

## Depends on (6)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-hr/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)

