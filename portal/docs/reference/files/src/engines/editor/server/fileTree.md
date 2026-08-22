# `src/engines/editor/server/fileTree.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (10)

- `interface TreeFile (7 members)`
- `interface TreeDirectory (4 members)`
- `IMAGE`
- `MAX_EDITABLE_BYTES`
- `MAX_READ_BYTES`
- `isTextPath(path: string): boolean`
- `isHiddenPath(path: string): boolean`
- `describeFile(path: string, size?: number): TreeFile`
- `buildFileTree(entries: Array<{ path: string; size?: number }>): TreeDirectory`
- `treeFiles(directory: TreeDirectory): TreeFile[]`

## Used by (12)

- [`scripts/smoke-code-mode.test.ts`](../../../../scripts/smoke-code-mode.test.md)
- [`scripts/smoke-editor-write-path.test.ts`](../../../../scripts/smoke-editor-write-path.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/agency/development/code/_CodeWorkspace.tsx`](../../../app/portal/agency/development/code/_CodeWorkspace.md)
- [`src/components/editing/EditorCodeCanvas.tsx`](../../../components/editing/EditorCodeCanvas.md)
- [`src/components/editing/RepositoryPanel.tsx`](../../../components/editing/RepositoryPanel.md)
- [`src/engines/editor/server/codeAdapter.ts`](./codeAdapter.md)
- [`src/engines/editor/server/githubSource.ts`](./githubSource.md)
- [`src/engines/editor/server/mapProject.ts`](./mapProject.md)
- [`src/engines/editor/server/repoWrite.ts`](./repoWrite.md)
- [`src/engines/editor/server/workspaceFiles.ts`](./workspaceFiles.md)

