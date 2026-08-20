# `scripts/smoke-observability.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R030 smoke — basic observability. Run via `npm run smoke:observability` (tsx --test).  Two surfaces: - Pure runtime: requestLog formatter + skip rules (no server-only). - Source-marker: /healthz/full route + app/error.tsx wiring + observability.ts Sentry lazy-load.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/requestLog.ts`](../src/lib/server/requestLog.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

