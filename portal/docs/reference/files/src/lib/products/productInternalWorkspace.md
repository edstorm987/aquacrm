# `src/lib/products/productInternalWorkspace.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `PRODUCT_WORKSPACE_MODULES: ReadonlyArray<{ id: AgencyProductWorkspaceModule; label: string; description: string; }>`
- `isProductWorkspaceModule(value: unknown): value is AgencyProductWorkspaceModule`
- `productWorkspaceModuleLabel(module: AgencyProductWorkspaceModule): string`
- `PRODUCT_STAGE_PORTAL_MODES: ReadonlyArray<{ id: AgencyProductPortalMode; label: string }>`
- `defaultProductInternalWorkspace(product: { id?: string; name?: string; portalTemplateKey?: AgencyProductPortalTemplateKey; sopIds?: string[]; }): AgencyProductInternalWorkspace`

## Depends on (1)

- [`src/server/types.ts`](../../server/types.md)

## Used by (10)

- [`scripts/smoke-client-service-workspace.test.ts`](../../../scripts/smoke-client-service-workspace.test.md)
- [`src/app/api/tenants/client-product-process/route.ts`](../../app/api/tenants/client-product-process/route.md)
- [`src/app/api/tenants/product-workspaces/route.ts`](../../app/api/tenants/product-workspaces/route.md)
- [`src/app/portal/agency/products/[productId]/_ProductDetailWorkspace.tsx`](../../app/portal/agency/products/[productId]/_ProductDetailWorkspace.md)
- [`src/app/portal/agency/products/_ProductsWorkspace.tsx`](../../app/portal/agency/products/_ProductsWorkspace.md)
- [`src/app/portal/clients/[clientId]/_ClientOperatingPlan.tsx`](../../app/portal/clients/[clientId]/_ClientOperatingPlan.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/lib/clients/clientProductVariations.ts`](../clients/clientProductVariations.md)
- [`src/lib/products/fulfilmentProductPipelines.ts`](./fulfilmentProductPipelines.md)
- [`src/server/agencyProducts.ts`](../../server/agencyProducts.md)

