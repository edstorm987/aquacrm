# `src/lib/server/radarMemory.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `buildRadarMemoryDigest(agencyId: string, radar: RadarWithoutMemory, now = radar.generatedAt, includeCurrentSweep = false): RadarMemoryDigest`
- `recordRadarSweep(agencyId: string, radar: BusinessIssueRadar): RadarMemoryDigest`
- `getRadarMemoryState(agencyId: string): RadarMemoryState | null`
- `buildRadarMemoryIssues(memory: RadarMemoryDigest, now: number): BusinessRadarIssue[]`

## Depends on (3)

- [`src/lib/businessRadar.ts`](../businessRadar.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (3)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/lib/server/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/radarSweeps.ts`](./radarSweeps.md)

