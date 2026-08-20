# `src/lib/radarCheckEngine.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `interface RadarObservation (22 members)`
- `buildRadarCheckMatrix(observations: readonly RadarObservation[], coverage: readonly AdvisorCoverageSource[], now = Date.now()): { checks: BusinessRadarCheck[]; domains: RadarDomainSummary[] }`
- `summarizeRadarChecks(checks: readonly BusinessRadarCheck[], coverage: readonly AdvisorCoverageSource[]): RadarDomainSummary[]`

## Depends on (3)

- [`src/lib/businessRadar.ts`](./businessRadar.md)
- [`src/lib/formatDateTime.ts`](./formatDateTime.md)
- [`src/lib/radarRuleCatalog.ts`](./radarRuleCatalog.md)

## Used by (6)

- [`scripts/smoke-business-radar.test.ts`](../../scripts/smoke-business-radar.test.md)
- [`src/lib/radarCorrelations.ts`](./radarCorrelations.md)
- [`src/lib/radarPolicyEngine.ts`](./radarPolicyEngine.md)
- [`src/lib/server/businessIssueRadar.ts`](./server/businessIssueRadar.md)
- [`src/lib/server/radarEvidenceVault.ts`](./server/radarEvidenceVault.md)
- [`src/lib/server/radarObservations.ts`](./server/radarObservations.md)

