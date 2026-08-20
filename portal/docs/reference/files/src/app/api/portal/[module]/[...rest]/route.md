# `src/app/api/portal/[module]/[...rest]/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Built-in module API catch-all dispatcher.  All built-in module API routes live under `/api/portal/<moduleId>/<sub>`. We resolve to the matching route handler from the manifest and call it with a `PluginCtx` built from the live session + foundation services container.  Tenant scope is inferred: • Pass `?clientId=<id>` (or send it as a header / body) to scope to a specific client. • Otherwise the install resolves at the agency scope.

## Exports (5)

- `async GET(req: NextRequest, { params }: RouteParams)`
- `async POST(req: NextRequest, { params }: RouteParams)`
- `async PATCH(req: NextRequest, { params }: RouteParams)`
- `async PUT(req: NextRequest, { params }: RouteParams)`
- `async DELETE(req: NextRequest, { params }: RouteParams)`

## Depends on (7)

- [`src/built-ins/runtime/_routeResolver.ts`](../../../../../built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_types.ts`](../../../../../built-ins/runtime/_types.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](../../../../../built-ins/runtime/foundation-adapters/index.md)
- [`src/lib/server/auth.ts`](../../../../../lib/server/auth.md)
- [`src/lib/server/pluginRequestScope.ts`](../../../../../lib/server/pluginRequestScope.md)
- [`src/lib/server/pluginStorage.ts`](../../../../../lib/server/pluginStorage.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

