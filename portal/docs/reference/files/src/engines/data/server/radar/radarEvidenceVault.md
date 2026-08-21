# `src/engines/data/server/radar/radarEvidenceVault.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (6)

- `interface RadarEvidenceLayer (3 members)`
- `applyRadarEvidenceBaselines(agencyId: string, observations: readonly RadarObservation[]): RadarObservation[]`
- `buildRadarEvidenceLayer(agencyId: string, observations: readonly RadarObservation[], now: number, policy?: RadarPolicyConfiguration): RadarEvidenceLayer`
- `recordRadarEvidence(agencyId: string, radar: BusinessIssueRadar): void`
- `inspectRadarEvidence(agencyId: string): RadarEvidenceInspectionIndex`
- `inspectRadarEvidenceSeries(agencyId: string, id: string): RadarEvidenceSeriesInspection | null`

## Depends on (5)

- [`src/engines/data/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/engines/data/radar/radarCheckEngine.ts`](../../radar/radarCheckEngine.md)
- [`src/engines/data/radar/radarPolicyEngine.ts`](../../radar/radarPolicyEngine.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (10)

- [`src/app/api/portal/advisor/radar/evidence/route.ts`](../../../../app/api/portal/advisor/radar/evidence/route.md)
- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/app/api/portal/search/route.ts`](../../../../app/api/portal/search/route.md)
- [`src/app/portal/agency/page.tsx`](../../../../app/portal/agency/page.md)
- [`src/engines/data/server/kpi/kpiRegistryService.ts`](../kpi/kpiRegistryService.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/engines/data/server/radar/radarSweeps.ts`](./radarSweeps.md)
- [`src/lib/server/commandIntelligenceService.ts`](../../../../lib/server/commandIntelligenceService.md)
- [`src/lib/server/marketingIntelligence.ts`](../../../../lib/server/marketingIntelligence.md)
- [`src/lib/server/resolutionPlans.ts`](../../../../lib/server/resolutionPlans.md)

