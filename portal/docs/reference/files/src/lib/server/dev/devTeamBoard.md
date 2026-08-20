# `src/lib/server/dev/devTeamBoard.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (14)

- `type StatusKind`
- `type WorkerStatusKind`
- `interface DevTeamWorker (11 members)`
- `interface ParsedPlanStatus (3 members)`
- `interface PlanStatus (3 members)`
- `interface DevTeamBoard (4 members)`
- `interface BoardItem (6 members)`
- `interface BoardLanes (4 members)`
- `parseWorkers(markdown: string): DevTeamWorker[]`
- `async scanWorkers(): Promise<DevTeamWorker[]>`
- `parsePlanStatus(markdown: string): ParsedPlanStatus | null`
- `async scanPlanStatuses(): Promise<PlanStatus[]>`
- `async scanDevTeamBoard(): Promise<DevTeamBoard>`
- `composeLanes(board: DevTeamBoard): BoardLanes`

## Depends on (1)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)

## Used by (5)

- [`scripts/smoke-dev-team-board-status.test.ts`](../../../../scripts/smoke-dev-team-board-status.test.md)
- [`src/app/portal/agency/_DevTeamStation.tsx`](../../../app/portal/agency/_DevTeamStation.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)
- [`src/app/portal/dev-team/working/_Board.tsx`](../../../app/portal/dev-team/working/_Board.md)
- [`src/lib/server/dev/devTeamRoadmap.ts`](./devTeamRoadmap.md)

