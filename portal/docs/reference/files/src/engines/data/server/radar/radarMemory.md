# `src/engines/data/server/radar/radarMemory.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (4)

- `buildRadarMemoryDigest(agencyId: string, radar: RadarWithoutMemory, now = radar.generatedAt, includeCurrentSweep = false): RadarMemoryDigest`
- `recordRadarSweep(agencyId: string, radar: BusinessIssueRadar): RadarMemoryDigest`
- `getRadarMemoryState(agencyId: string): RadarMemoryState | null`
- `buildRadarMemoryIssues(memory: RadarMemoryDigest, now: number): BusinessRadarIssue[]`

## Depends on (3)

- [`src/engines/data/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (3)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/engines/data/server/radar/radarSweeps.ts`](./radarSweeps.md)

