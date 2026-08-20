# `src/built-ins/runtime/_routeResolver.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (6)

- `interface ResolvedPluginPage (4 members)`
- `resolveAgencyPluginPage({ agencyId, rest }: { agencyId: string; rest: string[] }): ResolvedPluginPage | null`
- `resolveClientPluginPage({ agencyId, clientId, rest }: MatchInput): ResolvedPluginPage | null`
- `resolveCustomerPluginPage({ agencyId, clientId, rest }: MatchInput): ResolvedPluginPage | null`
- `interface ResolvedPluginApiRoute (3 members)`
- `resolvePluginApiRoute(pluginId: string, rest: string[], scope: { agencyId: string; clientId?: string }, method: string): ResolvedPluginApiRoute | null`

## Depends on (4)

- [`src/built-ins/runtime/_registry.ts`](./_registry.md)
- [`src/built-ins/runtime/_types.ts`](./_types.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`src/app/api/portal/[module]/[...rest]/route.ts`](../../app/api/portal/[module]/[...rest]/route.md)
- [`src/app/portal/agency/[...rest]/page.tsx`](../../app/portal/agency/[...rest]/page.md)
- [`src/app/portal/clients/[clientId]/[...rest]/page.tsx`](../../app/portal/clients/[clientId]/[...rest]/page.md)
- [`src/app/portal/customer/[...rest]/page.tsx`](../../app/portal/customer/[...rest]/page.md)

