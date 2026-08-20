# `src/server/phases.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (6)

- `phaseLabel(stage: ClientStage): string`
- `listPhasesForAgency(agencyId: string): PhaseDefinition[]`
- `getPhase(id: string): PhaseDefinition | null`
- `upsertPhase(phase: PhaseDefinition): PhaseDefinition`
- `getPhaseForClientStage(agencyId: string, stage: string): PhaseDefinition | null`
- `deletePhase(id: string): boolean`

## Depends on (2)

- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (19)

- [`src/app/api/auth/preview-as-client-at-phase/route.ts`](../app/api/auth/preview-as-client-at-phase/route.md)
- [`src/app/api/portal/phases/delete/route.ts`](../app/api/portal/phases/delete/route.md)
- [`src/app/api/portal/phases/upsert/route.ts`](../app/api/portal/phases/upsert/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/app/portal/agency/phases/[phaseId]/page.tsx`](../app/portal/agency/phases/[phaseId]/page.md)
- [`src/app/portal/agency/phases/page.tsx`](../app/portal/agency/phases/page.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/app/portal/agency/portals/_portalWorkspaceData.ts`](../app/portal/agency/portals/_portalWorkspaceData.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/[clientId]/settings/page.tsx`](../app/portal/clients/[clientId]/settings/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/built-ins/runtime/foundation-adapters/phaseStoreAdapter.ts`](../built-ins/runtime/foundation-adapters/phaseStoreAdapter.md)
- [`src/lib/server/portal/previewPhase.ts`](../lib/server/portal/previewPhase.md)
- [`src/lib/server/seeds/demoSeed.ts`](../lib/server/seeds/demoSeed.md)
- [`src/server/phaseApplier.ts`](./phaseApplier.md)

