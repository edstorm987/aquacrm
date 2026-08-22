# `scripts/smoke-finance-section-gates.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Plugin PAGE access control — the finance hole, and the class behind it.  Finding 2026-08-22 "agency-staff can read FINANCE_ADMIN pages, including salaries, by URL": the agency-finance manifest hid Budgets / Operations / Planning / Settings from `agency-staff` in `navItems`, and declared nothing at all on `pages[]`. `pluginPageAllowedRoles(page)` therefore returned `undefined`, the host's only remaining gate was `requireRole(AGENCY_ROLES)`, and typing the URL got staff straight in — with `OperationsPage` calling `listCompensationProfiles` / `listPayments` SERVER-side, so salaries and bonuses were already in the HTML by the time the admin-only API 403 could have stopped a refresh.  Hiding a link is not access control. Two layers here:  1. FINANCE — every FINANCE_ADMIN section's page refuses agency-staff, the viewer sections still admit them, the real host route 404s a staff request for /operations, and `routes.ts` agrees with `sections.ts` about who may GET budgets. 2. THE CLASS — a generic guard over EVERY registered plugin: a page whose nav entry is narrower than the plugin's widest nav entry in the same scope must declare roles at least as narrow. This is the test that stops the class reopening when the next plugin is written.

_No exported symbols (side-effect / internal module)._

## Depends on (12)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/built-ins/modules/agency-finance/src/api/routes.ts`](../src/built-ins/modules/agency-finance/src/api/routes.md)
- [`src/built-ins/modules/agency-finance/src/lib/sections.ts`](../src/built-ins/modules/agency-finance/src/lib/sections.md)
- [`src/built-ins/runtime/_registry.ts`](../src/built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../src/built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_types.ts`](../src/built-ins/runtime/_types.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/pluginInstalls.ts`](../src/server/pluginInstalls.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

