// Pure functions for manipulating the element tree.
//
// Implementation moved to `src/lib/elements/blockTreeOps.ts` in P1. Re-exported
// here verbatim.
//
// `import "../blockRegistry"` is load-bearing: `createBlock()` reads
// `defaultProps` through the shared `src/lib/elements/registry` lookup, and
// this plugin's registry is what fills it.
import "../blockRegistry";

export {
  appendChild,
  cloneBlock,
  createBlock,
  duplicateBlock,
  findBlock,
  insertSibling,
  isDescendant,
  makeBlockId,
  moveBlock,
  removeBlock,
  updateBlock,
} from "@/lib/elements/blockTreeOps";
export type { BlockLocation } from "@/lib/elements/blockTreeOps";
