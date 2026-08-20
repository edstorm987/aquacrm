# `scripts/verify-marketing-runtime.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Runtime verification harness — the marketing data spine, actually run. The smoke suite proves the *shaping* logic; it does not prove the spine can be built at all, because every test there feeds it synthetic checks. This drives the real path end to end in-process: a fresh agency, a real Radar build, a real command-intelligence snapshot, the real aqua-tag registry and injection reads — the things that would throw on a page render but pass a static test. Read-only diagnostic, like the `audit-*` scripts — not a pass/fail suite test, because it calls `ensureHydrated({ fresh: true })` and the suite runs files concurrently in one process (a state wipe there would pollute other files). PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' \ npx tsx scripts/verify-marketing-runtime.ts

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/lib/server/marketingIntelligence.ts`](../src/lib/server/marketingIntelligence.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/tradingCompanies.ts`](../src/server/tradingCompanies.md)
- [`src/server/websiteInjections.ts`](../src/server/websiteInjections.md)
- [`src/server/websiteSources.ts`](../src/server/websiteSources.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

