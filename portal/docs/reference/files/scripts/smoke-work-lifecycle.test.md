# `scripts/smoke-work-lifecycle.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** THE WORK LIFECYCLE ON THE RIGHT SIDE — drafts, history, notes (phase 14).  Ed: "in the right side we also need notes and drafts version control logs for the project in dev mode — they are all built just need throwing in" and "saved drafts creates a branch or draft pr or something so it can be resumed so its just super duper easy".  The plan's rule, under test from both sides: THE REPOSITORY IS THE DRAFT STORE. A draft is the project's edit branch (`aqua-editor/<id>` — where every save already commits), a resume is reopening a changed file in the canvas, and publish is the branch's pull request. Nothing here invents a second draft store, and nothing here WRITES except a note.  What is load-bearing:  1. THE STATE IS READ FROM WHAT THE WRITE PATH ACTUALLY CREATED. Every state below is produced by the REAL `saveRepoFile` / `openProjectPullRequest` over the stateful fake GitHub, then read back by `readDraftStatus` through the REAL `compareRepoRefs` / `listBranchPullRequests` with only the socket replaced. A stub status would pass while the panels lied. 2. THE FOUR STATES ARE SAID PLAINLY — no branch yet / commits waiting / PR open at #N / merged — and no state's sentence ever contains the word "saved": an edit that is only in the page is described as exactly that. 3. MERGED VS COMMITS cannot be told apart by aheadBy alone (a squash merge leaves the branch forever ahead), so the discriminator is WHEN: commits newer than the merge are a new round. 4. HISTORY IS ONE FEED WITH TWO HONEST SOURCES: draft-branch commits and Dev Team check-ins, each labeled, and the commits half degrades to a sentence — never a silently half-empty feed. 5. NOTES ARE A FIRST-CLASS PROJECT TAG on the thoughts ledger — and are NEVER delivered to workers as instructions, in either reader.  No network anywhere. The stateful fake GitHub is smoke-repo-write's (lineage: smoke-editor-words-publish → smoke-repo-write → here), extended with commit messages + dates, a compare endpoint and a state-aware pulls listing — because the lifecycle READS what the others only wrote.

_No exported symbols (side-effect / internal module)._

## Depends on (17)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/lifecycle/route.ts`](../src/app/api/portal/dev/lifecycle/route.md)
- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)
- [`src/engines/editor/server/codeAdapter.ts`](../src/engines/editor/server/codeAdapter.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/githubSource.ts`](../src/engines/editor/server/githubSource.md)
- [`src/engines/editor/server/publish.ts`](../src/engines/editor/server/publish.md)
- [`src/engines/editor/server/repoWrite.ts`](../src/engines/editor/server/repoWrite.md)
- [`src/engines/editor/server/sourceEdit.ts`](../src/engines/editor/server/sourceEdit.md)
- [`src/engines/editor/server/workLifecycle.ts`](../src/engines/editor/server/workLifecycle.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/dev/devTeamThoughts.ts`](../src/lib/server/dev/devTeamThoughts.md)
- [`src/lib/server/dev/devTeamWorkers.ts`](../src/lib/server/dev/devTeamWorkers.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

