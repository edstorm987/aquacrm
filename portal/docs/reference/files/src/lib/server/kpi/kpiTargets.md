# `src/lib/server/kpi/kpiTargets.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `getKpiTargetsConfig(agencyId: string): KpiTargetsConfig`
- `setKpiTarget(agencyId: string, kpiId: string, patch: { baselineValue?: number | null; targetValue?: number | null }, opts: { companyId?: string; actorUserId: string; now?: number }): KpiTargetsConfig`
- `clearKpiTarget(agencyId: string, kpiId: string, opts: { companyId?: string; actorUserId: string; now?: number }): KpiTargetsConfig`

## Depends on (5)

- [`src/lib/performance/kpiRegistry.ts`](../../performance/kpiRegistry.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/agencySettings.ts`](../../../server/agencySettings.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`scripts/smoke-kpi-targets.test.ts`](../../../../scripts/smoke-kpi-targets.test.md)
- [`src/app/api/portal/kpi-registry/targets/route.ts`](../../../app/api/portal/kpi-registry/targets/route.md)

