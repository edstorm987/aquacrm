# `scripts/smoke-aqua-editor-ai-reply.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** AQUA EDITOR AI — THE REPLY. The model answers, server-side, on the project's own key.  Everything else already existed — the per-project token (`editorAi.ts`), the per-project history (`editorAiHistory.ts`), the UI, the routes — and the panel honestly said "cannot reply yet". This file pins the reply path that closes that gap, and mostly it pins the ways it must NOT behave:  1. THE ROUND TRIP IS REAL AND SERVER-SIDE. A user message plus the editor context goes to the model with the PROJECT's brief; the assistant's answer lands in the project's thread appended by the server — the one author the history route's role gate defers to.  2. THE KEY IS THE PROJECT'S OWN, EVERY TIME. Two projects, two keys, each call carries its own; no fallback to the agency's `openai` connection or the environment; no key at all means the existing not-configured sentence and ZERO model calls.  3. FAILURE IS WORDS, AND THE WORDS ARE CLEAN. OpenAI's 401 echoes the key that failed — the scrubber removes the exact value and the shape, before the sentence is returned, and a failed reply appends NOTHING.  4. THE CAPS STILL HOLD WITH REPLIES FLOWING. Replies enter through the same capped store as everything else: long replies truncate, old messages evict, and the eviction counter counts.  Every model call in this file hits a stubbed fetch. A tripwire fetch that THROWS is installed for the whole file, so a path that slipped past a stub fails loudly rather than touching the real API. First, and statically — see the note in dev-console-request-scope.ts.

_No exported symbols (side-effect / internal module)._

## Depends on (13)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/editor-ai/history/route.ts`](../src/app/api/portal/dev/editor-ai/history/route.md)
- [`src/app/api/portal/dev/editor-ai/reply/route.ts`](../src/app/api/portal/dev/editor-ai/reply/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/editorAi.ts`](../src/engines/editor/server/editorAi.md)
- [`src/engines/editor/server/editorAiHistory.ts`](../src/engines/editor/server/editorAiHistory.md)
- [`src/engines/editor/server/editorAiReply.ts`](../src/engines/editor/server/editorAiReply.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](../src/lib/server/assistants/openaiAssistant.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

