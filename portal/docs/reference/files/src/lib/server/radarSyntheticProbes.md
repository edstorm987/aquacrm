# `src/lib/server/radarSyntheticProbes.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `interface RadarSyntheticTarget (3 members)`
- `async runAgencySyntheticProbes(agencyId: string, options: { force?: boolean; now?: number } = {}): Promise<RadarSyntheticProbeResult[]>`
- `listAgencySyntheticProbes(agencyId: string): RadarSyntheticProbeResult[]`
- `discoverRadarSyntheticTargets(agencyId: string): RadarSyntheticTarget[]`

## Depends on (4)

- [`src/lib/clientWorkspace.ts`](../clientWorkspace.md)
- [`src/lib/radarSyntheticSafety.ts`](../radarSyntheticSafety.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (2)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/lib/server/radarSweeps.ts`](./radarSweeps.md)

