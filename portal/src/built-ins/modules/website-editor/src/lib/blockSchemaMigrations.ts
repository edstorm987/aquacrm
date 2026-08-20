// R039 — Element schema migration runner.
//
// Implementation moved to `src/lib/elements/blockSchemaMigrations.ts` in P1, so
// a portal or stage tree can be migrated by the same runner. Re-exported here
// verbatim.

export {
  BLOCK_SCHEMA_VERSION,
  MIGRATIONS,
  blockVersion,
  loadBlockTreeMigrated,
  migrateTree,
  treeNeedsMigration,
} from "@/lib/elements/blockSchemaMigrations";
export type { BlockMigrationStep } from "@/lib/elements/blockSchemaMigrations";
