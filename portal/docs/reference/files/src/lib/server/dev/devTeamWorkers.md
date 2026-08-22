# `src/lib/server/dev/devTeamWorkers.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (11)

- `ACTIVE_CHECK_IN_WINDOW_MS`
- `interface WorkerCheckIn (5 members)`
- `interface ActiveFile (3 members)`
- `interface WorkerSignals (5 members)`
- `areaFor(relPath: string): string`
- `async readCheckIns(): Promise<WorkerCheckIn[]>`
- `isCheckInActive(checkIn: WorkerCheckIn, now = Date.now()): boolean`
- `async readActiveCheckIns(now = Date.now()): Promise<WorkerCheckIn[]>`
- `async scanWorkerSignals(windowMs = 2 * 60 * 60 * 1000, now = Date.now(), opts: { fresh?: boolean } = {}): Promise<WorkerSignals>`
- `interface AreaActivity (4 members)`
- `groupActivity(files: ActiveFile[]): AreaActivity[]`

## Depends on (1)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)

## Used by (11)

- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/dev-team/console/route.ts`](../../../app/api/portal/dev-team/console/route.md)
- [`src/app/api/portal/dev-team/workers/route.ts`](../../../app/api/portal/dev-team/workers/route.md)
- [`src/app/api/portal/dev/editor-activity/route.ts`](../../../app/api/portal/dev/editor-activity/route.md)
- [`src/app/portal/agency/_DevTeamStation.tsx`](../../../app/portal/agency/_DevTeamStation.md)
- [`src/app/portal/dev-team/logs/_Section.tsx`](../../../app/portal/dev-team/logs/_Section.md)
- [`src/app/portal/dev-team/page.tsx`](../../../app/portal/dev-team/page.md)
- [`src/engines/editor/server/workLifecycle.ts`](../../../engines/editor/server/workLifecycle.md)
- [`src/lib/server/dev/devConsoleStatus.ts`](./devConsoleStatus.md)
- [`src/lib/server/dev/devTeamRoadmap.ts`](./devTeamRoadmap.md)
- [`src/lib/server/dev/devTeamTasks.ts`](./devTeamTasks.md)

