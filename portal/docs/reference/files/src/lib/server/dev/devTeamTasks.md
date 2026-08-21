# `src/lib/server/dev/devTeamTasks.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `type TaskState`
- `interface DevTask (9 members)`
- `interface PlanTasks (7 members)`
- `type PhaseMarker`
- `interface ParsedPhase (4 members)`
- `parsePhases(md: string): ParsedPhase[]`
- `async scanTasks(opts: { onlyActive?: boolean } = {}): Promise<PlanTasks[]>`

## Depends on (3)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/dev/devMarkdownCache.ts`](./devMarkdownCache.md)
- [`src/lib/server/dev/devTeamWorkers.ts`](./devTeamWorkers.md)

## Used by (3)

- [`src/app/portal/dev-team/roadmap/page.tsx`](../../../app/portal/dev-team/roadmap/page.md)
- [`src/app/portal/dev-team/tasks/_TasksWorkspace.tsx`](../../../app/portal/dev-team/tasks/_TasksWorkspace.md)
- [`src/lib/server/dev/devTeamRoadmap.ts`](./devTeamRoadmap.md)

