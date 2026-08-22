# `src/engines/data/radar/radarPolicyEngine.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (5)

- `interface RadarBusinessContext (8 members)`
- `interface AdaptiveRadarResult (5 members)`
- `interface ResolvedRadarPolicy (10 members)`
- `resolveRadarPolicy(configuration: RadarPolicyConfiguration, domain: AdvisorDomain, familyId?: string, checkId?: string): ResolvedRadarPolicy`
- `applyAdaptiveRadarPolicy(input: AdaptiveRadarInput): AdaptiveRadarResult`

## Depends on (4)

- [`src/engines/data/radar/businessRadar.ts`](./businessRadar.md)
- [`src/engines/data/radar/radarCheckEngine.ts`](./radarCheckEngine.md)
- [`src/engines/data/radar/radarClassification.ts`](./radarClassification.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (3)

- [`scripts/smoke-business-radar.test.ts`](../../../../scripts/smoke-business-radar.test.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarEvidenceVault.ts`](../server/radar/radarEvidenceVault.md)

