# `scripts/smoke-public-upload-storage.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Smoke — Public upload storage (the `aquacrm-public` bucket boundary). Run in the full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts  § Public media storage — behavioural coverage of the three-tier provider precedence (Supabase → throw-in-prod → local-dev) and, critically, that the helper returns a real public URL — the whole point vs. the proxied private path. See docs/development/plans/public-bucket.md (Phase 1).  NOTE: the suite runs test files concurrently in one shared process, so this test NEVER mutates global `process.env` / `globalThis.fetch` (that would race into other files). Branch selection is driven through the injectable `env` argument; the Supabase network path is pinned by source-shape guardrails, matching the private-upload-storage convention.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/publicUploadStorage.ts`](../src/lib/server/publicUploadStorage.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

