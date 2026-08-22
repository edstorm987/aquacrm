# `src/engines/editor/server/editorAiHistory.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (11)

- `EDITOR_AI_HISTORY_LIMITS`
- `getEditorAiConversation(agencyId: string, projectId: string): EditorAiConversation | null`
- `getEditorAiThread(agencyId: string, projectId: string, threadId: string): EditorAiThread | null`
- `interface StartEditorAiThreadInput (5 members)`
- `startEditorAiThread(input: StartEditorAiThreadInput): EditorAiThread`
- `interface AppendEditorAiMessageInput (8 members)`
- `appendEditorAiMessage(input: AppendEditorAiMessageInput): { message: EditorAiMessage; threadId: string; conversation: EditorAiConversation; }`
- `renameEditorAiThread(input: { agencyId: string; projectId: string; threadId: string; title: string; now?: number; }): EditorAiConversation`
- `deleteEditorAiThread(input: { agencyId: string; projectId: string; threadId: string; now?: number; }): EditorAiConversation`
- `clearEditorAiHistory(input: { agencyId: string; projectId: string; now?: number; }): EditorAiConversation`
- `forgetEditorAiHistoryForProject(input: { agencyId: string; projectId: string; }): void`

## Depends on (3)

- [`src/engines/editor/server/devProjects.ts`](./devProjects.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (8)

- [`scripts/smoke-aqua-editor-ai-history.test.ts`](../../../../scripts/smoke-aqua-editor-ai-history.test.md)
- [`scripts/smoke-aqua-editor-ai-reply.test.ts`](../../../../scripts/smoke-aqua-editor-ai-reply.test.md)
- [`scripts/smoke-dev-project-nesting.test.ts`](../../../../scripts/smoke-dev-project-nesting.test.md)
- [`src/app/api/portal/dev/editor-ai/history/route.ts`](../../../app/api/portal/dev/editor-ai/history/route.md)
- [`src/app/api/portal/dev/editor-ai/reply/route.ts`](../../../app/api/portal/dev/editor-ai/reply/route.md)
- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)
- [`src/engines/editor/server/editorAiReply.ts`](./editorAiReply.md)
- [`src/engines/editor/server/editorAssistant.ts`](./editorAssistant.md)

