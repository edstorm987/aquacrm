# `src/built-ins/modules/website-editor/src/lib/blockTreeDiff.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R034 — Block-tree diff + JSON line diff.  Two pure helpers driving the version diff view:  diffTrees(a, b) → structural diff by block id. Recursive over children. Returns { added, removed, modified } where: added    = ids present in b but not a, with the full Block removed  = ids present in a but not b, with the full Block modified = ids present in both whose props/styles/type/a11y differ; `propChanges` lists which fields changed  jsonLineDiff(a, b) → line-by-line diff over two strings using LCS, returning a flat list of {kind, text} entries the editor can render as a unified-style diff. Stable on equal inputs (empty `add`/`remove` lists). Quadratic in input length — fine for two formatted JSON trees up to ~5k lines each.  No React, no foundation imports. Smoke ships in r034-*.

## Exports (8)

- `interface BlockTreeDiff (3 members)`
- `interface ModifiedBlock (4 members)`
- `diffTrees(treeA: Block[], treeB: Block[]): BlockTreeDiff`
- `type LineDiffKind`
- `interface LineDiffEntry (4 members)`
- `jsonLineDiff(a: string, b: string): LineDiffEntry[]`
- `interface DiffSummary (4 members)`
- `summariseDiff(d: BlockTreeDiff): DiffSummary`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r034-version-diff.test.ts`](../__smoke__/r034-version-diff.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/VersionDiffPanel.tsx`](../components/editor/VersionDiffPanel.md)

