# `scripts/smoke-aqua-editor-ai-ui.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** AQUA EDITOR AI — its own proper UI.  Ed, verbatim: "it needs its own thing and its saved per project this one is please the chat history per project only limited to a project nothing else and needs its own proper ui for this".  Phase 1 gave it its own token. Phase 2 gave it its own per-project history store. This is the interface, and it is the phase where the separation either becomes real on screen or quietly stops being real: a per-project store read by a client that writes back to the shared one would LOOK fixed.  So the cases here are mostly about what the screen must NOT do:  1. NOT the Advisor's UI. No `AssistantWorkspace`, no `/api/assistant`. 2. NOT a second way to leak the key. The key input is write-only, the value never comes back, and no request ever carries it in a URL. 3. NOT cross-project. Every call names a project; there is no listing. 4. NOT the dev workspace's clothes. No `--dt-*` tokens inside the editor, a visible focus ring on every control, and a contrast floor on text.  The client module (`editorAiClient.ts`) is driven for real against a stubbed `fetch`, so "never in a URL" is checked against the request that was actually made rather than against the source that was meant to make it.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/components/editing/editorAiClient.ts`](../src/components/editing/editorAiClient.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

