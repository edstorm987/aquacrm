# `scripts/smoke-postgres-backend-wired.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R027 smoke — Postgres backend wired. Run via `npm run smoke:postgres-backend-wired` (tsx --test).  Two surfaces: - Source-marker: backend default-resolution + dual-read fallback + migration script idempotence + smoke-skip pattern. - Optional runtime: when DATABASE_URL is set, exercise the storagePostgres saveBlob/loadBlob roundtrip. Skips cleanly when env is absent so dev workflow doesn't break (per prompt D).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

