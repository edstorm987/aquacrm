# `src/engines/editor/server/devProjects.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (18)

- `normalizeRepository(value: string | undefined): string`
- `normalizeProjectSiteUrl(value: string | undefined): string`
- `listDevProjects(agencyId: string): DevProject[]`
- `getDevProject(agencyId: string, id: string): DevProject | null`
- `listDevProjectsForClient(agencyId: string, clientId: string): DevProject[]`
- `listDevProjectChildren(agencyId: string, id: string): DevProject[]`
- `interface SaveDevProjectInput (15 members)`
- `saveDevProject(input: SaveDevProjectInput): DevProject`
- `devProjectDeleteRefusal(agencyId: string, id: string): string | null`
- `deleteDevProject(agencyId: string, id: string, actorUserId: string): DevProject | null`
- `devProjectGitHubToken(agencyId: string, project: DevProject): string | null`
- `devProjectVisualEditorUnlocked(project: DevProject): boolean`
- `devProjectTagState(project: DevProject): DevProjectTagState`
- `devProjectTagSentence(project: DevProject): string`
- `devProjectMapStatus(project: DevProject): DevProjectMapStatus`
- `aquaTagIdFromCheck(tag: DevProjectTagMap | undefined, existing: string | undefined): string | undefined`
- `recordDevProjectMap(input: { agencyId: string; id: string; map: DevProjectMap; actorUserId: string; }): DevProject | null`
- `recordDevProjectTagCheck(input: { agencyId: string; id: string; tag: DevProjectTagMap; actorUserId: string; now?: number; }): DevProject | null`

## Depends on (4)

- [`src/lib/server/integrations/integrationConnections.ts`](../../../lib/server/integrations/integrationConnections.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (25)

- [`scripts/smoke-aqua-editor-ai-history.test.ts`](../../../../scripts/smoke-aqua-editor-ai-history.test.md)
- [`scripts/smoke-aqua-editor-ai-reply.test.ts`](../../../../scripts/smoke-aqua-editor-ai-reply.test.md)
- [`scripts/smoke-aqua-editor-ai-token.test.ts`](../../../../scripts/smoke-aqua-editor-ai-token.test.md)
- [`scripts/smoke-dev-editor-aqua-tag.test.ts`](../../../../scripts/smoke-dev-editor-aqua-tag.test.md)
- [`scripts/smoke-dev-project-map.test.ts`](../../../../scripts/smoke-dev-project-map.test.md)
- [`scripts/smoke-dev-project-nesting.test.ts`](../../../../scripts/smoke-dev-project-nesting.test.md)
- [`scripts/smoke-editor-words-publish.test.ts`](../../../../scripts/smoke-editor-words-publish.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-file-finding-skill.test.ts`](../../../../scripts/smoke-file-finding-skill.test.md)
- [`scripts/smoke-librarian.test.ts`](../../../../scripts/smoke-librarian.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/dev/lifecycle/route.ts`](../../../app/api/portal/dev/lifecycle/route.md)
- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../../../app/api/portal/dev/repo-write/route.md)
- [`src/app/api/portal/dev/source-edit/route.ts`](../../../app/api/portal/dev/source-edit/route.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/dev-team/editor/studio/page.tsx`](../../../app/portal/dev-team/editor/studio/page.md)
- [`src/engines/editor/server/editorAi.ts`](./editorAi.md)
- [`src/engines/editor/server/editorAiHistory.ts`](./editorAiHistory.md)
- [`src/engines/editor/server/editorAiReply.ts`](./editorAiReply.md)
- [`src/engines/editor/server/editorAssistant.ts`](./editorAssistant.md)
- [`src/engines/editor/server/mapProject.ts`](./mapProject.md)
- [`src/engines/editor/server/sourceEdit.ts`](./sourceEdit.md)
- [`src/lib/server/dev/fileFinding.ts`](../../../lib/server/dev/fileFinding.md)

