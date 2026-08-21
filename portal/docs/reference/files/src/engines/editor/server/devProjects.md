# `src/engines/editor/server/devProjects.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (9)

- `normalizeRepository(value: string | undefined): string`
- `listDevProjects(agencyId: string): DevProject[]`
- `getDevProject(agencyId: string, id: string): DevProject | null`
- `listDevProjectsForClient(agencyId: string, clientId: string): DevProject[]`
- `interface SaveDevProjectInput (13 members)`
- `saveDevProject(input: SaveDevProjectInput): DevProject`
- `deleteDevProject(agencyId: string, id: string, actorUserId: string): DevProject | null`
- `devProjectGitHubToken(agencyId: string, project: DevProject): string | null`
- `devProjectVisualEditorUnlocked(project: DevProject): boolean`

## Depends on (4)

- [`src/lib/server/integrations/integrationConnections.ts`](../../../lib/server/integrations/integrationConnections.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (3)

- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/dev-team/editor/studio/page.tsx`](../../../app/portal/dev-team/editor/studio/page.md)

