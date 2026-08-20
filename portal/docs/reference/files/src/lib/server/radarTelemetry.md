# `src/lib/server/radarTelemetry.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `interface RadarTelemetryProperty (22 members)`
- `interface RadarTelemetrySnapshot (3 members)`
- `buildRadarTelemetrySnapshot(agencyWebsite: AgencyWebsiteProject | undefined, clients: Client[], syntheticProbes: Record<string, RadarSyntheticProbeResult> = {}, now = Date.now()): RadarTelemetrySnapshot`

## Depends on (5)

- [`src/lib/businessRadar.ts`](../businessRadar.md)
- [`src/lib/clientTelemetry.ts`](../clientTelemetry.md)
- [`src/lib/clientWorkspace.ts`](../clientWorkspace.md)
- [`src/lib/formatDateTime.ts`](../formatDateTime.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (8)

- [`scripts/smoke-business-radar.test.ts`](../../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/lib/radarSentinels.ts`](../radarSentinels.md)
- [`src/lib/radarSyntheticChecks.ts`](../radarSyntheticChecks.md)
- [`src/lib/server/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/clientRadar.ts`](./clientRadar.md)
- [`src/lib/server/commandIntelligence.ts`](./commandIntelligence.md)
- [`src/lib/server/radarObservations.ts`](./radarObservations.md)

