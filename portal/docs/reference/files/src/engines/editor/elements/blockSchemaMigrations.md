# `src/engines/editor/elements/blockSchemaMigrations.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** R039 — Block schema migration runner.  Forward-compat helper for evolving block shapes. When a schema change ships, register a `{from, to, migrate}` entry below; `migrateTree` walks the stored tree, applies every step from the block's stamped `_v` up to `BLOCK_SCHEMA_VERSION`, and returns a new tree. Migrations are immutable — each step receives a single block POJO and returns a clone with the change applied.  Honesty contract (chapter #68): no silent data drop. A migration that needs to remove a field must first preserve it under a new name or note the loss in the chapter. Touched blocks carry `_migratedFrom: <oldV>` so a host audit can find rows that were rewritten on load.  Cycle guard (R028 block-group reuse pattern): the recursive walker tracks visited block ids and short-circuits on revisit; legitimate trees never repeat ids, but defence-in-depth against malformed imports.

## Exports (7)

- `BLOCK_SCHEMA_VERSION`
- `interface BlockMigrationStep (3 members)`
- `MIGRATIONS: readonly BlockMigrationStep[]`
- `blockVersion(block: Block): number`
- `treeNeedsMigration(tree: BlockTreeJSON): boolean`
- `migrateTree(tree: BlockTreeJSON, fromVersion?: number): BlockTreeJSON`
- `loadBlockTreeMigrated(tree: BlockTreeJSON): [BlockTreeJSON, boolean]`

## Depends on (2)

- [`src/engines/editor/elements/block.ts`](./block.md)
- [`src/engines/editor/elements/ids.ts`](./ids.md)

## Used by (3)

- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`src/built-ins/modules/website-editor/src/lib/blockSchemaMigrations.ts`](../../../built-ins/modules/website-editor/src/lib/blockSchemaMigrations.md)
- [`src/engines/editor/elements/index.ts`](./index.md)

