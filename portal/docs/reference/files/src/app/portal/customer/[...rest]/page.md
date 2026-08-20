# `src/app/portal/customer/[...rest]/page.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** End-customer-scope plugin route catch-all.  Matches `/portal/customer/<rest>`. The parent `/portal/customer/layout.tsx` already painted the chrome with the embedding client's brand kit and verified `requireRole("end-customer")`. Here we only resolve the URL → plugin page and render it.

## Exports (1)

- `default async CustomerPluginCatchAll({ params, searchParams }: RouteProps)`

## Depends on (8)

- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../_CustomerPortalViews.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../../../../built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_types.ts`](../../../../built-ins/runtime/_types.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](../../../../built-ins/runtime/foundation-adapters/index.md)
- [`src/components/ui/ErrorBoundary.tsx`](../../../../components/ui/ErrorBoundary.md)
- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/lib/server/pluginStorage.ts`](../../../../lib/server/pluginStorage.md)
- [`src/server/storage.ts`](../../../../server/storage.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

