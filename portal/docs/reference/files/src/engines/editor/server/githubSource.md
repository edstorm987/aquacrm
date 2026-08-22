# `src/engines/editor/server/githubSource.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (11)

- `interface GitHubRepoSource (4 members)`
- `class GitHubNotConfigured`
    - `constructor()`
- `interface RepoHead (3 members)`
- `async readRepoHeadSha(source: GitHubRepoSource): Promise<string>`
- `async readRepoTree(source: GitHubRepoSource): Promise<RepoHead>`
- `interface RepoComparison (5 members)`
- `async compareRepoRefs(source: GitHubRepoSource, head: string): Promise<RepoComparison>`
- `interface BranchPullRequest (5 members)`
- `async listBranchPullRequests(source: GitHubRepoSource, branch: string): Promise<BranchPullRequest[]>`
- `interface RepoFile (6 members)`
- `async readRepoFile(source: GitHubRepoSource, path: string): Promise<RepoFile>`

## Depends on (2)

- [`src/engines/editor/server/codeAdapter.ts`](./codeAdapter.md)
- [`src/engines/editor/server/fileTree.ts`](./fileTree.md)

## Used by (11)

- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`scripts/smoke-editor-words-publish.test.ts`](../../../../scripts/smoke-editor-words-publish.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/engines/editor/server/mapProject.ts`](./mapProject.md)
- [`src/engines/editor/server/repoWrite.ts`](./repoWrite.md)
- [`src/engines/editor/server/sourceEdit.ts`](./sourceEdit.md)
- [`src/engines/editor/server/workLifecycle.ts`](./workLifecycle.md)
- [`src/lib/server/dev/fileFinding.ts`](../../../lib/server/dev/fileFinding.md)

