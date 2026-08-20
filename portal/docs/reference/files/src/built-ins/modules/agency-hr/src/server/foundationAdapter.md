# `src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as ecommerce.  The plugin's manifest can't reach into the foundation directly (it must tsc-clean standalone). The foundation imports this module at boot, calls `registerAgencyHrFoundation({...})` once with its real port adapters, and from then on every page + handler resolves its services via `containerFor(storage)`.  Re-exports `EventBusPort`, `TenantPort`, etc. so the foundation can import the *types* alongside the registration helper without reaching deeper than the package's `./server` exports map.

## Exports (8)

- `interface AgencyHrFoundation (4 members)`
- `registerAgencyHrFoundation(deps: AgencyHrFoundation): void`
- `clearAgencyHrFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): AgencyHrFoundation`
- `containerFor(args: { agencyId: AgencyId; storage: PluginStorage; }): AgencyHrContainer`
- `containerWithDeps(args: { agencyId: AgencyId; storage: PluginStorage; foundation: AgencyHrFoundation; }): AgencyHrContainer`
- `_containerFromCtx(args: { agencyId: AgencyId; actor: UserId; storage: PluginStorage; }): AgencyHrContainer | null`

## Depends on (4)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](./ports.md)

## Used by (9)

- [`src/built-ins/modules/agency-hr/index.ts`](../../index.md)
- [`src/built-ins/modules/agency-hr/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-hr/src/pages/DepartmentsPage.tsx`](../pages/DepartmentsPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/EmployeesPage.tsx`](../pages/EmployeesPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/LeaveRequestsPage.tsx`](../pages/LeaveRequestsPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/RolesPage.tsx`](../pages/RolesPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/agency-hr/src/pages/StaffPage.tsx`](../pages/StaffPage.md)
- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)

