# `src/lib/radarSyntheticChecks.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `buildSyntheticCanaryChecks(telemetry: RadarTelemetrySnapshot, probes: Record<string, RadarSyntheticProbeResult>, now: number): BusinessRadarCheck[]`
- `buildSyntheticCanaryIssues(telemetry: RadarTelemetrySnapshot, probes: Record<string, RadarSyntheticProbeResult>, now: number): BusinessRadarIssue[]`

## Depends on (4)

- [`src/lib/businessRadar.ts`](./businessRadar.md)
- [`src/lib/formatDateTime.ts`](./formatDateTime.md)
- [`src/lib/server/radarTelemetry.ts`](./server/radarTelemetry.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (2)

- [`scripts/smoke-business-radar.test.ts`](../../scripts/smoke-business-radar.test.md)
- [`src/lib/server/businessIssueRadar.ts`](./server/businessIssueRadar.md)

