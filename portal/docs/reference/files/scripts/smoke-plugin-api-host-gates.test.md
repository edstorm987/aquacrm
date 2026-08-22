# `scripts/smoke-plugin-api-host-gates.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** THE API BEHIND THE PAGES: WHO MAY CALL IT?  `smoke-plugin-page-host-gates.test.ts` closed the read door — three hosts, a surface per page, a ceiling per surface, and an undeclared page inheriting the ceiling instead of the host's much wider one. This file asks the same question of the layer underneath, where the answer was still "anyone with a session":  • `/api/portal/[module]/[...rest]` had NO surface rule. Its only gate was `route.visibleToRoles ?? route.roles`, and **133 of the 312 registered plugin API routes declare neither**. A closed page whose API still answers is not closed. • `/portal/clients/[clientId]` (the client record workspace — finance, contracts, the relationship ledger, internal notes) still gated on `requireRoleForClient([...ALL_ROLES])`, so an `end-customer` ATTACHED to the client reached it by typing the URL. It is not a plugin page, so the page fix could not reach it.  The shape here mirrors the page suite deliberately:  ARM 1  The real dispatcher, driven for real. Every registered route, every method it declares, every one of the eight roles, with a REAL signed session — compared against `effectiveApiRoles`. Mutating verbs included: the refusal happens before `route.handler` runs, so a POST that must be refused is proven refused, not assumed. ARM 2  The invariants behind arm 1's expectation, including the count of undeclared routes — the number that made this a finding. ARM 3  The client record workspace and its siblings, driven with real sessions for all eight roles. ARM 4  Mutation checks. A guard nobody has watched fail is a guess.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/built-ins/runtime/_pageScope.ts`](../src/built-ins/runtime/_pageScope.md)
- [`src/built-ins/runtime/_registry.ts`](../src/built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_types.ts`](../src/built-ins/runtime/_types.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/pluginInstalls.ts`](../src/server/pluginInstalls.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

