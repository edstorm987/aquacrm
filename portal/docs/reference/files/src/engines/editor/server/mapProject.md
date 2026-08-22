# `src/engines/editor/server/mapProject.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (5)

- `interface MapDevProjectDeps (6 members)`
- `interface MapDevProjectInput (4 members)`
- `async mapProjectRepository(input: MapDevProjectInput, deps: MapDevProjectDeps = {}): Promise<DevProjectRepoMap>`
- `async mapProjectAquaTag(input: MapDevProjectInput, deps: MapDevProjectDeps = {}): Promise<DevProjectTagMap | undefined>`
- `async mapDevProject(input: MapDevProjectInput, deps: MapDevProjectDeps = {}): Promise<DevProjectMap>`

## Depends on (8)

- [`src/engines/editor/server/devProjects.ts`](./devProjects.md)
- [`src/engines/editor/server/fileTree.ts`](./fileTree.md)
- [`src/engines/editor/server/githubSource.ts`](./githubSource.md)
- [`src/engines/editor/server/registry.ts`](./registry.md)
- [`src/engines/editor/server/workspaceFiles.ts`](./workspaceFiles.md)
- [`src/lib/server/integrations/aquaTagDetection.ts`](../../../lib/server/integrations/aquaTagDetection.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../../../lib/server/integrations/integrationConnections.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (3)

- [`scripts/smoke-dev-editor-aqua-tag.test.ts`](../../../../scripts/smoke-dev-editor-aqua-tag.test.md)
- [`scripts/smoke-dev-project-map.test.ts`](../../../../scripts/smoke-dev-project-map.test.md)
- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)

