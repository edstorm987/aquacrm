# `src/built-ins/modules/leads-pipeline/src/pages/LeadsBoardPage.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-rendered Leads pipeline board view. Mounted at `/portal/agency/pipelines/leads` (per the manifest navItem). v1 ships a placeholder — the real kanban host (T2 R+1, kanban plugin) reads `Pipeline` + `PipelineCard` rows from the foundation. Until then this page surfaces a flat list of leads grouped by their tracked column (or `New` when no card exists yet).

## Exports (1)

- `default async LeadsBoardPage(props: PluginPageProps)`

## Depends on (2)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

