# `scripts/smoke-multi-agency-users.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R025 smoke — multi-agency user schema (`agencyIds[]`). Run via `npm run smoke:multi-agency-users` (tsx --test).  Two test surfaces: - Pure runtime: `migrateUsersSchema` (no server-only) walks a fake users map and converts legacy single-agency rows in place. - Source-marker: createUser writes both shapes, issueSession derives agencyIds + activeAgencyId, auth.ts exports the new helpers.

_No exported symbols (side-effect / internal module)._

## Depends on (2)

- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/userSchemaMigration.ts`](../src/server/userSchemaMigration.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

