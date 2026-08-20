# `src/built-ins/modules/agency-hr/src/pages/EmployeesPage.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** EmployeesPage — Employee HQ surface (chapter #59 §9). Mounted via the manifest at `/portal/agency/agency-hr/employees`. Reads the staff directory + roles through the per-request container, filters down to rows flagged `agencyEmployee:true` (or any row with a customRoleId, to surface bootstrap migrations), and renders a flat table with inline-expandable per-row profile (NDA / payroll / assignments).

## Exports (2)

- `API_BASE`
- `default async EmployeesPage(props: PluginPageProps)`

## Depends on (3)

- [`src/built-ins/modules/agency-hr/src/components/EmployeeListClient.tsx`](../components/EmployeeListClient.md)
- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

