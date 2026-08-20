# `scripts/smoke-vercel-domain.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Mock-smoke for the foundation Vercel domain client. Verifies the call shapes (URL / method / headers / body / response handling) without hitting the real Vercel API.  Real-creds smoke: set VERCEL_TOKEN + VERCEL_PROJECT_ID + a sandbox hostname you control, then run scripts/attach-domain.mjs at the repo root. See 01 development/runbooks/deploy.md §6c.  Usage: npx tsx --test scripts/smoke-vercel-domain.test.ts

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/vercelDomain.impl.ts`](../src/lib/server/vercelDomain.impl.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

