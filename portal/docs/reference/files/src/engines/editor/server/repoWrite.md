# `src/engines/editor/server/repoWrite.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (28)

- `type RepoWriteDeps`
- `type RepoWriteRefusal`
- `type RepoPathCheck`
- `normalizeRepoPath(requested: string): RepoPathCheck`
- `interface SaveRepoFileInput (7 members)`
- `type SaveRepoFileResult`
- `async saveRepoFile(input: SaveRepoFileInput, deps: RepoWriteDeps = {}): Promise<SaveRepoFileResult>`
- `interface CreateRepoPathInput (6 members)`
- `type CreateRepoPathResult`
- `async createRepoPath(input: CreateRepoPathInput, deps: RepoWriteDeps = {}): Promise<CreateRepoPathResult>`
- `type ProjectPullRequestResult`
- `async openProjectPullRequest(input: { agencyId: string; project: DevProject }, deps: RepoWriteDeps = {}): Promise<ProjectPullRequestResult>`
- `type MergeRevertDeps`
- `type MergeProjectResult`
- `async mergeProjectPullRequest(input: { agencyId: string; project: DevProject; confirm?: boolean }, deps: MergeRevertDeps = {}): Promise<MergeProjectResult>`
- `type RevertPlanFile`
- `type RevertDraftResult`
- `async revertMergedDraft(input: { agencyId: string; project: DevProject; confirm?: boolean }, deps: MergeRevertDeps = {}): Promise<RevertDraftResult>`
- `type InsertTargetsResult`
- `async listInsertTargets(input: { agencyId: string; project: DevProject }, deps: RepoWriteDeps = {}): Promise<InsertTargetsResult>`
- `interface InsertElementInput (8 members)`
- `type InsertElementResult`
- `async insertElementIntoRepo(input: InsertElementInput, deps: RepoWriteDeps = {}): Promise<InsertElementResult>`
- `type ReadPageSeoResult`
- `async readPageSeoFromRepo(input: { agencyId: string; project: DevProject; path: string }, deps: RepoWriteDeps = {}): Promise<ReadPageSeoResult>`
- `interface WritePageSeoInput (6 members)`
- `type WritePageSeoResult`
- `async writePageSeoToRepo(input: WritePageSeoInput, deps: RepoWriteDeps = {}): Promise<WritePageSeoResult>`

## Depends on (9)

- [`src/engines/editor/editing/pageSeo.ts`](../editing/pageSeo.md)
- [`src/engines/editor/server/codeAdapter.ts`](./codeAdapter.md)
- [`src/engines/editor/server/fileTree.ts`](./fileTree.md)
- [`src/engines/editor/server/githubSource.ts`](./githubSource.md)
- [`src/engines/editor/server/publish.ts`](./publish.md)
- [`src/engines/editor/server/registry.ts`](./registry.md)
- [`src/engines/editor/server/sourceEdit.ts`](./sourceEdit.md)
- [`src/engines/editor/server/sourceInsert.ts`](./sourceInsert.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (5)

- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../../../app/api/portal/dev/repo-write/route.md)

