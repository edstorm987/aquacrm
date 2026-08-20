# `src/server/performanceExperiments.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface PerformanceExperimentInput (7 members)`
- `listPerformanceExperiments(agencyId: string, clientId?: string): PerformanceExperiment[]`
- `createPerformanceExperiment(agencyId: string, input: PerformanceExperimentInput, actorUserId: string): PerformanceExperiment`
- `updatePerformanceExperiment(agencyId: string, id: string, patch: Partial<PerformanceExperimentInput>, actorUserId: string): PerformanceExperiment | null`
- `deletePerformanceExperiment(agencyId: string, id: string): boolean`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (3)

- [`src/app/api/portal/performance/experiments/route.ts`](../app/api/portal/performance/experiments/route.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)

