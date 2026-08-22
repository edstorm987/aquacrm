# `scripts/smoke-editor-words-publish.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** WORDS → SOURCE → A COMMIT.  Ed: "i get the exact text i can change it on the right menu" "the edits you make on dev editor when published just go to git its so simple."  Before this, the right menu's words edit rewrote the LOADED page through the Aqua Tag and died on reload, and `patch.ts` → `publish.ts` — the path that would have persisted it — was reached by nothing but its own tests. Verified rather than taken on trust: grep for `planPatches`/`publishEdits` across `src/` finds one hit each, both inside their own modules.  What is under test is the whole loop and, more importantly, everything it REFUSES. The dangerous failure here is not "the edit did not save"; it is a commit to a client's website on a line nobody looked at, or a `{` typed into a heading that stops the site building. So most of what follows asserts a refusal, and several assert that nothing was written at all.  THREE properties are load-bearing:  1. FINDING IS A GUESS, AND SAYS SO. A tag selection carries no file and no line (`AquaTagElement` has no such field, and `data-aqua-src` is stamped by nothing), so the source is SEARCHED for the words. The result is a list for a human to confirm — never one answer applied silently. 2. THE EDIT CANNOT BREAK THE BUILD. Splicing words into a line of JSX means the characters that mean something to the compiler have to be refused, and which ones they are depends on whether the words sit in JSX text or inside a quoted attribute. 3. NOTHING IS WRITTEN WITHOUT `confirm === true`, and a branch that moved since the search is refused rather than committed on top of.  No network anywhere. Every GitHub call is an injected dep; the route tests exercise only the paths that return before a request is ever made.

_No exported symbols (side-effect / internal module)._

## Depends on (14)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/source-edit/route.ts`](../src/app/api/portal/dev/source-edit/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/githubSource.ts`](../src/engines/editor/server/githubSource.md)
- [`src/engines/editor/server/patch.ts`](../src/engines/editor/server/patch.md)
- [`src/engines/editor/server/publish.ts`](../src/engines/editor/server/publish.md)
- [`src/engines/editor/server/registry.ts`](../src/engines/editor/server/registry.md)
- [`src/engines/editor/server/sourceEdit.ts`](../src/engines/editor/server/sourceEdit.md)
- [`src/engines/editor/server/sourceMatch.ts`](../src/engines/editor/server/sourceMatch.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

