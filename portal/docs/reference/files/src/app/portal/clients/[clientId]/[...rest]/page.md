# `src/app/portal/clients/[clientId]/[...rest]/page.tsx`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Client-scope plugin route catch-all.  Matches `/portal/clients/<clientId>/<rest>`. The parent `/portal/clients/[clientId]/layout.tsx` already painted the chrome with the client's brand kit and verified tenant-scope match. Here we only resolve the URL → plugin page and render it.

## Exports (1)

- `default async ClientPluginCatchAll({ params, searchParams }: RouteProps)`

## Depends on (10)

- [`src/built-ins/runtime/_pageScope.ts`](../../../../../built-ins/runtime/_pageScope.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../../../../../built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_types.ts`](../../../../../built-ins/runtime/_types.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](../../../../../built-ins/runtime/foundation-adapters/index.md)
- [`src/components/ui/ErrorBoundary.tsx`](../../../../../components/ui/ErrorBoundary.md)
- [`src/lib/server/auth/auth.ts`](../../../../../lib/server/auth/auth.md)
- [`src/lib/server/pluginStorage.ts`](../../../../../lib/server/pluginStorage.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)
- [`src/server/types.ts`](../../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

