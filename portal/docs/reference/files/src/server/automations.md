# `src/server/automations.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (17)

- `interface SaveAutomationWorkflowInput (6 members)`
- `validateAutomationGraph(workflow: Pick<AutomationWorkflow, "nodes" | "edges">): string[]`
- `listAutomationFolders(agencyId: string): AutomationFolder[]`
- `getAutomationFolder(agencyId: string, folderId: string): AutomationFolder | null`
- `createAutomationFolder(agencyId: string, input: { name?: string; description?: string; color?: string }, actorUserId: string): AutomationFolder`
- `updateAutomationFolder(agencyId: string, folderId: string, input: { name?: string; description?: string; color?: string }, actorUserId: string): AutomationFolder | null`
- `deleteAutomationFolder(agencyId: string, folderId: string, actorUserId: string): boolean`
- `listAutomationWorkflows(agencyId: string): AutomationWorkflow[]`
- `getAutomationWorkflow(agencyId: string, workflowId: string): AutomationWorkflow | null`
- `listAutomationRuns(agencyId: string, workflowId?: string, limit = 100): AutomationRun[]`
- `createAutomationWorkflow(agencyId: string, input: SaveAutomationWorkflowInput, actorUserId: string): AutomationWorkflow`
- `updateAutomationWorkflow(agencyId: string, workflowId: string, input: SaveAutomationWorkflowInput, actorUserId: string): AutomationWorkflow | null`
- `duplicateAutomationWorkflow(agencyId: string, workflowId: string, actorUserId: string): AutomationWorkflow | null`
- `deleteAutomationWorkflow(agencyId: string, workflowId: string, actorUserId: string): boolean`
- `async triggerAutomations(agencyId: string, triggerType: string, eventData: Record<string, unknown> = {}, options: { mode?: "live" | "test"; workflowId?: string; initiatedBy?: string } = {}): Promise<AutomationRun[]>`
- `async runAutomationWorkflow(agencyId: string, workflowId: string, mode: "live" | "test", initiatedBy: string, eventData: Record<string, unknown> = {}): Promise<AutomationRun>`
- `async processAutomationSweep(agencyId?: string): Promise<{ resumed: number; scheduled: number; failed: number }>`

## Depends on (8)

- [`src/lib/server/email/transactionalEmail.ts`](../lib/server/email/transactionalEmail.md)
- [`src/lib/server/websiteEnquiries.ts`](../lib/server/websiteEnquiries.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tasks.ts`](./tasks.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)
- [`src/server/users.ts`](./users.md)

## Used by (8)

- [`scripts/smoke-automation-control.test.ts`](../../scripts/smoke-automation-control.test.md)
- [`src/app/api/internal/sweep/route.ts`](../app/api/internal/sweep/route.md)
- [`src/app/api/portal/automations/route.ts`](../app/api/portal/automations/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../app/api/public/brand-enquiry/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../app/api/tenants/client-requests/route.md)
- [`src/app/portal/agency/automations/_automationWorkspaceData.ts`](../app/portal/agency/automations/_automationWorkspaceData.md)
- [`src/app/portal/agency/marketing/page.tsx`](../app/portal/agency/marketing/page.md)
- [`src/lib/server/inbox/inboxService.ts`](../lib/server/inbox/inboxService.md)

