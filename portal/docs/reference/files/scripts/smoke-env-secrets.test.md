# `scripts/smoke-env-secrets.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R029 smoke — env secrets policy. Run via `npm run smoke:env-secrets` (tsx --test).  env.ts deliberately omits `server-only` so the smoke can drive every branch under tsx. secrets.ts has the shim — covered via source-marker.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/env.ts`](../src/lib/server/env.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

