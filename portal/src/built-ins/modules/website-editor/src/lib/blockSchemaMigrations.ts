// R039 — Element schema migration runner.
//
// Implementation moved to `src/engines/editor/elements/blockSchemaMigrations.ts` in P1, so
// a portal or stage tree can be migrated by the same runner. Re-exported here
// verbatim.

// Through the NAMESPACE, not by name — see `lib/menuKeys.ts`. A named
// re-export across this plugin's ESM boundary into portal's CommonJS throws
// "does not provide an export named 'BLOCK_SCHEMA_VERSION'" under `tsx`,
// before R039's smoke can assert anything. Types still re-export by name:
// they are erased before any loader sees them.
import * as sharedMigrations from "@/engines/editor/elements/blockSchemaMigrations";

type Namespace = typeof sharedMigrations & { default?: typeof sharedMigrations };
const ns = sharedMigrations as Namespace;
export const BLOCK_SCHEMA_VERSION = ns.BLOCK_SCHEMA_VERSION ?? ns.default!.BLOCK_SCHEMA_VERSION;
export const MIGRATIONS = ns.MIGRATIONS ?? ns.default!.MIGRATIONS;
export const blockVersion = ns.blockVersion ?? ns.default!.blockVersion;
export const loadBlockTreeMigrated = ns.loadBlockTreeMigrated ?? ns.default!.loadBlockTreeMigrated;
export const migrateTree = ns.migrateTree ?? ns.default!.migrateTree;
export const treeNeedsMigration = ns.treeNeedsMigration ?? ns.default!.treeNeedsMigration;

export type { BlockMigrationStep } from "@/engines/editor/elements/blockSchemaMigrations";
