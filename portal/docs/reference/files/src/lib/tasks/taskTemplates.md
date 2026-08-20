# `src/lib/tasks/taskTemplates.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (11)

- `interface TaskTemplateStep (4 members)`
- `interface TaskTemplateShape (6 members)`
- `type TaskTemplateCategory`
- `interface BuiltInTaskTemplate (2 members)`
- `TEMPLATE_FOR_FAMILY: Array<[string, string]>`
- `CLAIMABLE_FAMILIES: Array<{ prefix: string; label: string }>`
- `builtInTemplateForSource(sourceId: string): BuiltInTaskTemplate | undefined`
- `SUBJECT_TOKEN`
- `fillTemplateTitle(taskTitle: string, subject?: string): string`
- `BUILT_IN_TASK_TEMPLATES: BuiltInTaskTemplate[]`
- `builtInTemplate(id: string): BuiltInTaskTemplate | undefined`

## Depends on (2)

- [`src/lib/inbox/resolutionContext.ts`](../inbox/resolutionContext.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`scripts/smoke-task-templates.test.ts`](../../../scripts/smoke-task-templates.test.md)
- [`src/components/attention/TaskTemplates.tsx`](../../components/attention/TaskTemplates.md)
- [`src/server/taskTemplates.ts`](../../server/taskTemplates.md)
- [`src/server/tasks.ts`](../../server/tasks.md)

