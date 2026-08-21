# `src/engines/data/server/radar/radarTelemetry.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (3)

- `interface RadarTelemetryProperty (22 members)`
- `interface RadarTelemetrySnapshot (3 members)`
- `buildRadarTelemetrySnapshot(agencyWebsite: AgencyWebsiteProject | undefined, clients: Client[], syntheticProbes: Record<string, RadarSyntheticProbeResult> = {}, now = Date.now()): RadarTelemetrySnapshot`

## Depends on (5)

- [`src/engines/data/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/lib/clients/clientTelemetry.ts`](../../../../lib/clients/clientTelemetry.md)
- [`src/lib/clients/clientWorkspace.ts`](../../../../lib/clients/clientWorkspace.md)
- [`src/lib/shared/formatDateTime.ts`](../../../../lib/shared/formatDateTime.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (8)

- [`scripts/smoke-business-radar.test.ts`](../../../../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../../../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/engines/data/radar/radarSentinels.ts`](../../radar/radarSentinels.md)
- [`src/engines/data/radar/radarSyntheticChecks.ts`](../../radar/radarSyntheticChecks.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/engines/data/server/radar/clientRadarService.ts`](./clientRadarService.md)
- [`src/engines/data/server/radar/radarObservations.ts`](./radarObservations.md)
- [`src/lib/server/commandIntelligenceService.ts`](../../../../lib/server/commandIntelligenceService.md)

