# `src/lib/server/siteEditor/codeAdapter.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `hashFile(contents: string): string`
- `interface CodeFile (3 members)`
- `codeEditAdapter(input: { repository: string; ref: string; /** Every file in the tree, already filtered of anything hidden. */ listFiles: () => Promise<Array<{ path: string; size?: number }>>; readFile: (path: string) => Promise<string | nu…`

## Depends on (2)

- [`src/lib/editing/engine.ts`](../../editing/engine.md)
- [`src/lib/server/siteEditor/fileTree.ts`](./fileTree.md)

## Used by (2)

- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/lib/server/siteEditor/githubSource.ts`](./githubSource.md)

