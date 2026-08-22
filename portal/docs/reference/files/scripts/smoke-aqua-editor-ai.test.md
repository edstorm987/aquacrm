# `scripts/smoke-aqua-editor-ai.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** AQUA EDITOR AI — the "assist" depth.  The depth ladder was simple / visual / developer: three ways to operate the tool. The missing state was not operating it at all — describing the change and letting the assistant do it. Adding "assist" made four; since 2026-08-22 the ladder is three again — "Just the words" merged into Visual (the same selection, the same editable words, one depth deeper available), so it reads assist / visual / developer. This pins the assist mode, its tab, and the two things that make it an EDITOR assistant rather than a chat box: pointing at an element, and attaching a file.  ⚠ IT USED TO PIN THE OPPOSITE RULE. Until 2026-08-21 this file said: "ONE assistant engine, three skins. Aqua Editor AI must mount the same AssistantWorkspace the Advisor and the Librarian use — a second brain is the thing this test exists to prevent." That was a true description of a deliberate decision, and Ed has since reversed the decision:  "aqua editor ai needs to be its only thing please now. needs a seperate tocken please to configure please. it needs its own thing and its saved per project this one is please the chat history per project only limited to a project nothing else and needs its own proper ui for this"  So the reuse assertions below were REWRITTEN, not worked around. They now pin the separation: Aqua Editor AI resolves its OWN credential and its OWN model, per project, and must never reach for the agency assistant's. If a future change makes these fail because the two were re-unified "to remove duplication", the duplication is the requirement — fix the change, not the test. The security half lives in `smoke-aqua-editor-ai-token.test.ts`, the per-project chat history in `smoke-aqua-editor-ai-history.test.ts`, and its own interface in `smoke-aqua-editor-ai-ui.test.ts`.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

