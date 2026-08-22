# `src/built-ins/runtime/_pageScope.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** WHICH HOST MAY RENDER THIS PAGE, AND WHO MAY SEE IT THERE.  The question this file exists to answer is not "what roles did the manifest declare?" — it is "which HOSTS can reach this page, and what is each host's own gate?". Those are different questions, and on 22 August 2026 only the first one was being asked. The result:  end-customer  /portal/clients/<id>/agency-hr/staff        → RENDERED end-customer  /portal/clients/<id>/agency-marketing/leads → RENDERED end-customer  /portal/customer/memberships/subscribers    → RENDERED  Three hosts resolve plugin pages, and each one has a DIFFERENT gate:  /portal/agency/[...rest]            requireRole(AGENCY_ROLES) /portal/clients/[clientId]/[...rest] requireRoleForClient(ALL_ROLES, id) /portal/customer/[...rest]          requireRole("end-customer")  The client host's gate is every role in the product. The pages it could reach included every agency-scoped plugin page, because `pickInstall` falls back to the agency-scoped install and `pluginPageAllowedRoles` was `undefined` for 69 of 90 registered pages. A page that declares nothing was treated as "everyone this host admits" — and this host admits everyone.  So the gate cannot be built out of manifest declarations. 90 manifests being right is not a mechanism; it is a hope, and it rots the moment someone adds the 91st page. Two structural rules do the work instead, and a manifest can only ever NARROW what they allow:  1. SURFACE COMPATIBILITY. A page belongs to one or more surfaces, derived from the manifest's SHAPE (its path convention and the plugin's install scope policy) rather than from an access-control field an author has to remember. A host only resolves pages that belong to its own surface. An agency-scoped page under the client host is a category error, and it is refused whether or not roles were declared.  2. A SURFACE ROLE CEILING. Each surface has a maximum audience that no manifest can widen. `/portal/clients/…` is the client WORKSPACE — the agency's people plus the client's own team. End-customers have their own host at `/portal/customer`; leads have neither. So the ceiling there is AGENCY_ROLES ∪ CLIENT_ROLES, and an undeclared page inherits the ceiling instead of inheriting the host's much wider door.  Declared roles are still honoured — they narrow the ceiling further, which is how the agency host tells `agency-staff` apart from `agency-owner`. They are the second layer, not the only one.

## Exports (16)

- `type HostSurface`
- `HOST_SURFACES: readonly HostSurface[]`
- `SURFACE_URL_PREFIX: Record<HostSurface, string>`
- `SURFACE_ROLE_CEILING: Record<HostSurface, readonly Role[]>`
- `surfaceOfFullUrlPath(path: string): HostSurface | null`
- `pageSurfaces(plugin: AquaPlugin, page: PluginPage): HostSurface[]`
- `scopePolicySurfaces(plugin: AquaPlugin): HostSurface[]`
- `pageResolvesAt(plugin: AquaPlugin, page: PluginPage, host: HostSurface): boolean`
- `effectivePageRoles(plugin: AquaPlugin, page: PluginPage, host: HostSurface): Role[]`
- `pageAllowsRoleAt(plugin: AquaPlugin, page: PluginPage, host: HostSurface, role: Role): boolean`
- `pluginApiSurfaces(plugin: AquaPlugin): HostSurface[]`
- `apiRouteSurfaces(plugin: AquaPlugin, route: PluginApiRoute): HostSurface[]`
- `apiRouteBackingPage(plugin: AquaPlugin, route: PluginApiRoute): PluginPage | null`
- `apiRoleCeiling(plugin: AquaPlugin, route: PluginApiRoute): Role[]`
- `effectiveApiRoles(plugin: AquaPlugin, route: PluginApiRoute): Role[]`
- `apiRouteAllowsRole(plugin: AquaPlugin, route: PluginApiRoute, role: Role): boolean`

## Depends on (2)

- [`src/built-ins/runtime/_types.ts`](./_types.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (11)

- [`scripts/smoke-app-route-tenancy.test.ts`](../../../scripts/smoke-app-route-tenancy.test.md)
- [`scripts/smoke-plugin-api-host-gates.test.ts`](../../../scripts/smoke-plugin-api-host-gates.test.md)
- [`scripts/smoke-plugin-page-host-gates.test.ts`](../../../scripts/smoke-plugin-page-host-gates.test.md)
- [`src/app/api/portal/[module]/[...rest]/route.ts`](../../app/api/portal/[module]/[...rest]/route.md)
- [`src/app/portal/agency/[...rest]/page.tsx`](../../app/portal/agency/[...rest]/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../app/portal/agency/marketing/page.md)
- [`src/app/portal/clients/[clientId]/[...rest]/page.tsx`](../../app/portal/clients/[clientId]/[...rest]/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/customer/[...rest]/page.tsx`](../../app/portal/customer/[...rest]/page.md)
- [`src/built-ins/runtime/_routeResolver.ts`](./_routeResolver.md)

