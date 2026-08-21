# `src/lib/intelligence/commercialIntelligence.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `type CommercialLineage`
- `type CommercialIntelligenceSnapshotWithMeasurement`
- `buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency, pageviews, forms, now = Date.now(), }: BuildCommercialIntelligenceInput): CommercialIntelligenceSnapshotWithMeasurement`

## Depends on (3)

- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../../built-ins/modules/leads-pipeline/src/lib/domain.md)
- [`src/lib/intelligence/commandIntelligence.ts`](./commandIntelligence.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`scripts/smoke-commercial-intelligence.test.ts`](../../../scripts/smoke-commercial-intelligence.test.md)
- [`src/app/portal/agency/_CommercialIntelligenceWorkspace.tsx`](../../app/portal/agency/_CommercialIntelligenceWorkspace.md)
- [`src/app/portal/agency/commandPerformance.ts`](../../app/portal/agency/commandPerformance.md)
- [`src/lib/server/commandIntelligenceService.ts`](../server/commandIntelligenceService.md)

