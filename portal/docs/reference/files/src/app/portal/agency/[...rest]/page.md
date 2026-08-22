# `src/app/portal/agency/[...rest]/page.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Agency-scope workspace route catch-all.  Matches every URL under `/portal/agency/<rest>` that isn't claimed by a more specific page (Next gives literal routes priority over catch-all). Resolves the URL → workspace tool manifest + activation + page component, then renders the tool's component inside the agency chrome that the parent layout already painted.  T1 nav-audit (2026-05-08): differentiate "no such tool path" (genuine 404) from "tool path exists but activation missing" (friendly not-active page). Stops the hostile blank "Something went wrong loading agency workspace" failure when a sidebar entry points at a tool the tenant hasn't enabled yet.

## Exports (1)

- `default async AgencyPluginCatchAll({ params, searchParams }: RouteProps)`

## Depends on (14)

- [`src/app/portal/agency/[...rest]/_retiredStaffRoute.ts`](./_retiredStaffRoute.md)
- [`src/built-ins/runtime/_pageScope.ts`](../../../../built-ins/runtime/_pageScope.md)
- [`src/built-ins/runtime/_registry.ts`](../../../../built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../../../../built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_runtime.ts`](../../../../built-ins/runtime/_runtime.md)
- [`src/built-ins/runtime/_types.ts`](../../../../built-ins/runtime/_types.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](../../../../built-ins/runtime/foundation-adapters/index.md)
- [`src/components/ui/ErrorBoundary.tsx`](../../../../components/ui/ErrorBoundary.md)
- [`src/components/workspaces/PluginWorkspaceNav.tsx`](../../../../components/workspaces/PluginWorkspaceNav.md)
- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/lib/server/pluginStorage.ts`](../../../../lib/server/pluginStorage.md)
- [`src/server/pluginInstalls.ts`](../../../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

