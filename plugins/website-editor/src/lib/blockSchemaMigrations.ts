// R039 — Block schema migration runner.
//
// Forward-compat helper for evolving block shapes. When a schema
// change ships, register a `{from, to, migrate}` entry below;
// `migrateTree` walks the stored tree, applies every step from the
// block's stamped `_v` up to `BLOCK_SCHEMA_VERSION`, and returns a
// new tree. Migrations are immutable — each step receives a single
// block POJO and returns a clone with the change applied.
//
// Honesty contract (chapter #68): no silent data drop. A migration
// that needs to remove a field must first preserve it under a new
// name or note the loss in the chapter. Touched blocks carry
// `_migratedFrom: <oldV>` so a host audit can find rows that were
// rewritten on load.
//
// Cycle guard (R028 block-group reuse pattern): the recursive walker
// tracks visited block ids and short-circuits on revisit; legitimate
// trees never repeat ids, but defence-in-depth against malformed
// imports.

import type { Block, BlockTreeJSON } from "../types/block";
import { makeId } from "./ids";

// ─── Schema version + migration registry ─────────────────────────────

export const BLOCK_SCHEMA_VERSION = 3;

export interface BlockMigrationStep {
  from: number;
  to: number;
  // Receives a block POJO; returns a (cloned) block with the
  // migration applied. Must NOT mutate the input.
  migrate: (block: Block) => Block;
}

// v1 → v2: every block must carry `id`. Legacy trees from before the
// id field was mandatory get a generated one.
const V1_TO_V2: BlockMigrationStep = {
  from: 1, to: 2,
  migrate: (block) => {
    if (typeof block.id === "string" && block.id.length > 0) return block;
    return { ...block, id: makeId("blk") };
  },
};

// v2 → v3: split a single `align` prop on heading/text into structured
// `styles.align`. Older trees stored `props.align`; new schema reads
// from `styles.align`. Preserves the original under
// `props._legacyAlign` so the audit can tell which rows were rewritten
// without losing the operator-set value.
const V2_TO_V3: BlockMigrationStep = {
  from: 2, to: 3,
  migrate: (block) => {
    const legacy = block.props?.align;
    if (legacy === undefined) return block;
    const align = legacy === "left" || legacy === "center" || legacy === "right"
      ? legacy
      : undefined;
    const { align: _drop, ...restProps } = block.props ?? {};
    const next: Block = {
      ...block,
      props: { ...restProps, _legacyAlign: legacy },
      styles: { ...(block.styles ?? {}), ...(align ? { align } : {}) },
    };
    return next;
  },
};

export const MIGRATIONS: readonly BlockMigrationStep[] = [V1_TO_V2, V2_TO_V3];

// ─── Public helpers ──────────────────────────────────────────────────

// Read the version stamp off a block. Untyped legacy rows default
// to v1 — that matches the first published schema.
export function blockVersion(block: Block): number {
  const v = (block as unknown as Record<string, unknown>)._v;
  return typeof v === "number" && v > 0 ? v : 1;
}

export function treeNeedsMigration(tree: BlockTreeJSON): boolean {
  let needs = false;
  walk(tree, new Set(), (b) => {
    if (blockVersion(b) < BLOCK_SCHEMA_VERSION) {
      needs = true;
      return false; // short-circuit walk
    }
    return true;
  });
  return needs;
}

// Migrate a single block from `fromVersion` up to current. Stamps
// `_v: BLOCK_SCHEMA_VERSION` and `_migratedFrom: fromVersion` on the
// returned clone. Children are NOT touched here; `migrateTree`
// drives recursion.
function migrateBlock(block: Block, fromVersion: number): Block {
  if (fromVersion >= BLOCK_SCHEMA_VERSION) return block;
  let cur = block;
  for (const step of MIGRATIONS) {
    if (step.from < fromVersion) continue;
    if (step.from >= BLOCK_SCHEMA_VERSION) break;
    cur = step.migrate(cur);
  }
  return {
    ...cur,
    ...({
      _v: BLOCK_SCHEMA_VERSION,
      _migratedFrom: fromVersion,
    } as Partial<Block>),
  };
}

export function migrateTree(
  tree: BlockTreeJSON,
  fromVersion?: number,
): BlockTreeJSON {
  const seen = new Set<string>();
  const recurse = (blocks: readonly Block[]): Block[] => {
    const out: Block[] = [];
    for (const b of blocks) {
      if (b.id && seen.has(b.id)) {
        // Cycle guard — keep the block in the output but don't recurse.
        out.push(b);
        continue;
      }
      if (b.id) seen.add(b.id);
      const startV = fromVersion ?? blockVersion(b);
      const migrated = startV < BLOCK_SCHEMA_VERSION
        ? migrateBlock(b, startV)
        : b;
      const children = migrated.children && migrated.children.length
        ? recurse(migrated.children)
        : migrated.children;
      out.push(children === migrated.children ? migrated : { ...migrated, children });
    }
    return out;
  };
  return recurse(tree);
}

// Storage-helper entry point. Returns `[migratedTree, didMigrate]`.
// Idempotent: passing an already-current tree returns the original
// reference with `didMigrate=false`.
export function loadBlockTreeMigrated(
  tree: BlockTreeJSON,
): [BlockTreeJSON, boolean] {
  if (!treeNeedsMigration(tree)) return [tree, false];
  return [migrateTree(tree), true];
}

// ─── Walker ──────────────────────────────────────────────────────────

function walk(
  blocks: readonly Block[],
  seen: Set<string>,
  visit: (b: Block) => boolean,
): void {
  for (const b of blocks) {
    if (b.id && seen.has(b.id)) continue;
    if (b.id) seen.add(b.id);
    if (!visit(b)) return;
    if (b.children && b.children.length) walk(b.children, seen, visit);
  }
}
