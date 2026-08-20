# `src/lib/server/databaseStorageHealth.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `async databaseStorageHealth(now = Date.now()): Promise<RadarInfraHealthSnapshot>`
- `primaryDbProbeStatus(snapshot: RadarInfraHealthSnapshot): { ok: boolean; db: RadarInfraProbeStatus; error?: string }`

## Depends on (1)

- [`src/lib/businessRadar.ts`](../businessRadar.md)

## Used by (4)

- [`scripts/smoke-radar-external-db.test.ts`](../../../scripts/smoke-radar-external-db.test.md)
- [`scripts/smoke-radar-infra-health.test.ts`](../../../scripts/smoke-radar-infra-health.test.md)
- [`src/app/healthz/full/route.ts`](../../app/healthz/full/route.md)
- [`src/lib/server/radarSweeps.ts`](./radarSweeps.md)

