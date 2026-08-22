# `scripts/smoke-dev-project-nesting.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** NESTED PROJECTS — Ed's two levels, enforced in the store.  Ed, 2026-08-21: a project can contain projects — "one project could be a website they might have a software going on with it too". From inside a project you can create another and it is a CHILD of the project you are in, never a new top-level one. And EXACTLY TWO LEVELS: "project → inner projects and that's it".  What is under test, in order of how much it matters:  1. THE TWO-LEVEL RULE, FROM EVERY DIRECTION. A child can never be a parent (no third level from below), a parent can never become a child (no third level from above), nothing contains itself — and because every cycle needs some project to be both parent AND child, those three refusals make a cycle INEXPRESSIBLE rather than merely checked for. That proof is run here, not assumed. 2. THE STORE IS THE BOUNDARY. Every refusal is asserted at `saveDevProject` / `deleteDevProject` AND at the route, so no future screen can talk its way past the rule. 3. A DELETE THAT WOULD ORPHAN CHILDREN refuses and NAMES them — and the route refuses BEFORE its destructive AI cleanup, so a refused delete leaves the project exactly as it was, assistant history included. 4. TENANT FIRST, the devProjects order: a foreign parent id and an invented one are the same answer, word for word. 5. OLD RECORDS — written before `parentProjectId` existed — parse, list, rename and group exactly as before: top level, field absent.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/projects/route.ts`](../src/app/api/portal/dev/projects/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/editorAiHistory.ts`](../src/engines/editor/server/editorAiHistory.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/shared/devProjectGrouping.ts`](../src/lib/shared/devProjectGrouping.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

