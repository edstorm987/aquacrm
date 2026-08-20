# `src/lib/radar/radarRuleCatalog.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface RadarSignalFamilyDefinition (3 members)`
- `interface BusinessRadarRuleDefinition (9 members)`
- `RADAR_RULE_LENSES: ReadonlyArray<{ id: RadarRuleLens; label: string; description: string }>`
- `RADAR_SIGNAL_FAMILIES`
- `BUSINESS_RADAR_RULE_CATALOG: readonly BusinessRadarRuleDefinition[]`
- `RADAR_CHECKS_PER_DOMAIN`
- `radarRulesForDomain(domain: AdvisorDomain): readonly BusinessRadarRuleDefinition[]`

## Depends on (2)

- [`src/lib/radar/businessRadar.ts`](./businessRadar.md)
- [`src/lib/radar/radarClassification.ts`](./radarClassification.md)

## Used by (6)

- [`scripts/generate-radar-rules-reference.ts`](../../../scripts/generate-radar-rules-reference.md)
- [`scripts/smoke-business-radar.test.ts`](../../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-radar-classification.test.ts`](../../../scripts/smoke-radar-classification.test.md)
- [`src/lib/radar/radarCheckEngine.ts`](./radarCheckEngine.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../server/radar/businessIssueRadar.md)
- [`src/lib/server/radar/radarObservations.ts`](../server/radar/radarObservations.md)

