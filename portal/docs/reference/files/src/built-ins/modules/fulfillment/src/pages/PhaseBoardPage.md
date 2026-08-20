# `src/built-ins/modules/fulfillment/src/pages/PhaseBoardPage.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `/portal/agency/fulfillment/[clientId]` — per-client phase workspace.  `props.segments[0]` carries the `clientId`. Server-rendered: looks up client + current phase + next phase + checklist progress, hands the data to the client component for rendering + interactivity.

## Exports (1)

- `default async PhaseBoardPage(props: PluginPageProps)`

## Depends on (4)

- [`src/built-ins/modules/fulfillment/src/components/PhaseBoard.tsx`](../components/PhaseBoard.md)
- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/fulfillment/src/pages/ClientsPage.tsx`](./ClientsPage.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](../server/index.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

