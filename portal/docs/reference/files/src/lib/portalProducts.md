# `src/lib/portalProducts.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (12)

- `type PortalProductKey`
- `type PortalProductMode`
- `PORTAL_PHASE_LABELS: Record<PortalProductMode, string>`
- `interface PortalProductSelection (12 members)`
- `interface PortalProductDefinition (4 members)`
- `PORTAL_PRODUCT_CATALOG: PortalProductDefinition[]`
- `cleanPortalProducts(value: unknown): PortalProductSelection[]`
- `portalProductDefinition(product: PortalProductSelection): PortalProductDefinition | undefined`
- `portalProductSelectionFromAgencyProduct(product: AgencyProduct): PortalProductSelection`
- `portalProjectLabel(products: PortalProductSelection[]): string`
- `portalHomeHeading(products: PortalProductSelection[], override?: string): string`
- `portalStageFocus(product: PortalProductSelection, mode: PortalProductMode): string`

## Depends on (1)

- [`src/server/types.ts`](../server/types.md)

## Used by (31)

- [`scripts/smoke-client-service-workspace.test.ts`](../../scripts/smoke-client-service-workspace.test.md)
- [`scripts/smoke-product-portal-modules.test.ts`](../../scripts/smoke-product-portal-modules.test.md)
- [`scripts/smoke-product-workspace-application.test.ts`](../../scripts/smoke-product-workspace-application.test.md)
- [`src/app/api/portal/products/rollout/route.ts`](../app/api/portal/products/rollout/route.md)
- [`src/app/api/tenants/client-products/route.ts`](../app/api/tenants/client-products/route.md)
- [`src/app/api/tenants/client-workspaces/route.ts`](../app/api/tenants/client-workspaces/route.md)
- [`src/app/api/tenants/product-workspaces/route.ts`](../app/api/tenants/product-workspaces/route.md)
- [`src/app/client-preview/[clientId]/page.tsx`](../app/client-preview/[clientId]/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/portals/_PortalsWorkspace.tsx`](../app/portal/agency/portals/_PortalsWorkspace.md)
- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../app/portal/agency/portals/editor/_ClientPortalStudio.md)
- [`src/app/portal/agency/products/[productId]/_ProductDetailWorkspace.tsx`](../app/portal/agency/products/[productId]/_ProductDetailWorkspace.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/agency/products/_ProductsWorkspace.tsx`](../app/portal/agency/products/_ProductsWorkspace.md)
- [`src/app/portal/clients/[clientId]/_FulfilmentPortalPreview.tsx`](../app/portal/clients/[clientId]/_FulfilmentPortalPreview.md)
- [`src/app/portal/customer/_CustomerPortalChrome.tsx`](../app/portal/customer/_CustomerPortalChrome.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../app/portal/customer/_CustomerPortalViews.md)
- [`src/app/portal/customer/_ProductWorkspaceApplication.tsx`](../app/portal/customer/_ProductWorkspaceApplication.md)
- [`src/app/portal/customer/_portalData.ts`](../app/portal/customer/_portalData.md)
- [`src/app/portal/customer/layout.tsx`](../app/portal/customer/layout.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/lib/clientRadar.ts`](./clientRadar.md)
- [`src/lib/clientServiceWorkspace.ts`](./clientServiceWorkspace.md)
- [`src/lib/fulfilmentProductPipelines.ts`](./fulfilmentProductPipelines.md)
- [`src/lib/portalProductModules.ts`](./portalProductModules.md)
- [`src/lib/portalProductWorkspaces.ts`](./portalProductWorkspaces.md)
- [`src/lib/productAssignments.ts`](./productAssignments.md)
- [`src/lib/server/customerPortalProvisioning.ts`](./server/customerPortalProvisioning.md)
- [`src/server/agencyProducts.ts`](../server/agencyProducts.md)
- [`src/server/clientPortalDesigns.ts`](../server/clientPortalDesigns.md)
- [`src/server/productWorkspaces.ts`](../server/productWorkspaces.md)

