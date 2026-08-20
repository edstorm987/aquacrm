# `src/built-ins/modules/website-editor/src/lib/findReplace.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R023 — Site-wide find-and-replace.  Pure functions over `Block[]` trees. The host editor wraps these in a modal + multi-page fetch loop. Text-content only — block `props` strings; alt-text + attribute values explicitly out of scope per prompt.  `findInTree(blocks, query, opts)` walks a single tree returning `Match[]`. `replaceInTree(blocks, query, replacement, opts)` returns a deep-cloned tree with substitutions applied.

## Exports (8)

- `interface FindOptions (2 members)`
- `interface Match (7 members)`
- `findInTree(blocks: Block[], query: string, opts: FindOptions = {}): Match[]`
- `interface ReplaceResult (2 members)`
- `replaceInTree(blocks: Block[], query: string, replacement: string, opts: FindOptions = {}): ReplaceResult`
- `interface PageMatchSummary (3 members)`
- `findAcrossPages(pages: Array<{ id: string; title: string; blocks: Block[] }>, query: string, opts: FindOptions = {}): PageMatchSummary[]`
- `totalMatches(summaries: PageMatchSummary[]): number`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r023-find-replace.test.ts`](../__smoke__/r023-find-replace.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/FindReplaceModal.tsx`](../components/editor/FindReplaceModal.md)

