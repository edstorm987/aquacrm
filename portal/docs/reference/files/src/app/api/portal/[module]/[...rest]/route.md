# `src/app/api/portal/[module]/[...rest]/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Built-in module API catch-all dispatcher.  All built-in module API routes live under `/api/portal/<moduleId>/<sub>`. We resolve to the matching route handler from the manifest and call it with a `PluginCtx` built from the live session + foundation services container.  Tenant scope is decided by `resolveApiTenantScope` — see `@/lib/server/portal/apiTenantScope`, which carries the whole argument: • A signed-in caller is scoped by their SESSION. `?agencyId=` may only name an agency inside their own membership; naming anyone else is a 403, not a change of scope. • `?clientId=` selects the install within that agency. Client-side roles are pinned to their own client; agency-side roles may only name a client their agency owns. • Only a `public: true` route (webhooks, the funnel capture) takes its tenant from the URL, because it has no session to take it from.

## Exports (5)

- `async GET(req: NextRequest, { params }: RouteParams)`
- `async POST(req: NextRequest, { params }: RouteParams)`
- `async PATCH(req: NextRequest, { params }: RouteParams)`
- `async PUT(req: NextRequest, { params }: RouteParams)`
- `async DELETE(req: NextRequest, { params }: RouteParams)`

## Depends on (10)

- [`src/built-ins/runtime/_pageScope.ts`](../../../../../built-ins/runtime/_pageScope.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../../../../../built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_types.ts`](../../../../../built-ins/runtime/_types.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](../../../../../built-ins/runtime/foundation-adapters/index.md)
- [`src/lib/server/auth/auth.ts`](../../../../../lib/server/auth/auth.md)
- [`src/lib/server/pluginRequestScope.ts`](../../../../../lib/server/pluginRequestScope.md)
- [`src/lib/server/pluginStorage.ts`](../../../../../lib/server/pluginStorage.md)
- [`src/lib/server/portal/apiTenantScope.ts`](../../../../../lib/server/portal/apiTenantScope.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

