# `src/engines/data/server/radar/radarSyntheticProbes.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (4)

- `interface RadarSyntheticTarget (3 members)`
- `async runAgencySyntheticProbes(agencyId: string, options: { force?: boolean; now?: number } = {}): Promise<RadarSyntheticProbeResult[]>`
- `listAgencySyntheticProbes(agencyId: string): RadarSyntheticProbeResult[]`
- `discoverRadarSyntheticTargets(agencyId: string): RadarSyntheticTarget[]`

## Depends on (4)

- [`src/engines/data/radar/radarSyntheticSafety.ts`](../../radar/radarSyntheticSafety.md)
- [`src/lib/clients/clientWorkspace.ts`](../../../../lib/clients/clientWorkspace.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (2)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/engines/data/server/radar/radarSweeps.ts`](./radarSweeps.md)

