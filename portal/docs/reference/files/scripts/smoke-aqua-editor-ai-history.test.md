# `scripts/smoke-aqua-editor-ai-history.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** AQUA EDITOR AI — chat history, per project only.  Ed, verbatim: "the chat history per project only limited to a project nothing else".  Phase 1 gave Aqua Editor AI its own token. This pins the history half, and the half that goes wrong quietly is isolation — so most of these tests do not check that the right thing comes back, they ATTEMPT THE LEAK and check that nothing does:  1. PER PROJECT. A message belongs to exactly one project. Reading a project returns that project's conversation and no other's.  2. PER TENANT, AGENCY BEFORE PROJECT. Another agency's project id, a project id from a different agency and an invented id are the SAME answer — nothing — because a different answer for a real-but-foreign id confirms it exists.  3. GENUINELY SEPARATE FROM THE AGENCY ASSISTANT. Two collections, not one filtered view: clearing the Advisor's history must not touch an editor conversation, and clearing a project's must not touch the Advisor's.  4. BOUNDED. `PortalState` is ONE document rewritten in full on every save, so an unbounded conversation taxes every unrelated write in the product. The rule is oldest out, and it is tested at every level including the character budget that actually binds. First, and statically — see the note in dev-console-request-scope.ts.

_No exported symbols (side-effect / internal module)._

## Depends on (11)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/editor-ai/history/route.ts`](../src/app/api/portal/dev/editor-ai/history/route.md)
- [`src/app/api/portal/dev/projects/route.ts`](../src/app/api/portal/dev/projects/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/editorAiHistory.ts`](../src/engines/editor/server/editorAiHistory.md)
- [`src/lib/server/assistants/assistantStore.ts`](../src/lib/server/assistants/assistantStore.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

