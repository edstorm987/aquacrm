# `src/server/customAIs.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface SaveCustomAIInput (9 members)`
- `listCustomAIs(agencyId: string): CustomAIRecord[]`
- `createCustomAI(agencyId: string, input: SaveCustomAIInput, actorUserId: string): CustomAIRecord`
- `updateCustomAI(agencyId: string, recordId: string, input: SaveCustomAIInput, actorUserId: string): CustomAIRecord | null`
- `deleteCustomAI(agencyId: string, recordId: string, actorUserId: string): boolean`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (3)

- [`scripts/smoke-automation-control.test.ts`](../../scripts/smoke-automation-control.test.md)
- [`src/app/api/portal/custom-ais/route.ts`](../app/api/portal/custom-ais/route.md)
- [`src/app/portal/agency/automations/_automationWorkspaceData.ts`](../app/portal/agency/automations/_automationWorkspaceData.md)

