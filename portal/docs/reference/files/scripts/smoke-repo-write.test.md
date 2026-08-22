# `scripts/smoke-repo-write.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** THE REPO WRITE PATH — create, save, publish.  Ed, blocked live: "its not letting me add new files folders... dont think publishing works either"  Before this, a repository-backed project could be READ everywhere and WRITTEN nowhere: the files route 409'd (correctly — local disk is not the repo), the "+" was disabled with "create the file there and publish", and nothing implemented the creating or the publishing. What is under test is the GitHub alternative that refusal always pointed at: a save is a commit on the project's draft branch, a new file or folder is a committed blob (or a .gitkeep), and publish opens — or finds — the branch's pull request.  Everything runs through the words editor's proven machinery. `publishEdits` is the REAL one in every commit test here, running against the stateful fake GitHub below — the fake that tracks refs, commit ancestry and (new for this file) the CONTENTS each commit put where, and enforces the fast-forward rule the way GitHub does. A stub that returned `published: true` would pass every test while the real code lost an edit.  The properties that are load-bearing:  1. THE DRAFT BRANCH IS THE TRUTH once it exists. The current copy is read from the branch tip, so the second save is judged against the first — reading base instead is the lost-update bug the words editor already met and fixed. 2. THE FINGERPRINT FROM READ TIME is re-checked against what is actually there at save time. A mismatch refuses; it never overwrites. 3. THE SAME PATH RULES as local disk: hidden paths cannot be written or created, traversal dies at normalisation, and nothing reaches GitHub when a path is refused. 4. NOTHING IS COMMITTED without `confirm === true`, and the pull request is opened once and REUSED — pressing publish twice is boring.  No network anywhere: reads are injected deps over the fake's state, commits go through the real publishEdits with only the socket replaced, and the route tests exercise only the paths that return before a request is made.

_No exported symbols (side-effect / internal module)._

## Depends on (14)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../src/app/api/portal/dev/repo-write/route.md)
- [`src/engines/editor/server/codeAdapter.ts`](../src/engines/editor/server/codeAdapter.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/fileTree.ts`](../src/engines/editor/server/fileTree.md)
- [`src/engines/editor/server/githubSource.ts`](../src/engines/editor/server/githubSource.md)
- [`src/engines/editor/server/publish.ts`](../src/engines/editor/server/publish.md)
- [`src/engines/editor/server/repoWrite.ts`](../src/engines/editor/server/repoWrite.md)
- [`src/engines/editor/server/sourceEdit.ts`](../src/engines/editor/server/sourceEdit.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

