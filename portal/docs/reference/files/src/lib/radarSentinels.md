# `src/lib/radarSentinels.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `buildSourceSentinelChecks(coverage: readonly AdvisorCoverageSource[], now: number): BusinessRadarCheck[]`
- `buildPropertySentinelChecks(telemetry: RadarTelemetrySnapshot, now: number): BusinessRadarCheck[]`
- `buildRadarWatchdogChecks(input: { checks: readonly BusinessRadarCheck[]; coverage: readonly AdvisorCoverageSource[]; telemetry: RadarTelemetrySnapshot; correlationIssues: readonly BusinessRadarIssue[]; evidence?: RadarEvidenceDigest; /** E…`

## Depends on (3)

- [`src/lib/businessRadar.ts`](./businessRadar.md)
- [`src/lib/formatDateTime.ts`](./formatDateTime.md)
- [`src/lib/server/radarTelemetry.ts`](./server/radarTelemetry.md)

## Used by (3)

- [`scripts/smoke-business-radar.test.ts`](../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/lib/server/businessIssueRadar.ts`](./server/businessIssueRadar.md)

