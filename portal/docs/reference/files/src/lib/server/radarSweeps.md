# `src/lib/server/radar/radarSweeps.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (16)

- `type RadarSweepType`
- `type RadarSweepCost`
- `interface RadarSweepDefinition (8 members)`
- `RADAR_SWEEP_DEFINITIONS: Record<RadarSweepType, RadarSweepDefinition>`
- `RADAR_TIER_TO_SWEEP: Record<RadarCheckTier, RadarSweepType>`
- `radarSweepForTier(tier: RadarCheckTier): RadarSweepType`
- `interface RadarSweepRunOptions (1 members)`
- `async runRadarDeepSweep(agencyId: string, options: { force?: boolean; now?: number } = {}): Promise<RadarSyntheticProbeResult[]>`
- `async runRadarInfraSweep(now = Date.now()): Promise<RadarInfraHealthSnapshot>`
- `runRadarEvidenceRollup(agencyId: string, radar: BusinessIssueRadar): RadarMemoryDigest`
- `interface RadarFullSweepResult (2 members)`
- `async runRadarFullSweep(agencyId: string, options: RadarSweepRunOptions = {}): Promise<RadarFullSweepResult>`
- `interface RadarScheduledSweepResult (5 members)`
- `async runRadarScheduledSweep(agencyId: string, options: RadarSweepRunOptions = {}): Promise<RadarScheduledSweepResult>`
- `interface RadarProbeRefreshResult (4 members)`
- `async runRadarProbeRefresh(agencyId: string, options: RadarSweepRunOptions = {}): Promise<RadarProbeRefreshResult>`

## Depends on (9)

- [`src/lib/radar/businessRadar.ts`](../businessRadar.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/databaseStorageHealth.ts`](./databaseStorageHealth.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](./radarEvidenceVault.md)
- [`src/lib/server/radar/radarMemory.ts`](./radarMemory.md)
- [`src/lib/server/radar/radarSyntheticProbes.ts`](./radarSyntheticProbes.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tasks.ts`](../../server/tasks.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (5)

- [`scripts/smoke-radar-infra-health.test.ts`](../../../scripts/smoke-radar-infra-health.test.md)
- [`scripts/smoke-radar-sweep-isolation.test.ts`](../../../scripts/smoke-radar-sweep-isolation.test.md)
- [`src/app/api/cron/inbox/route.ts`](../../app/api/cron/inbox/route.md)
- [`src/app/api/cron/radar-probes/route.ts`](../../app/api/cron/radar-probes/route.md)
- [`src/app/api/portal/advisor/radar/route.ts`](../../app/api/portal/advisor/radar/route.md)

