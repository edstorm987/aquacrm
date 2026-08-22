# `src/components/editing/editorAiClient.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** ─── AQUA EDITOR AI — the browser's side of its two endpoints ────────────────  One module, so the panel never writes a `fetch` by hand and the two routes are described in exactly one place.  ── Both endpoints are POST-only, including for reading ──────────────────────  `/api/portal/dev/editor-ai` handles a SECRET and exports no GET at all; `/api/portal/dev/editor-ai/history` follows the same shape so the family has one gate. Reading is `action: "status"` / `action: "read"`. Nothing here may put a project id or a key in a URL — a URL is the thing that gets logged, cached, prefetched and pasted into a bug report.  ── What may cross, in each direction ────────────────────────────────────────  OUT: `apiKey` is write-only. It appears in exactly one call (`setToken`), goes straight into a request body, and is never stored in this module, never put in a query string, and never logged. IN:  `EditorAiStatus` — configured / model / `••••abcd` / brief. There is no field on it a key could occupy, so a leak would be a type error rather than an oversight.  ── The tenant check is not here, and must not be ────────────────────────────  Every one of these calls names a `projectId`, and the SERVER decides whether the caller may see it: both routes resolve through `getDevProject(session.agencyId, id)` before touching a store, and answer a foreign id exactly as they answer an invented one. Nothing the browser sends can widen that, which is why the panel is free to ask for a project by id.

## Exports (19)

- `EDITOR_AI_ENDPOINT`
- `EDITOR_AI_HISTORY_ENDPOINT`
- `EDITOR_AI_REPLY_ENDPOINT`
- `interface EditorAiHistoryLimits (4 members)`
- `type EditorAiReplyFailureCode`
- `type EditorAiReplyResult`
- `interface EditorAiConfigResult (3 members)`
- `interface EditorAiHistoryResult (4 members)`
- `async readEditorAiStatus(projectId: string): Promise<EditorAiConfigResult>`
- `async setEditorAiKey(input: { projectId: string; apiKey: string; model?: string; instructions?: string; }): Promise<EditorAiConfigResult>`
- `async clearEditorAiKey(projectId: string): Promise<EditorAiConfigResult>`
- `async saveEditorAiSettings(input: { projectId: string; model: string; instructions: string; }): Promise<EditorAiConfigResult>`
- `async readEditorAiHistory(projectId: string): Promise<EditorAiHistoryResult>`
- `async appendEditorAiMessage(input: { projectId: string; threadId?: string; message: string; }): Promise<EditorAiHistoryResult>`
- `async startEditorAiThread(projectId: string, title?: string): Promise<EditorAiHistoryResult>`
- `async renameEditorAiThread(input: { projectId: string; threadId: string; title: string; }): Promise<EditorAiHistoryResult>`
- `async deleteEditorAiThread(input: { projectId: string; threadId: string; }): Promise<EditorAiHistoryResult>`
- `async clearEditorAiHistory(projectId: string): Promise<EditorAiHistoryResult>`
- `async requestEditorAiReply(input: { projectId: string; threadId: string; /** What the editor is pointing at — target, clicked words, source focus. */ context?: string; }): Promise<EditorAiReplyResult>`

## Depends on (1)

- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`scripts/smoke-aqua-editor-ai-ui.test.ts`](../../../scripts/smoke-aqua-editor-ai-ui.test.md)
- [`src/components/editing/AquaEditorAI.tsx`](./AquaEditorAI.md)
- [`src/components/editing/AquaEditorAIKey.tsx`](./AquaEditorAIKey.md)
- [`src/components/editing/AquaEditorAIThread.tsx`](./AquaEditorAIThread.md)

