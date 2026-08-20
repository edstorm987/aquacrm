# `src/lib/server/devTeamTasks.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `type TaskState`
- `interface DevTask (9 members)`
- `interface PlanTasks (7 members)`
- `parsePhases(md: string): { number: string; title: string; detail?: string }[]`
- `async scanTasks(opts: { onlyActive?: boolean } = {}): Promise<PlanTasks[]>`

## Depends on (2)

- [`src/lib/server/devDocs.ts`](./devDocs.md)
- [`src/lib/server/devTeamWorkers.ts`](./devTeamWorkers.md)

## Used by (2)

- [`src/app/portal/dev-team/tasks/_TasksWorkspace.tsx`](../../app/portal/dev-team/tasks/_TasksWorkspace.md)
- [`src/app/portal/dev-team/tasks/page.tsx`](../../app/portal/dev-team/tasks/page.md)

