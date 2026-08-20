# `scripts/smoke-company-portal.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Giving a trading company a portal of its own — phases 1-3.  Phase 1  the disposition map, with a COMPILE-TIME exhaustiveness guard Phase 2  a read-only preview of what would populate the portal Phase 3  the endpoint's security shell, moving NOTHING  ⚠ THE MODEL, settled by the founder 2026-08-20: AGENCY is a HOLDING GROUP, TRADING COMPANIES are the businesses under it, each with its own CLIENTS. Three permanent tiers. A company never becomes an agency — it stays a company under its group and gains a workspace. The "third tier" section at the bottom is what pins that, because a portal tenant with no link back to its holding group is indistinguishable from a wholly separate business, and the top tier silently disappears.  The thing actually being defended here is small and specific. `PortalState` has 78 collections. The only existing "everything belonging to a tenant" code hand-lists 25 of them (`showcaseMode.ts:477-519`) and the demo teardown lists 7 (`demoSeed.ts:430-463`). Both silently miss the rest — a live bug. So the first section below does not test that the map is *correct*; it tests that the map cannot go STALE without something failing loudly.  The endpoint section drives the real route handler in-process (issueSession + NextRequest), so it fails against behaviour rather than against source text — the same shape as `smoke-company-switcher.test.ts`.

_No exported symbols (side-effect / internal module)._

## Depends on (12)

- [`src/app/api/auth/switch-agency/route.ts`](../src/app/api/auth/switch-agency/route.md)
- [`src/app/api/portal/agency/companies/[companyId]/portal/route.ts`](../src/app/api/portal/agency/companies/[companyId]/portal/route.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/seeds/aquaOasisSeed.ts`](../src/lib/server/seeds/aquaOasisSeed.md)
- [`src/server/agencyBootstrap.ts`](../src/server/agencyBootstrap.md)
- [`src/server/companyPortal/companyPortal.ts`](../src/server/companyPortal/companyPortal.md)
- [`src/server/companyPortal/disposition.ts`](../src/server/companyPortal/disposition.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/tradingCompanies.ts`](../src/server/tradingCompanies.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

