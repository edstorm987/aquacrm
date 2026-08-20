# `src/lib/server/radar/radarTelemetry.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `interface RadarTelemetryProperty (22 members)`
- `interface RadarTelemetrySnapshot (3 members)`
- `buildRadarTelemetrySnapshot(agencyWebsite: AgencyWebsiteProject | undefined, clients: Client[], syntheticProbes: Record<string, RadarSyntheticProbeResult> = {}, now = Date.now()): RadarTelemetrySnapshot`

## Depends on (5)

- [`src/lib/clients/clientTelemetry.ts`](../../clients/clientTelemetry.md)
- [`src/lib/clients/clientWorkspace.ts`](../../clients/clientWorkspace.md)
- [`src/lib/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/lib/shared/formatDateTime.ts`](../../shared/formatDateTime.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (8)

- [`scripts/smoke-business-radar.test.ts`](../../../../scripts/smoke-business-radar.test.md)
- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/lib/radar/radarSentinels.ts`](../../radar/radarSentinels.md)
- [`src/lib/radar/radarSyntheticChecks.ts`](../../radar/radarSyntheticChecks.md)
- [`src/lib/server/commandIntelligenceService.ts`](../commandIntelligenceService.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/radar/clientRadarService.ts`](./clientRadarService.md)
- [`src/lib/server/radar/radarObservations.ts`](./radarObservations.md)

