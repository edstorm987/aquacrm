# `src/lib/server/kpi/customKpis.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `listCustomKpis(agencyId: string): CustomKpiDefinition[]`
- `interface CreateCustomKpiInput (6 members)`
- `createCustomKpi(agencyId: string, input: CreateCustomKpiInput, opts: { actorUserId: string; now?: number }): CustomKpiDefinition`
- `deleteCustomKpi(agencyId: string, id: string, opts: { actorUserId: string }): CustomKpiDefinition[]`

## Depends on (3)

- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`scripts/smoke-kpi-targets.test.ts`](../../../../scripts/smoke-kpi-targets.test.md)
- [`src/app/api/portal/kpi-registry/custom/route.ts`](../../../app/api/portal/kpi-registry/custom/route.md)

