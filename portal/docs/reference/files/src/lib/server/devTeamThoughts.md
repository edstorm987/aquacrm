# `src/lib/server/dev/devTeamThoughts.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface Thought (9 members)`
- `async addThought(input: { text: string; author: string; taskId?: string; planName?: string; worker?: string; }): Promise<Thought>`
- `async listThoughts(limit = 100): Promise<Thought[]>`
- `async thoughtsByTask(): Promise<Record<string, Thought[]>>`
- `async unreadFor(worker: string): Promise<Thought[]>`
- `async acknowledge(ids: string[], worker: string): Promise<number>`
- `async unacknowledgedCount(): Promise<number>`

## Depends on (1)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)

## Used by (3)

- [`src/app/api/portal/dev-team/thoughts/route.ts`](../../app/api/portal/dev-team/thoughts/route.md)
- [`src/app/portal/dev-team/tasks/_TasksWorkspace.tsx`](../../app/portal/dev-team/tasks/_TasksWorkspace.md)
- [`src/app/portal/dev-team/tasks/page.tsx`](../../app/portal/dev-team/tasks/page.md)

