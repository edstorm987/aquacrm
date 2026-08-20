# `src/server/completedActions.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface RecordCompletedActionInput (7 members)`
- `recordCompletedAction(agencyId: string, input: RecordCompletedActionInput, now = Date.now()): CompletedAction`
- `listCompletedActions(agencyId: string, limit = 200): CompletedAction[]`
- `completionsFor(agencyId: string, sourceId: string): CompletedAction[]`
- `deleteCompletedAction(agencyId: string, id: string): boolean`

## Depends on (3)

- [`src/server/eventBus.ts`](./eventBus.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (4)

- [`src/app/api/portal/attention/completed/route.ts`](../app/api/portal/attention/completed/route.md)
- [`src/app/api/portal/notifications/route.ts`](../app/api/portal/notifications/route.md)
- [`src/app/api/portal/tasks/route.ts`](../app/api/portal/tasks/route.md)
- [`src/lib/server/resolutionPlans.ts`](../lib/server/resolutionPlans.md)

