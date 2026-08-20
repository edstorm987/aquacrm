# `src/lib/radar/radarCheckEngine.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `interface RadarObservation (22 members)`
- `buildRadarCheckMatrix(observations: readonly RadarObservation[], coverage: readonly AdvisorCoverageSource[], now = Date.now()): { checks: BusinessRadarCheck[]; domains: RadarDomainSummary[] }`
- `summarizeRadarChecks(checks: readonly BusinessRadarCheck[], coverage: readonly AdvisorCoverageSource[]): RadarDomainSummary[]`

## Depends on (3)

- [`src/lib/radar/businessRadar.ts`](./businessRadar.md)
- [`src/lib/radar/radarRuleCatalog.ts`](./radarRuleCatalog.md)
- [`src/lib/shared/formatDateTime.ts`](../shared/formatDateTime.md)

## Used by (6)

- [`scripts/smoke-business-radar.test.ts`](../../../scripts/smoke-business-radar.test.md)
- [`src/lib/radar/radarCorrelations.ts`](./radarCorrelations.md)
- [`src/lib/radar/radarPolicyEngine.ts`](./radarPolicyEngine.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../server/radar/businessIssueRadar.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](../server/radar/radarEvidenceVault.md)
- [`src/lib/server/radar/radarObservations.ts`](../server/radar/radarObservations.md)

