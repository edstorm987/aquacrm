# `src/server/developmentToolkit.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (16)

- `interface DevelopmentResourceInput (15 members)`
- `interface DevelopmentWorkflowInput (5 members)`
- `listDevelopmentResources(agencyId: string): DevelopmentResource[]`
- `getDevelopmentResource(agencyId: string, resourceId: string): DevelopmentResource | null`
- `listVisibleDevelopmentResources(agencyId: string, userId: string, role: Role): DevelopmentResource[]`
- `createDevelopmentResource(agencyId: string, input: DevelopmentResourceInput, actorUserId: string): DevelopmentResource`
- `updateDevelopmentResource(agencyId: string, resourceId: string, input: DevelopmentResourceInput, actorUserId: string): DevelopmentResource | null`
- `deleteDevelopmentResource(agencyId: string, resourceId: string): DevelopmentResource | null`
- `revealDevelopmentPassword(agencyId: string, resourceId: string, role: Role): string | null`
- `listDevelopmentWorkflows(agencyId: string): DevelopmentWorkflow[]`
- `ensureDefaultDevelopmentWorkflow(agencyId: string, actorUserId: string): DevelopmentWorkflow`
- `createDevelopmentWorkflow(agencyId: string, input: DevelopmentWorkflowInput, actorUserId: string): DevelopmentWorkflow`
- `updateDevelopmentWorkflow(agencyId: string, workflowId: string, input: DevelopmentWorkflowInput): DevelopmentWorkflow | null`
- `deleteDevelopmentWorkflow(agencyId: string, workflowId: string): boolean`
- `developmentStageRef(workflowId: string, stageId: string): string`
- `publicDevelopmentResource(resource: DevelopmentResource)`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (6)

- [`src/app/api/portal/development/content/route.ts`](../app/api/portal/development/content/route.md)
- [`src/app/api/portal/development/route.ts`](../app/api/portal/development/route.md)
- [`src/app/api/portal/development/upload/route.ts`](../app/api/portal/development/upload/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/portal/agency/development/_loadDevelopmentData.ts`](../app/portal/agency/development/_loadDevelopmentData.md)
- [`src/app/portal/agency/development/page.tsx`](../app/portal/agency/development/page.md)

