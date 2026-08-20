# `src/server/productWorkspaces.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (3)

- `clientProductWorkspaces(client: Client): PortalProductWorkspace[]`
- `saveClientProductWorkspaces(client: Client, workspaces: PortalProductWorkspace[]): Client | null`
- `reconcileClientProductWorkspaces(client: Client, products: PortalProductSelection[], stage: PortalProductMode): Record<string, unknown>`

## Depends on (6)

- [`src/lib/portal/portalProductWorkspaces.ts`](../lib/portal/portalProductWorkspaces.md)
- [`src/lib/portal/portalProducts.ts`](../lib/portal/portalProducts.md)
- [`src/lib/products/productAssignments.ts`](../lib/products/productAssignments.md)
- [`src/server/agencyProducts.ts`](./agencyProducts.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (11)

- [`src/app/api/portal/products/rollout/route.ts`](../app/api/portal/products/rollout/route.md)
- [`src/app/api/tenants/client-product-process/route.ts`](../app/api/tenants/client-product-process/route.md)
- [`src/app/api/tenants/client-product-variation/route.ts`](../app/api/tenants/client-product-variation/route.md)
- [`src/app/api/tenants/client-products/route.ts`](../app/api/tenants/client-products/route.md)
- [`src/app/api/tenants/client-workspaces/route.ts`](../app/api/tenants/client-workspaces/route.md)
- [`src/app/api/tenants/customer-portal-control/route.ts`](../app/api/tenants/customer-portal-control/route.md)
- [`src/app/api/tenants/product-workspaces/route.ts`](../app/api/tenants/product-workspaces/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/lib/server/radar/clientRadarService.ts`](../lib/server/radar/clientRadarService.md)
- [`src/server/clientPortalSetup.ts`](./clientPortalSetup.md)

