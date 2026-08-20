# `src/lib/server/radarEvidenceVault.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `interface RadarEvidenceLayer (3 members)`
- `applyRadarEvidenceBaselines(agencyId: string, observations: readonly RadarObservation[]): RadarObservation[]`
- `buildRadarEvidenceLayer(agencyId: string, observations: readonly RadarObservation[], now: number, policy?: RadarPolicyConfiguration): RadarEvidenceLayer`
- `recordRadarEvidence(agencyId: string, radar: BusinessIssueRadar): void`
- `inspectRadarEvidence(agencyId: string): RadarEvidenceInspectionIndex`
- `inspectRadarEvidenceSeries(agencyId: string, id: string): RadarEvidenceSeriesInspection | null`

## Depends on (5)

- [`src/lib/businessRadar.ts`](../businessRadar.md)
- [`src/lib/radarCheckEngine.ts`](../radarCheckEngine.md)
- [`src/lib/radarPolicyEngine.ts`](../radarPolicyEngine.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (10)

- [`src/app/api/portal/advisor/radar/evidence/route.ts`](../../app/api/portal/advisor/radar/evidence/route.md)
- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/app/api/portal/search/route.ts`](../../app/api/portal/search/route.md)
- [`src/app/portal/agency/page.tsx`](../../app/portal/agency/page.md)
- [`src/lib/server/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/commandIntelligence.ts`](./commandIntelligence.md)
- [`src/lib/server/kpiRegistry.ts`](./kpiRegistry.md)
- [`src/lib/server/marketingIntelligence.ts`](./marketingIntelligence.md)
- [`src/lib/server/radarSweeps.ts`](./radarSweeps.md)
- [`src/lib/server/resolutionPlans.ts`](./resolutionPlans.md)

