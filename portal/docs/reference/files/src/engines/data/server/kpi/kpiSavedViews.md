# `src/engines/data/server/kpi/kpiSavedViews.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (4)

- `interface SaveSharedKpiViewInput (6 members)`
- `listSharedKpiViews(agencyId: string): SharedKpiComparisonView[]`
- `saveSharedKpiView(agencyId: string, input: SaveSharedKpiViewInput, opts: { actorUserId: string; now?: number }): SharedKpiComparisonView`
- `deleteSharedKpiView(agencyId: string, id: string, opts: { actorUserId: string }): SharedKpiComparisonView[]`

## Depends on (4)

- [`src/server/activity.ts`](../../../../server/activity.md)
- [`src/server/agencySettings.ts`](../../../../server/agencySettings.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (2)

- [`scripts/smoke-kpi-shared-views.test.ts`](../../../../../scripts/smoke-kpi-shared-views.test.md)
- [`src/app/api/portal/kpi-registry/views/route.ts`](../../../../app/api/portal/kpi-registry/views/route.md)

