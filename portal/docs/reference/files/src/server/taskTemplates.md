# `src/server/taskTemplates.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (9)

- `interface TaskTemplateView (10 members)`
- `listTaskTemplates(agencyId: string): TaskTemplateView[]`
- `findTaskTemplate(agencyId: string, id: string): TaskTemplateView | undefined`
- `interface SaveTaskTemplateInput (8 members)`
- `saveTaskTemplate(agencyId: string, input: SaveTaskTemplateInput, createdBy: string, now = Date.now()): AgencyTaskTemplate | null`
- `deleteTaskTemplate(agencyId: string, id: string): boolean`
- `interface ApplyTaskTemplateInput (8 members)`
- `createTaskFromTemplate(input: ApplyTaskTemplateInput, now = Date.now()): AgencyTask | null`
- `saveTaskAsTemplate(agencyId: string, taskId: string, name: string, createdBy: string, now = Date.now()): AgencyTaskTemplate | null`

## Depends on (4)

- [`src/lib/tasks/taskTemplates.ts`](../lib/tasks/taskTemplates.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tasks.ts`](./tasks.md)
- [`src/server/types.ts`](./types.md)

## Used by (1)

- [`src/app/api/portal/tasks/templates/route.ts`](../app/api/portal/tasks/templates/route.md)

