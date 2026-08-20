# `src/built-ins/modules/agency-hr/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Domain types for the agency-HR plugin. Everything in this file is data-only — services live under `../server/`, components under `../components/` and `../pages/`.  Scope: a single agency. There is no per-client surface; staff are the agency's employees, departments are the agency's org chart, and leave requests are submitted + approved by agency staff. Per `eds requirments.md` the platform's three audiences are agency / clients / end-customers — HR speaks only to the first.

## Exports (21)

- `type StaffStatus`
- `type StaffLocationType`
- `type PermissionKey`
- `ALL_PERMISSION_KEYS: readonly PermissionKey[]`
- `interface ClientAssignment (3 members)`
- `interface CustomRole (9 members)`
- `interface CreateRoleInput (4 members)`
- `interface UpdateRolePatch (4 members)`
- `interface Staff (20 members)`
- `interface Department (7 members)`
- `type LeaveType`
- `type LeaveStatus`
- `interface LeaveRequest (13 members)`
- `interface CreateStaffInput (14 members)`
- `interface UpdateStaffPatch (15 members)`
- `interface CreateDepartmentInput (3 members)`
- `interface UpdateDepartmentPatch (3 members)`
- `interface CreateLeaveInput (5 members)`
- `interface DecideLeaveInput (3 members)`
- `interface StaffFilter (4 members)`
- `interface LeaveFilter (3 members)`

## Depends on (1)

- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](./tenancy.md)

## Used by (14)

- [`src/built-ins/modules/agency-hr/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-hr/src/components/DepartmentList.tsx`](../components/DepartmentList.md)
- [`src/built-ins/modules/agency-hr/src/components/EmployeeListClient.tsx`](../components/EmployeeListClient.md)
- [`src/built-ins/modules/agency-hr/src/components/LeaveBoard.tsx`](../components/LeaveBoard.md)
- [`src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx`](../components/NewStaffModal.md)
- [`src/built-ins/modules/agency-hr/src/components/RoleMatrixClient.tsx`](../components/RoleMatrixClient.md)
- [`src/built-ins/modules/agency-hr/src/components/StaffList.tsx`](../components/StaffList.md)
- [`src/built-ins/modules/agency-hr/src/pages/RolesPage.tsx`](../pages/RolesPage.md)
- [`src/built-ins/modules/agency-hr/src/server/departments.ts`](../server/departments.md)
- [`src/built-ins/modules/agency-hr/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](../server/leave.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](../server/roles.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](../server/staff.md)
- [`src/lib/server/auth/effectiveRole.ts`](../../../../../lib/server/auth/effectiveRole.md)

