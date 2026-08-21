# `src/engines/data/radar/radarCheckEngine.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (3)

- `interface RadarObservation (22 members)`
- `buildRadarCheckMatrix(observations: readonly RadarObservation[], coverage: readonly AdvisorCoverageSource[], now = Date.now()): { checks: BusinessRadarCheck[]; domains: RadarDomainSummary[] }`
- `summarizeRadarChecks(checks: readonly BusinessRadarCheck[], coverage: readonly AdvisorCoverageSource[]): RadarDomainSummary[]`

## Depends on (3)

- [`src/engines/data/radar/businessRadar.ts`](./businessRadar.md)
- [`src/engines/data/radar/radarRuleCatalog.ts`](./radarRuleCatalog.md)
- [`src/lib/shared/formatDateTime.ts`](../../../lib/shared/formatDateTime.md)

## Used by (6)

- [`scripts/smoke-business-radar.test.ts`](../../../../scripts/smoke-business-radar.test.md)
- [`src/engines/data/radar/radarCorrelations.ts`](./radarCorrelations.md)
- [`src/engines/data/radar/radarPolicyEngine.ts`](./radarPolicyEngine.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarEvidenceVault.ts`](../server/radar/radarEvidenceVault.md)
- [`src/engines/data/server/radar/radarObservations.ts`](../server/radar/radarObservations.md)

