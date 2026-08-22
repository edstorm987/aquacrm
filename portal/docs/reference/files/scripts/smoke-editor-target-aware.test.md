# `scripts/smoke-editor-target-aware.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** ONE editor, N targets.  Ed's call: there are no separate portal / website / code editors any more — there is one Dev Editor that ADAPTS to what it is pointed at. The bug this pins was the editor loading a client portal because you opened a repository: the client selector, "Editing X's portal draft", Save draft / Publish and the Content/Pages/Brand inspectors all appeared for a `software` project, and a portal design was FETCHED for it.  Source-level assertions on purpose: the behaviour is a set of gates inside a 1300-line client component, and the thing worth pinning is that each gate still exists.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

