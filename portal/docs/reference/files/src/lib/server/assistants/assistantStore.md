# `src/lib/server/assistants/assistantStore.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `getAssistantWorkspace(agencyId: string, userId: string): AssistantWorkspaceState`
- `createAssistantThread(agencyId: string, userId: string, title = "New conversation"): AssistantThread`
- `getAssistantThread(agencyId: string, userId: string, threadId: string): AssistantThread | null`
- `appendAssistantMessage(agencyId: string, userId: string, threadId: string, role: AssistantMessage["role"], content: string, skillId?: string): AssistantMessage`
- `deleteAssistantThread(agencyId: string, userId: string, threadId: string)`
- `renameAssistantThread(agencyId: string, userId: string, threadId: string, title: string)`
- `addAssistantMemory(agencyId: string, userId: string, content: string, sourceThreadId?: string): AssistantMemory`
- `deleteAssistantMemory(agencyId: string, userId: string, memoryId: string)`

## Depends on (2)

- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (6)

- [`src/app/api/assistant/route.ts`](../../../app/api/assistant/route.md)
- [`src/app/portal/agency/assistant/page.tsx`](../../../app/portal/agency/assistant/page.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)
- [`src/components/chrome/AdvisorDrawerControl.tsx`](../../../components/chrome/AdvisorDrawerControl.md)
- [`src/components/chrome/LibrarianDrawerControl.tsx`](../../../components/chrome/LibrarianDrawerControl.md)
- [`src/engines/editor/server/editorAssistant.ts`](../../../engines/editor/server/editorAssistant.md)

