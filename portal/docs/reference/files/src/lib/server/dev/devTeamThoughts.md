# `src/lib/server/dev/devTeamThoughts.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (11)

- `interface Thought (8 members)`
- `class ThoughtLedgerUnreadableError`
    - `constructor(public readonly file: string)`
- `readersOf(t: Thought): string[]`
- `isRead(t: Thought): boolean`
- `async addThought(input: { text: string; author: string; taskId?: string; planName?: string; worker?: string; }): Promise<Thought>`
- `async listThoughts(limit = 100): Promise<Thought[]>`
- `async thoughtsByTask(): Promise<Record<string, Thought[]>>`
- `async unreadFor(worker: string): Promise<Thought[]>`
- `async acknowledge(ids: string[], worker: string): Promise<number>`
- `async unacknowledgedCount(): Promise<number>`
- `async ledgerPressure(): Promise<{ rows: number; unread: number; max: number; full: boolean }>`

## Depends on (1)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)

## Used by (6)

- [`scripts/smoke-dev-tasks-view.test.ts`](../../../../scripts/smoke-dev-tasks-view.test.md)
- [`src/app/api/portal/dev-team/thoughts/route.ts`](../../../app/api/portal/dev-team/thoughts/route.md)
- [`src/app/portal/dev-team/page.tsx`](../../../app/portal/dev-team/page.md)
- [`src/app/portal/dev-team/roadmap/page.tsx`](../../../app/portal/dev-team/roadmap/page.md)
- [`src/app/portal/dev-team/tasks/_TasksWorkspace.tsx`](../../../app/portal/dev-team/tasks/_TasksWorkspace.md)
- [`src/app/portal/dev-team/tasks/_thoughtMerge.ts`](../../../app/portal/dev-team/tasks/_thoughtMerge.md)

