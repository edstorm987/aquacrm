# `src/engines/editor/server/codeAdapter.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (3)

- `hashFile(contents: string): string`
- `interface CodeFile (3 members)`
- `codeEditAdapter(input: { repository: string; ref: string; /** Every file in the tree, already filtered of anything hidden. */ listFiles: () => Promise<Array<{ path: string; size?: number }>>; readFile: (path: string) => Promise<string | nu…`

## Depends on (2)

- [`src/engines/editor/editing/engine.ts`](../editing/engine.md)
- [`src/engines/editor/server/fileTree.ts`](./fileTree.md)

## Used by (7)

- [`scripts/smoke-editor-surface-modes.test.ts`](../../../../scripts/smoke-editor-surface-modes.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/engines/editor/server/githubSource.ts`](./githubSource.md)
- [`src/engines/editor/server/repoWrite.ts`](./repoWrite.md)

