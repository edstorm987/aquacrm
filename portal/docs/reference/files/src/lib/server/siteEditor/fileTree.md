# `src/lib/server/siteEditor/fileTree.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface TreeFile (5 members)`
- `interface TreeDirectory (4 members)`
- `MAX_EDITABLE_BYTES`
- `isHiddenPath(path: string): boolean`
- `describeFile(path: string, size?: number): TreeFile`
- `buildFileTree(entries: Array<{ path: string; size?: number }>): TreeDirectory`
- `treeFiles(directory: TreeDirectory): TreeFile[]`

## Used by (6)

- [`scripts/smoke-code-mode.test.ts`](../../../../scripts/smoke-code-mode.test.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/agency/development/code/_CodeWorkspace.tsx`](../../../app/portal/agency/development/code/_CodeWorkspace.md)
- [`src/components/editing/RepositoryPanel.tsx`](../../../components/editing/RepositoryPanel.md)
- [`src/lib/server/siteEditor/codeAdapter.ts`](./codeAdapter.md)
- [`src/lib/server/siteEditor/githubSource.ts`](./githubSource.md)

