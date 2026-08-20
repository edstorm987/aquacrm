# `src/built-ins/modules/fulfillment/src/pages/ChecklistPage.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `/portal/clients/[clientId]/checklist` — the client-side checklist view.  Visible to roles `client-owner` and `client-staff` (see manifest's nav `visibleToRoles`). Renders only the client-tagged checklist tasks for the client's current phase.  Routes: foundation passes `clientId` as `props.clientId` (the route is `/portal/clients/[clientId]/checklist`, not `/portal/agency/...`).

## Exports (1)

- `default async ChecklistPage(props: PluginPageProps)`

## Depends on (4)

- [`src/built-ins/modules/fulfillment/src/components/ChecklistWidget.tsx`](../components/ChecklistWidget.md)
- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/fulfillment/src/pages/ClientsPage.tsx`](./ClientsPage.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](../server/index.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

