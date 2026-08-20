# `src/built-ins/modules/website-editor/src/lib/blockTreeJson.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R020 — JSON ↔ BlockTree validation + (de)serialisation.  `parseBlockTreeJson(json)` parses a JSON string and validates the shape against the `Block[]` contract. Returns `{ ok: true, blocks }` on success or `{ ok: false, error, line?, col? }` on failure. The editor's Code mode uses this to flag inline errors without breaking the live preview when the tree is invalid (preview keeps rendering the last-good tree).  `formatBlockTreeJson(blocks)` produces stable, indented JSON the editor textarea can show.  `compareTrees(a, b)` summarises structural differences (block counts + first-divergence path) for the "tree changed" confirm modal before save.

## Exports (6)

- `type ParseResult`
- `validateBlockTree(blocks: unknown): string | null`
- `parseBlockTreeJson(json: string): ParseResult`
- `formatBlockTreeJson(blocks: Block[]): string`
- `interface TreeDiff (4 members)`
- `compareTrees(a: Block[], b: Block[]): TreeDiff`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r020-code-mode.test.ts`](../__smoke__/r020-code-mode.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/CodeModePanel.tsx`](../components/editor/CodeModePanel.md)

