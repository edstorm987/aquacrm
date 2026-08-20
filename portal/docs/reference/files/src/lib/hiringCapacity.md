# `src/lib/performance/hiringCapacity.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (12)

- `type HiringCapacityState`
- `type HiringCapacityConfidence`
- `interface HiringCapacitySignals (7 members)`
- `interface HiringCapacityActuals (11 members)`
- `interface HiringCapacityAreaAnalysis (24 members)`
- `interface HiringCapacityAnalysis (8 members)`
- `HIRING_CAPACITY_AREA_META: ReadonlyArray<{ id: CompanyCapacityAreaId; label: string; demandBasis: string }>`
- `defaultCapacityAreas(): CompanyCapacityAreaPlan[]`
- `emptyHiringCapacitySignals(): HiringCapacitySignals`
- `buildHiringCapacitySignals(input: { tasks?: Array<{ title: string; notes?: string; sourceHref?: string; status?: string; priority?: string; dueAt?: number }>; people?: Array<{ title: string; department?: string; weeklyHours?: number; statu…`
- `buildHiringCapacityAnalysis(input: { capacity: CompanyCapacityPlan; actuals: HiringCapacityActuals; signals?: HiringCapacitySignals; }): HiringCapacityAnalysis`
- `classifyCapacityArea(value: string): CompanyCapacityAreaId`

## Depends on (1)

- [`src/server/types.ts`](../server/types.md)

## Used by (5)

- [`scripts/hiring-capacity.test.ts`](../../scripts/hiring-capacity.test.md)
- [`src/app/portal/agency/_BattleTableWorkspace.tsx`](../app/portal/agency/_BattleTableWorkspace.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/lib/server/radar/radarObservations.ts`](./server/radarObservations.md)
- [`src/server/company.ts`](../server/company.md)

