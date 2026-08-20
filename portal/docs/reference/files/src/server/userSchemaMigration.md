# `src/server/userSchemaMigration.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

**What it is:** R025 — multi-agency user schema migration.  Walks state.users and rewrites legacy single-agency rows into the multi-agency shape. Idempotent: rows already carrying `agencyIds[]` pass through untouched. The runner is invoked from `ensureHydrated` after the cache loads from disk; it also runs lazily before any `createUser` call so writes never land in the legacy shape.  The legacy `agencyId` field is preserved as a mirror — 56+ callsites read it directly and we don't want to sweep them all in one round. Lead users (chapter #127) carry `agencyIds: []` (no real agency).

## Exports (2)

- `interface MigrationStats (3 members)`
- `migrateUsersSchema(users: UserMapLike): MigrationStats`

## Depends on (1)

- [`src/server/types.ts`](./types.md)

## Used by (1)

- [`scripts/smoke-multi-agency-users.test.ts`](../../scripts/smoke-multi-agency-users.test.md)

