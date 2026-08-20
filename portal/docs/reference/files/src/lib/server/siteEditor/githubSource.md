# `src/lib/server/siteEditor/githubSource.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `interface GitHubRepoSource (4 members)`
- `class GitHubNotConfigured`
    - `constructor()`
- `interface RepoHead (3 members)`
- `async readRepoTree(source: GitHubRepoSource): Promise<RepoHead>`
- `interface RepoFile (6 members)`
- `async readRepoFile(source: GitHubRepoSource, path: string): Promise<RepoFile>`

## Depends on (2)

- [`src/lib/server/siteEditor/codeAdapter.ts`](./codeAdapter.md)
- [`src/lib/server/siteEditor/fileTree.ts`](./fileTree.md)

## Used by (1)

- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)

