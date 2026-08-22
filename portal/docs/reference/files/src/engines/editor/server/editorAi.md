# `src/engines/editor/server/editorAi.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (14)

- `EDITOR_AI_PROVIDER`
- `EDITOR_AI_DEFAULT_MODEL`
- `getEditorAiConfig(agencyId: string, projectId: string): EditorAiConfig | null`
- `interface SaveEditorAiConfigInput (7 members)`
- `saveEditorAiConfig(input: SaveEditorAiConfigInput): EditorAiStatus`
- `interface SetEditorAiTokenInput (8 members)`
- `setEditorAiToken(input: SetEditorAiTokenInput): EditorAiStatus`
- `clearEditorAiToken(input: { agencyId: string; projectId: string; actorUserId: string; actorEmail?: string; now?: number; }): EditorAiStatus`
- `forgetEditorAiForProject(input: { agencyId: string; projectId: string; actorUserId: string; actorEmail?: string; }): void`
- `resolveEditorAiToken(agencyId: string, projectId: string): string | null`
- `editorAiConfigured(agencyId: string, projectId: string): boolean`
- `editorAiModel(agencyId: string, projectId: string): string`
- `editorAiStatus(agencyId: string, projectId: string): EditorAiStatus`
- `editorAiReason(agencyId: string, projectId: string): string`

## Depends on (5)

- [`src/engines/editor/server/devProjects.ts`](./devProjects.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../../../lib/server/integrations/integrationConnections.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (6)

- [`scripts/smoke-aqua-editor-ai-reply.test.ts`](../../../../scripts/smoke-aqua-editor-ai-reply.test.md)
- [`scripts/smoke-aqua-editor-ai-token.test.ts`](../../../../scripts/smoke-aqua-editor-ai-token.test.md)
- [`src/app/api/portal/dev/editor-ai/route.ts`](../../../app/api/portal/dev/editor-ai/route.md)
- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)
- [`src/engines/editor/server/editorAiReply.ts`](./editorAiReply.md)
- [`src/engines/editor/server/editorAssistant.ts`](./editorAssistant.md)

