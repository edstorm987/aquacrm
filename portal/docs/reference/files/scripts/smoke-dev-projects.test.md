# `scripts/smoke-dev-projects.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Editor Engine — project entity guard.  A DevProject is the binding that unifies the engine: repo + ref + the GitHub / Vercel CONNECTION IDS + the Aqua Tag + the project kind. The security- critical contract is that a project stores connection IDS only, and that a connection belonging to ANOTHER agency can never be bound (which would let a project resolve another tenant's token).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

