# `scripts/smoke-plugin-page-host-gates.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** WHICH HOSTS CAN REACH THIS PAGE, AND WHAT IS EACH HOST'S OWN GATE?  The previous guard (`smoke-finance-section-gates.test.ts`, arm 2) asked a different and much smaller question: within ONE plugin, does a page behind a narrowed nav entry declare roles at least as narrow? It was structural, it never touched a host route, and it passed green while this was true of the shipped app:  end-customer  /portal/clients/<id>/agency-hr/staff           → RENDERED end-customer  /portal/clients/<id>/agency-marketing/leads    → RENDERED end-customer  /portal/clients/<id>/email-sender/logs         → RENDERED end-customer  /portal/clients/<id>/contacts        (no prefix!) → RENDERED client-owner  /portal/clients/<id>/agency-hr/staff           → RENDERED  Nothing in a single plugin's manifest is wrong in those rows. What is wrong is that a THIRD host — one with a much wider door than the surface the page was written for — could resolve them at all. A guard that never leaves the manifest cannot see that, so this one leaves the manifest.  The shape here:  ARM 1  The real question, driven for real. For every registered plugin page, every URL any host could resolve it at, and every one of the eight roles: mount the REAL host route component with a REAL signed session and compare what actually happened against `effectivePageRoles`. Nothing is stubbed except React's client-only bits, which the gates run long before. ARM 2  The invariants that make arm 1's expectation trustworthy: nothing exceeds its surface's role ceiling, no agency-scoped page has a client or customer surface, and the customer surface is only ever reached by a page that names it in full. ARM 3  The nav-vs-page narrowing class, including the ORPHAN variant that `pluginPageForNavHref` structurally cannot see (leads-pipeline's Campaigns nav entry points at an app route, so its page looked unclaimed). ARM 4  Mutation checks. A guard nobody has watched fail is a guess.

_No exported symbols (side-effect / internal module)._

## Depends on (11)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/built-ins/runtime/_pageScope.ts`](../src/built-ins/runtime/_pageScope.md)
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

