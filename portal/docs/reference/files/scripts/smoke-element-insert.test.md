# `scripts/smoke-element-insert.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** ─── PHASE 7 — INSERTING AN ELEMENT WRITES REAL CODE ─────────────────────────  Ed: "the visual editor has like a component library like adding in a section or something will actually add the correct code it all gets put in right"  Before this, the element library was browse-and-select: on an Aqua-hosted portal an insert mutated the portal document (correct there, untouched here), and on a repository-backed website it did nothing at all — the library sentence honestly said "not wired yet". This file pins the wiring:  EMIT    — `elements/emit.ts` renders a block definition as plain, structural JSX/HTML with its registry defaults filled in. No imports, no identifiers, no framework guesses — code that compiles in ANY page file, derived ONLY from what the registry declares. Deterministic, because the preview and the commit must be the same text. PLACE   — `server/sourceInsert.ts` decides whether the chosen gap can take it, by asking `sourceMatch.contextAt` at the end of the anchor line. `unknown` REFUSES. Never a guess into JSX: one wrong gap is a build error on a client's website. COMMIT  — `repoWrite.insertElementIntoRepo` previews without writing, then commits THROUGH `saveRepoFile` — the same draft branch, branch-first read, fingerprint refusal, branch lock and honest "draft branch, not the site" summary the code canvas already proved. Nothing here is a second write path.  The stateful fake GitHub below is the smoke-repo-write one (itself extended from smoke-editor-words-publish), grown a `readTree` answer so the target picker can be driven. Same rule as its ancestors: commits go through the REAL `publishEdits` with only the socket replaced, because a stub that returned `published: true` would pass while the real code lost an edit.

_No exported symbols (side-effect / internal module)._

## Depends on (18)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../src/app/api/portal/dev/repo-write/route.md)
- [`src/engines/editor/elements/definition.ts`](../src/engines/editor/elements/definition.md)
- [`src/engines/editor/elements/emit.ts`](../src/engines/editor/elements/emit.md)
- [`src/engines/editor/elements/registry.ts`](../src/engines/editor/elements/registry.md)
- [`src/engines/editor/elements/websiteElements.ts`](../src/engines/editor/elements/websiteElements.md)
- [`src/engines/editor/server/codeAdapter.ts`](../src/engines/editor/server/codeAdapter.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/githubSource.ts`](../src/engines/editor/server/githubSource.md)
- [`src/engines/editor/server/publish.ts`](../src/engines/editor/server/publish.md)
- [`src/engines/editor/server/repoWrite.ts`](../src/engines/editor/server/repoWrite.md)
- [`src/engines/editor/server/sourceEdit.ts`](../src/engines/editor/server/sourceEdit.md)
- [`src/engines/editor/server/sourceInsert.ts`](../src/engines/editor/server/sourceInsert.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

