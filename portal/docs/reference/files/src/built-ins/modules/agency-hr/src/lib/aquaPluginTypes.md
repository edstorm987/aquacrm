# `src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Vendored copy of the Aqua plugin contract.  Mirrors `04-the-final-portal/portal/src/plugins/_types.ts` byte-for- byte aside from import paths (we substitute our local `tenancy.ts` for `@/server/types`). Keeping a vendored copy lets the plugin run `tsc --noEmit` standalone — the foundation registers it as `as unknown as AquaPlugin` at boot, and the validator checks the real shape once at module load.  **TODO** — when the chief commander unifies the plugin contract, this file becomes a re-export of the canonical types from the foundation package.

## Exports (20)

- `type PluginCategory`
- `type PluginStatus`
- `interface PluginCtx (6 members)`
- `interface PluginStorage (4 members)`
- `interface PluginServices (9 members)`
- `interface SetupStep (6 members)`
- `interface SetupField (7 members)`
- `interface NavGroup (3 members)`
- `type PluginRoleVisibility`
- `interface NavItem (11 members)`
- `interface PluginPage (6 members)`
- `interface PluginPageProps (8 members)`
- `interface PluginApiRoute (5 members)`
- `interface SettingsSchema (2 members)`
- `interface SettingsGroup (4 members)`
- `interface SettingsField (7 members)`
- `interface PluginFeature (5 members)`
- `interface HealthStatus (3 members)`
- `type ScopePolicy`
- `interface AquaPlugin (25 members)`

## Depends on (2)

- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](./tenancy.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](../server/ports.md)

## Used by (16)

- [`src/built-ins/modules/agency-hr/index.ts`](../../index.md)
- [`src/built-ins/modules/agency-hr/src/__smoke__/hr.test.ts`](../__smoke__/hr.test.md)
- [`src/built-ins/modules/agency-hr/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-hr/src/api/routes.ts`](../api/routes.md)
- [`src/built-ins/modules/agency-hr/src/pages/DepartmentsPage.tsx`](../pages/DepartmentsPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/EmployeesPage.tsx`](../pages/EmployeesPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/LeaveRequestsPage.tsx`](../pages/LeaveRequestsPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/RolesPage.tsx`](../pages/RolesPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/StaffPage.tsx`](../pages/StaffPage.md)
- [`src/built-ins/modules/agency-hr/src/server/departments.ts`](../server/departments.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/agency-hr/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](../server/leave.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](../server/roles.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](../server/staff.md)

