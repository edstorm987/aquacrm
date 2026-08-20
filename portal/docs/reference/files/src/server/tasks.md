# `src/server/tasks.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (11)

- `interface CreateAgencyTaskInput (20 members)`
- `listAgencyTasks(agencyId: string): AgencyTask[]`
- `createAgencyTask(input: CreateAgencyTaskInput): AgencyTask`
- `updateAgencyTask(agencyId: string, id: string, patch: Partial<Pick<AgencyTask, "title" | "notes" | "status" | "priority" | "startAt" | "dueAt" | "reminderAt" | "recurrence" | "assigneeUserId" | "clientId" | "sopIds">>, actorUserId: string)…`
- `reconcileAgencyTasksWithRadar(agencyId: string, radar: BusinessIssueRadar, now = Date.now()): AgencyTask[]`
- `deleteAgencyTask(agencyId: string, id: string): boolean`
- `interface AddChecklistItemInput (4 members)`
- `addTaskChecklistItem(agencyId: string, taskId: string, input: AddChecklistItemInput, now = Date.now()): AgencyTask | null`
- `setTaskChecklistItemDone(agencyId: string, taskId: string, itemId: string, done: boolean, actor?: string, now = Date.now()): AgencyTask | null`
- `removeTaskChecklistItem(agencyId: string, taskId: string, itemId: string, now = Date.now()): AgencyTask | null`
- `checklistProgress(task: AgencyTask): { total: number; done: number; next?: AgencyTaskChecklistItem }`

## Depends on (5)

- [`src/lib/radar/businessRadar.ts`](../lib/radar/businessRadar.md)
- [`src/lib/tasks/taskTemplates.ts`](../lib/tasks/taskTemplates.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (22)

- [`src/app/api/assistant/route.ts`](../app/api/assistant/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/portal/tasks/checklist/route.ts`](../app/api/portal/tasks/checklist/route.md)
- [`src/app/api/portal/tasks/route.ts`](../app/api/portal/tasks/route.md)
- [`src/app/api/tenants/client-operation-task/route.ts`](../app/api/tenants/client-operation-task/route.md)
- [`src/app/api/tenants/client-operations/route.ts`](../app/api/tenants/client-operations/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/team/_data.ts`](../app/portal/team/_data.md)
- [`src/lib/server/assistants/advisorContext.ts`](../lib/server/assistants/advisorContext.md)
- [`src/lib/server/assistants/externalAssistantProposals.ts`](../lib/server/assistants/externalAssistantProposals.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/kpi/companyHealthSnapshot.ts`](../lib/server/kpi/companyHealthSnapshot.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../lib/server/radar/businessIssueRadar.md)
- [`src/lib/server/radar/radarSourceInspection.ts`](../lib/server/radar/radarSourceInspection.md)
- [`src/lib/server/radar/radarSweeps.ts`](../lib/server/radar/radarSweeps.md)
- [`src/lib/server/resolutionPlans.ts`](../lib/server/resolutionPlans.md)
- [`src/server/automations.ts`](./automations.md)
- [`src/server/people.ts`](./people.md)
- [`src/server/taskTemplates.ts`](./taskTemplates.md)

