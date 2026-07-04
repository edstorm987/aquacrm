// Pure functions for manipulating the block tree. Kept side-effect-free
// so the editor's optimistic updates are easy to reason about.

import type { Block, BlockType } from "../../types/block";
import { getBlockDefinition } from "../blockRegistry";

export function makeBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlock(type: BlockType): Block {
  const def = getBlockDefinition(type);
  return {
    id: makeBlockId(),
    type,
    props: { ...(def?.defaultProps ?? {}) },
    styles: {},
    children: def?.isContainer ? [] : undefined,
  };
}

// Find a block by id, returning the block + a parent path for ancestor
// traversal. Used by drop handlers to locate insertion targets.
export interface BlockLocation { block: Block; parent: Block | null; index: number; }

export function findBlock(blocks: Block[], id: string, parent: Block | null = null): BlockLocation | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    if (b.id === id) return { block: b, parent, index: i };
    if (b.children) {
      const inner = findBlock(b.children, id, b);
      if (inner) return inner;
    }
  }
  return null;
}

// Immutable tree mutation helpers. They return a new top-level array so
// React state updates are clean. The implementation walks the tree once
// and copies only the path to the touched node.

function mapTree(blocks: Block[], visit: (b: Block) => Block | Block[] | null): Block[] {
  const next: Block[] = [];
  for (const b of blocks) {
    const result = visit(b);
    if (result === null) continue;
    if (Array.isArray(result)) { next.push(...result); continue; }
    const children = result.children ? mapTree(result.children, visit) : result.children;
    next.push({ ...result, children });
  }
  return next;
}

export function updateBlock(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return mapTree(blocks, b => b.id === id ? { ...b, ...patch, children: patch.children ?? b.children } : b);
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return mapTree(blocks, b => b.id === id ? null : b);
}

export function duplicateBlock(blocks: Block[], id: string): Block[] {
  const loc = findBlock(blocks, id);
  if (!loc) return blocks;
  const clone = deepClone(loc.block);
  return insertSibling(blocks, id, clone, "after");
}

export function insertSibling(blocks: Block[], targetId: string, newBlock: Block, position: "before" | "after"): Block[] {
  // Top-level insert
  const topIdx = blocks.findIndex(b => b.id === targetId);
  if (topIdx >= 0) {
    const next = [...blocks];
    next.splice(position === "before" ? topIdx : topIdx + 1, 0, newBlock);
    return next;
  }
  return blocks.map(b => {
    if (b.children) return { ...b, children: insertSibling(b.children, targetId, newBlock, position) };
    return b;
  });
}

export function appendChild(blocks: Block[], parentId: string, newBlock: Block): Block[] {
  return blocks.map(b => {
    if (b.id === parentId) return { ...b, children: [...(b.children ?? []), newBlock] };
    if (b.children) return { ...b, children: appendChild(b.children, parentId, newBlock) };
    return b;
  });
}

export function moveBlock(blocks: Block[], sourceId: string, targetId: string, position: "before" | "after" | "inside"): Block[] {
  const loc = findBlock(blocks, sourceId);
  if (!loc) return blocks;
  // Refuse to move a block into itself or a descendant.
  if (sourceId === targetId) return blocks;
  if (isDescendant(loc.block, targetId)) return blocks;
  const removed = removeBlock(blocks, sourceId);
  if (position === "inside") return appendChild(removed, targetId, loc.block);
  return insertSibling(removed, targetId, loc.block, position);
}

export function isDescendant(block: Block, candidateId: string): boolean {
  if (!block.children) return false;
  for (const c of block.children) {
    if (c.id === candidateId) return true;
    if (isDescendant(c, candidateId)) return true;
  }
  return false;
}

function deepClone(block: Block): Block {
  return {
    ...block,
    id: makeBlockId(),
    props: { ...block.props },
    styles: block.styles ? { ...block.styles } : undefined,
    children: block.children?.map(deepClone),
  };
}
