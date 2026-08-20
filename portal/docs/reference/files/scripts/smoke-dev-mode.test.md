# `scripts/smoke-dev-mode.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Mode (demo-persona POV switcher) smoke — local/dev-only mint route.  Behavioural: drives the real POST handler in-process (issueSession + NextRequest, per the runtime-verify convention) to prove: 1. the single `canUseDevMode()` gate refuses when Dev Mode is unavailable (production-like env) — the #1 security contract; 2. enter re-mints a fenced demo-OWNER session (isDemo, demo agency, devReturnAgencyId = the real agency); 3. exit returns to the real founder session (not demo, real agency); 4. a foreign origin is rejected. Plus source-shape pins for the account-menu toggle + chrome wiring.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`src/app/api/auth/dev-mode/route.ts`](../src/app/api/auth/dev-mode/route.md)
- [`src/app/api/auth/preview-as-freelancer/route.ts`](../src/app/api/auth/preview-as-freelancer/route.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/seeds/demoSeed.ts`](../src/lib/server/seeds/demoSeed.md)
- [`src/server/freelancerAdmin.ts`](../src/server/freelancerAdmin.md)
- [`src/server/freelancerWorkspace.ts`](../src/server/freelancerWorkspace.md)
- [`src/server/people.ts`](../src/server/people.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

