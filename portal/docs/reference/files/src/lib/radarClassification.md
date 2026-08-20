# `src/lib/radarClassification.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `RADAR_TIER_BY_SCOPE: Record<RadarCheckScope, RadarCheckTier>`
- `interface RadarClassifiable (2 members)`
- `radarCheckTier(scope: RadarCheckScope): RadarCheckTier`
- `radarDataDependency(check: RadarClassifiable): RadarDataDependency`
- `interface RadarClassification (2 members)`
- `classifyRadarCheck(check: RadarClassifiable): RadarClassification`
- `RADAR_FINDING_GROUP_LABELS: Record<RadarFindingGroup, string>`
- `radarFindingGroup(input: { domain: AdvisorDomain; id: string }): RadarFindingGroup`

## Depends on (1)

- [`src/lib/businessRadar.ts`](./businessRadar.md)

## Used by (6)

- [`scripts/smoke-radar-classification.test.ts`](../../scripts/smoke-radar-classification.test.md)
- [`scripts/smoke-radar-finding-groups.test.ts`](../../scripts/smoke-radar-finding-groups.test.md)
- [`src/lib/businessRecommendedActions.ts`](./businessRecommendedActions.md)
- [`src/lib/radarPolicyEngine.ts`](./radarPolicyEngine.md)
- [`src/lib/radarRuleCatalog.ts`](./radarRuleCatalog.md)
- [`src/lib/server/businessIssueRadar.ts`](./server/businessIssueRadar.md)

