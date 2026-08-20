# `src/lib/radar/radarPolicyEngine.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface RadarBusinessContext (8 members)`
- `interface AdaptiveRadarResult (5 members)`
- `interface ResolvedRadarPolicy (10 members)`
- `resolveRadarPolicy(configuration: RadarPolicyConfiguration, domain: AdvisorDomain, familyId?: string, checkId?: string): ResolvedRadarPolicy`
- `applyAdaptiveRadarPolicy(input: AdaptiveRadarInput): AdaptiveRadarResult`

## Depends on (4)

- [`src/lib/radar/businessRadar.ts`](./businessRadar.md)
- [`src/lib/radar/radarCheckEngine.ts`](./radarCheckEngine.md)
- [`src/lib/radar/radarClassification.ts`](./radarClassification.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (3)

- [`scripts/smoke-business-radar.test.ts`](../../scripts/smoke-business-radar.test.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./server/businessIssueRadar.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](./server/radarEvidenceVault.md)

