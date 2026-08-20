# `src/built-ins/modules/agency-hr/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the agency-HR plugin.  HR is agency-scoped (`scopePolicy: "agency"`), so it never sees a `clientId`. The foundation surface it consumes is small:  - TenantPort       — read agency metadata for activity messages, validate the install scope at boot. - ActivityPort     — write `hr.*` actions to the foundation log. - EventBusPort     — emit `hr.*` events for downstream listeners (notifications, audit, future automations). - PluginInstallStorePort — peek at the install row when the manifest needs to display config / disabled state.  Concrete implementations live in T1's `04-the-final-portal/portal/`. T1 binds them at boot via `registerAgencyHrFoundation({...})` and passes a per-request container into every page + API handler.

## Exports (7)

- `interface TenantPort (1 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type HrEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`

## Depends on (1)

- [`src/built-ins/modules/agency-hr/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (8)

- [`src/built-ins/modules/agency-hr/src/__smoke__/hr.test.ts`](../__smoke__/hr.test.md)
- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/server/departments.ts`](./departments.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/agency-hr/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-hr/src/server/leave.ts`](./leave.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](./roles.md)
- [`src/built-ins/modules/agency-hr/src/server/staff.ts`](./staff.md)

