# `src/engines/data/radar/radarSentinels.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (3)

- `buildSourceSentinelChecks(coverage: readonly AdvisorCoverageSource[], now: number): BusinessRadarCheck[]`
- `buildPropertySentinelChecks(telemetry: RadarTelemetrySnapshot, now: number): BusinessRadarCheck[]`
- `buildRadarWatchdogChecks(input: { checks: readonly BusinessRadarCheck[]; coverage: readonly AdvisorCoverageSource[]; telemetry: RadarTelemetrySnapshot; correlationIssues: readonly BusinessRadarIssue[]; evidence?: RadarEvidenceDigest; /** E…`

## Depends on (3)

- [`src/engines/data/radar/businessRadar.ts`](./businessRadar.md)
- [`src/engines/data/server/radar/radarTelemetry.ts`](../server/radar/radarTelemetry.md)
- [`src/lib/shared/formatDateTime.ts`](../../../lib/shared/formatDateTime.md)

## Used by (3)

- [`scripts/smoke-business-radar.test.ts`](../../../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../server/radar/businessIssueRadar.md)

