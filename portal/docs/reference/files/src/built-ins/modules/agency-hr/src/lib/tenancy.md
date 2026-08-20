# `src/built-ins/modules/agency-hr/src/lib/tenancy.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Tenancy aliases mirrored from `04-the-final-portal/portal/src/server/types.ts` (T1's foundation). Vendored to keep the plugin tsc-clean standalone — the chief commander rewrites this to a re-export once T1 publishes the canonical types from the portal package.

## Exports (13)

- `type AgencyId`
- `type ClientId`
- `type UserId`
- `type PluginId`
- `type Role`
- `AGENCY_ROLES: readonly Role[]`
- `interface BrandKit (8 members)`
- `type EntityStatus`
- `interface Agency (8 members)`
- `interface PluginInstallScope (2 members)`
- `interface PluginInstall (12 members)`
- `type ActivityCategory`
- `interface ActivityEntry (10 members)`

## Used by (11)

- [`src/built-ins/modules/agency-hr/src/__smoke__/hr.test.ts`](../__smoke__/hr.test.md)
- [`src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx`](../components/NewStaffModal.md)
- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](./aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](./domain.md)
- [`src/built-ins/modules/agency-hr/src/server/departments.ts`](../server/departments.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/agency-hr/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](../server/leave.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](../server/ports.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](../server/roles.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](../server/staff.md)

