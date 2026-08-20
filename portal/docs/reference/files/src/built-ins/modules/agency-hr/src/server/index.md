# `src/built-ins/modules/agency-hr/src/server/index.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-side barrel — three services + container builder + foundation adapter exports. Same shape as fulfillment + ecommerce so the foundation's wire-up code is symmetrical across plugins.

## Exports (3)

- `interface AgencyHrDeps (6 members)`
- `interface AgencyHrContainer (4 members)`
- `buildAgencyHrContainer(deps: AgencyHrDeps): AgencyHrContainer`

## Depends on (9)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-hr/src/server/departments.ts`](./departments.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](./leave.md)
- [`src/built-ins/modules/agency-hr/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](./roles.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](./staff.md)

## Used by (2)

- [`src/built-ins/modules/agency-hr/src/__smoke__/hr.test.ts`](../__smoke__/hr.test.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](./foundationAdapter.md)

