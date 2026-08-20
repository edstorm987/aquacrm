# `src/app/portal/agency/pipelines/[slug]/page.tsx`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** /portal/agency/pipelines/<slug> — single pipeline kanban view.  T1 R034 foundation surface. Foundation fetches the pipeline + its column shape + a virtual card list (from clients for fulfilment, from PipelineCard rows for everything else) and renders the column scaffold. T2's kanban plugin (R+1) replaces the body with the real drag-drop board; until then the columns + card snapshots ship a readable, accessible view of pipeline state.

## Exports (1)

- `default async PipelineView({ params, searchParams }: RouteProps)`

## Depends on (17)

- [`src/app/portal/agency/pipelines/[slug]/_FulfilmentProductSwitcher.tsx`](./_FulfilmentProductSwitcher.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx`](./_LeadsPipelineWorkspace.md)
- [`src/app/portal/agency/pipelines/[slug]/_PipelineBoard.tsx`](./_PipelineBoard.md)
- [`src/built-ins/runtime/_runtime.ts`](../../../../../built-ins/runtime/_runtime.md)
- [`src/lib/enquiryClassification.ts`](../../../../../lib/enquiryClassification.md)
- [`src/lib/fulfilmentProductPipelines.ts`](../../../../../lib/fulfilmentProductPipelines.md)
- [`src/lib/productAssignments.ts`](../../../../../lib/productAssignments.md)
- [`src/lib/server/auth.ts`](../../../../../lib/server/auth.md)
- [`src/lib/server/pluginStorage.ts`](../../../../../lib/server/pluginStorage.md)
- [`src/server/agencyProducts.ts`](../../../../../server/agencyProducts.md)
- [`src/server/phases.ts`](../../../../../server/phases.md)
- [`src/server/pipelines.ts`](../../../../../server/pipelines.md)
- [`src/server/pluginInstalls.ts`](../../../../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)
- [`src/server/tradingCompanies.ts`](../../../../../server/tradingCompanies.md)
- [`src/server/types.ts`](../../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

