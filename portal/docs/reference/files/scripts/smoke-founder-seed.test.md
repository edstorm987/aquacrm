# `scripts/smoke-founder-seed.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R024 smoke — founder password rotation. Run via `npm run smoke:founder-seed` (tsx --test).  founderSeed.ts has a `server-only` shim → we can't import the `seedFounder` runner under tsx. We DO import the pure `checkFounderPolicy` helper (the policy gate for env-driven seeding) and exercise every branch. File-marker checks cover the runner wire-up + the deploy-runbook entry.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

