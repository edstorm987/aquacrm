# `scripts/smoke-plugin-api-tenancy.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** WHOSE TENANT IS IT? — the plugin API dispatcher, driven across two agencies.  `smoke-plugin-api-host-gates.test.ts` settled WHO may call a plugin API route (role, per surface, default-deny). It is deliberately agnostic about WHERE the call lands, and that was the hole:  an agency-owner in agency A POSTed /api/portal/agency-hr/staff?agencyId=B → 201 CREATED, body `agencyId: "<B>"`, readable back with `?agencyId=B`, while their OWN agency listed empty.  The mechanism was the R032 public-route peek. The dispatcher must resolve a route once before it can know whether the route is `public: true` (a Stripe webhook has no session, so its agency can only come from the URL), and the peek did that resolution with the CALLER'S OWN `?agencyId=`. Line 65 then reused the peek as the authoritative resolution whenever it was non-null — which it is for every route the query names an install for. The corrected `session?.agencyId ?? queryAgencyId` fed only the fallback branch, and the fallback branch never ran.  The rule now, in `src/lib/server/portal/apiTenantScope.ts`:  a query-supplied agencyId is authoritative ONLY on a genuinely public route. The instant a session exists the SESSION decides the tenant, and a query naming someone else is a refusal — not a silent change of scope.  This class has escaped three guards, so the arms below are behavioural: the REAL dispatcher, REAL signed sessions, two real agencies with real data in both, and a probe plugin whose handler reports the tenant its `PluginCtx` actually carried — so "refused" and "landed in the right place" are separate, independently proven claims rather than one status code.  ARM 1  The exact reproduction, and the write proven to land in A. ARM 2  Every method × every role × a representative route set, ?agencyId=B. ARM 3  Reads never see B — with B's data seeded so a leak would show. ARM 4  The public routes the peek exists for, still working. ARM 5  The same shape on clientId. ARM 6  R025 multi-agency: naming your OWN other agency still works. ARM 7  Mutation checks — the guard watched failing.

_No exported symbols (side-effect / internal module)._

## Depends on (11)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/built-ins/runtime/_registry.ts`](../src/built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../src/built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_types.ts`](../src/built-ins/runtime/_types.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/portal/apiTenantScope.ts`](../src/lib/server/portal/apiTenantScope.md)
- [`src/server/pluginInstalls.ts`](../src/server/pluginInstalls.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

