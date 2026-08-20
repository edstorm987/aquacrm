# `scripts/smoke-durable-nonce-store.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R028 smoke — durable HMAC nonce store. Run via `npm run smoke:durable-nonce-store` (tsx --test).  nonceStore.ts deliberately omits `server-only` so the memory adapter runs under tsx. Postgres adapter is exercised via source-marker (it imports storagePostgres which has the shim). Multi-process behaviour is simulated by allocating two memory adapter instances — each carries its own Map; a token consumed in adapter A doesn't short-circuit adapter B (the prompt's "multi-process simulated" scenario, demonstrating why production needs Postgres).

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/auth/nonceStore.ts`](../src/lib/server/auth/nonceStore.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

