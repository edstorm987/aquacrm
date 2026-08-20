# `src/built-ins/modules/agency-hr/src/server/roles.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** RoleService — Employee HQ's permission grid (chapter #59 §9).  Stores `CustomRole` rows under `role:<id>` keys + a `role/index` list (same shape as Staff/Department). Default seed roles are written once per agency on `seedDefaults` (idempotent) and flagged `seed:true` so the Role Builder UI renders them clone-and-edit instead of editable.  `permissionGuard()` is exported as an opt-in helper any plugin handler can call to enforce a `requires: PermissionKey[]` declaration.

## Exports (4)

- `DEFAULT_ROLES: readonly { label: string; permissions: PermissionKey[] }[]`
- `class RoleService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(): Promise<CustomRole[]>`
    - `async get(id: string): Promise<CustomRole | null>`
    - `async create(input: CreateRoleInput, actor: UserId): Promise<CustomRole>`
    - `async update(id: string, patch: UpdateRolePatch, actor: UserId): Promise<CustomRole | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }>`
- `roleHasPermission(role: CustomRole | null | undefined, perm: PermissionKey): boolean`
- `permissionGuard(role: CustomRole | null | undefined, requires: PermissionKey[]): void`

## Depends on (6)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-hr/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)
- [`src/lib/server/auth/effectiveRole.ts`](../../../../../lib/server/auth/effectiveRole.md)

