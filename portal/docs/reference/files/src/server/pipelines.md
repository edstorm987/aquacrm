# `src/server/pipelines.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (25)

- `FULFILMENT_STAGE_TO_COLUMN: Record<string, string>`
- `interface CreatePipelineInput (7 members)`
- `createPipeline(input: CreatePipelineInput): Pipeline`
- `getPipeline(id: string): Pipeline | null`
- `getPipelineBySlug(agencyId: string, slug: string): Pipeline | null`
- `listPipelines(agencyId: string): Pipeline[]`
- `interface UpdatePipelinePatch (5 members)`
- `updatePipeline(agencyId: string, pipelineId: string, patch: UpdatePipelinePatch): Pipeline | null`
- `deletePipeline(agencyId: string, pipelineId: string): boolean`
- `interface SeedDefaultPipelinesResult (2 members)`
- `seedDefaultPipelines(agencyId: string): SeedDefaultPipelinesResult`
- `addCard(agencyId: string, pipelineId: string, input: NewCardInput): PipelineCard | null`
- `interface MoveCardResult (3 members)`
- `moveCard(agencyId: string, cardId: string, toColumnId: string): MoveCardResult | null`
- `listCards(pipelineId: string): PipelineCard[]`
- `deleteCard(agencyId: string, cardId: string): boolean`
- `listCardsByAgency(agencyId: string): PipelineCard[]`
- `interface MigrateClientsResult (3 members)`
- `migrateClientsToFulfilment(agencyId: string): MigrateClientsResult`
- `interface ClientCardProjection (4 members)`
- `projectClientsToFulfilmentCards(agencyId: string): ClientCardProjection[]`
- `pipelineAllowsKind(pipeline: Pipeline, kind: PipelineCardKind): boolean`
- `interface PromoteLeadResult (2 members)`
- `promoteLeadCardToClient(agencyId: string, cardId: string): PromoteLeadResult | null`
- `pipelineCardCounts(agencyId: string): Record<string, number>`

## Depends on (4)

- [`src/server/eventBus.ts`](./eventBus.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (12)

- [`src/app/api/portal/pipelines/move-client/route.ts`](../app/api/portal/pipelines/move-client/route.md)
- [`src/app/api/portal/website-enquiries/classification/route.ts`](../app/api/portal/website-enquiries/classification/route.md)
- [`src/app/portal/agency/marketing/page.tsx`](../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/CampaignsPage.tsx`](../built-ins/modules/leads-pipeline/src/pages/CampaignsPage.md)
- [`src/lib/server/commandIntelligence.ts`](../lib/server/commandIntelligence.md)
- [`src/lib/server/leadsPipelinePorts.ts`](../lib/server/leadsPipelinePorts.md)
- [`src/lib/server/showcaseMode.ts`](../lib/server/showcaseMode.md)
- [`src/server/agencyBootstrap.ts`](./agencyBootstrap.md)

