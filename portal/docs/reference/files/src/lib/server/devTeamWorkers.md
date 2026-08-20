# `src/lib/server/devTeamWorkers.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `interface WorkerCheckIn (5 members)`
- `interface ActiveFile (3 members)`
- `interface WorkerSignals (4 members)`
- `areaFor(relPath: string): string`
- `async readCheckIns(): Promise<WorkerCheckIn[]>`
- `async scanWorkerSignals(windowMs = 2 * 60 * 60 * 1000, now = Date.now()): Promise<WorkerSignals>`
- `interface AreaActivity (4 members)`
- `groupActivity(files: ActiveFile[]): AreaActivity[]`

## Depends on (1)

- [`src/lib/server/devDocs.ts`](./devDocs.md)

## Used by (4)

- [`src/app/api/portal/dev-team/workers/route.ts`](../../app/api/portal/dev-team/workers/route.md)
- [`src/app/portal/dev-team/logs/page.tsx`](../../app/portal/dev-team/logs/page.md)
- [`src/lib/server/devConsoleStatus.ts`](./devConsoleStatus.md)
- [`src/lib/server/devTeamTasks.ts`](./devTeamTasks.md)

