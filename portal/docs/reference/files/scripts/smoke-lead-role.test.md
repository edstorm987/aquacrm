# `scripts/smoke-lead-role.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R023 smoke — `lead` role + permission grid + agency-scope guard. Run via `npm run smoke:lead-role` (tsx --test).  Mix of pure-runtime checks (types.ts has no server-only shim) and source-marker checks for the modules that do (effectiveRole.ts, requireAgencyScope.ts, postLoginRedirect.ts).

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

