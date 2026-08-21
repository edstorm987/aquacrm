# `src/lib/intelligence/commercialLifecycle.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface CommercialLifecycleLead (9 members)`
- `interface CommercialSourceCohort (15 members)`
- `interface CommercialLifecycleSnapshot (27 members)`
- `buildCommercialLifecycleSnapshot({ leads, clients, now = Date.now(), available = true, }: BuildCommercialLifecycleInput): CommercialLifecycleSnapshot`
- `buildCommercialLifecycleChecks(snapshot: CommercialLifecycleSnapshot): BusinessRadarCheck[]`
- `buildCommercialLifecycleIssues(snapshot: CommercialLifecycleSnapshot, checks: readonly BusinessRadarCheck[]): BusinessRadarIssue[]`
- `buildCommercialLifecycleSignals(snapshot: CommercialLifecycleSnapshot): BusinessMetricSignal[]`

## Depends on (2)

- [`src/engines/data/radar/businessRadar.ts`](../../engines/data/radar/businessRadar.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (5)

- [`scripts/smoke-commercial-lifecycle-radar.test.ts`](../../../scripts/smoke-commercial-lifecycle-radar.test.md)
- [`src/app/portal/agency/commandPerformance.ts`](../../app/portal/agency/commandPerformance.md)
- [`src/engines/data/radar/businessRadar.ts`](../../engines/data/radar/businessRadar.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../../engines/data/server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarObservations.ts`](../../engines/data/server/radar/radarObservations.md)

