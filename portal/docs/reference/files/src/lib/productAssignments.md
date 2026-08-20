# `src/lib/productAssignments.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `interface PortalProductAssignmentMetadata (5 members)`
- `interface AgencyProductAssignmentResolution (6 members)`
- `interface PortalProductAssignmentState (3 members)`
- `cleanAssignedProductIds(value: unknown, limit = 48): string[]`
- `resolveAgencyProductAssignment(catalogue: readonly AgencyProduct[], selectedProductIds: readonly string[]): AgencyProductAssignmentResolution`
- `selectedPortalProductIds(metadata: PortalProductAssignmentMetadata): string[]`
- `resolvePortalProductAssignment(metadata: PortalProductAssignmentMetadata, catalogue: readonly AgencyProduct[]): PortalProductAssignmentState`
- `productSelectionFingerprint(products: readonly PortalProductSelection[]): string`

## Depends on (3)

- [`src/lib/clientProductVariations.ts`](./clientProductVariations.md)
- [`src/lib/portalProducts.ts`](./portalProducts.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (23)

- [`scripts/smoke-product-assignment-adaptation.test.ts`](../../scripts/smoke-product-assignment-adaptation.test.md)
- [`src/app/api/portal/pipelines/move-client/route.ts`](../app/api/portal/pipelines/move-client/route.md)
- [`src/app/api/portal/products/rollout/route.ts`](../app/api/portal/products/rollout/route.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../app/api/tenants/client-payment-plans/route.md)
- [`src/app/api/tenants/client-product-process/route.ts`](../app/api/tenants/client-product-process/route.md)
- [`src/app/api/tenants/client-product-variation/route.ts`](../app/api/tenants/client-product-variation/route.md)
- [`src/app/api/tenants/client-products/route.ts`](../app/api/tenants/client-products/route.md)
- [`src/app/api/tenants/client-workspaces/route.ts`](../app/api/tenants/client-workspaces/route.md)
- [`src/app/api/tenants/customer-portal-control/route.ts`](../app/api/tenants/customer-portal-control/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/app/portal/agency/portals/_portalWorkspaceData.ts`](../app/portal/agency/portals/_portalWorkspaceData.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../app/portal/customer/_portalData.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/lib/server/clientRadar.ts`](./server/clientRadar.md)
- [`src/server/clientPortalSetup.ts`](../server/clientPortalSetup.md)
- [`src/server/productWorkspaces.ts`](../server/productWorkspaces.md)

