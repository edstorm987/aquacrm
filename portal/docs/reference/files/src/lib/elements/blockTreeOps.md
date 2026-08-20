# `src/lib/elements/blockTreeOps.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Pure functions for manipulating the block tree. Kept side-effect-free so the editor's optimistic updates are easy to reason about.

## Exports (12)

- `makeBlockId(): string`
- `createBlock(type: BlockType): Block`
- `interface BlockLocation (3 members)`
- `findBlock(blocks: Block[], id: string, parent: Block | null = null): BlockLocation | null`
- `updateBlock(blocks: Block[], id: string, patch: Partial<Block>): Block[]`
- `removeBlock(blocks: Block[], id: string): Block[]`
- `duplicateBlock(blocks: Block[], id: string): Block[]`
- `insertSibling(blocks: Block[], targetId: string, newBlock: Block, position: "before" | "after"): Block[]`
- `appendChild(blocks: Block[], parentId: string, newBlock: Block): Block[]`
- `moveBlock(blocks: Block[], sourceId: string, targetId: string, position: "before" | "after" | "inside"): Block[]`
- `isDescendant(block: Block, candidateId: string): boolean`
- `cloneBlock(block: Block): Block`

## Depends on (2)

- [`src/lib/elements/block.ts`](./block.md)
- [`src/lib/elements/registry.ts`](./registry.md)

## Used by (3)

- [`scripts/smoke-element-engine.test.ts`](../../../scripts/smoke-element-engine.test.md)
- [`src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps.ts`](../../built-ins/modules/website-editor/src/components/canvas/blockTreeOps.md)
- [`src/lib/elements/index.ts`](./index.md)

