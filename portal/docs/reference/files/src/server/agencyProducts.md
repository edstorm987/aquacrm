# `src/server/agencyProducts.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (7)

- `interface AgencyProductInput (33 members)`
- `listAgencyProducts(agencyId: string, includeArchived = false): AgencyProduct[]`
- `getAgencyProduct(agencyId: string, productId: string): AgencyProduct | null`
- `ensureDefaultAgencyProducts(agencyId: string): AgencyProduct[]`
- `createAgencyProduct(agencyId: string, input: AgencyProductInput, actorUserId: string): AgencyProduct`
- `updateAgencyProduct(agencyId: string, productId: string, input: Partial<AgencyProductInput>, actorUserId: string): AgencyProduct | null`
- `productStatus(product: Pick<AgencyProduct, "active"> & { status?: unknown }): AgencyProductStatus`

## Depends on (5)

- [`src/lib/portal/portalProducts.ts`](../lib/portal/portalProducts.md)
- [`src/lib/products/productInternalWorkspace.ts`](../lib/products/productInternalWorkspace.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (32)

- [`src/app/api/portal/pipelines/move-client/route.ts`](../app/api/portal/pipelines/move-client/route.md)
- [`src/app/api/portal/products/rollout/route.ts`](../app/api/portal/products/rollout/route.md)
- [`src/app/api/portal/products/route.ts`](../app/api/portal/products/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../app/api/tenants/client-payment-plans/route.md)
- [`src/app/api/tenants/client-product-process/route.ts`](../app/api/tenants/client-product-process/route.md)
- [`src/app/api/tenants/client-product-variation/route.ts`](../app/api/tenants/client-product-variation/route.md)
- [`src/app/api/tenants/client-products/route.ts`](../app/api/tenants/client-products/route.md)
- [`src/app/api/tenants/client-workspaces/route.ts`](../app/api/tenants/client-workspaces/route.md)
- [`src/app/api/tenants/customer-portal-control/route.ts`](../app/api/tenants/customer-portal-control/route.md)
- [`src/app/api/tenants/product-workspaces/route.ts`](../app/api/tenants/product-workspaces/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/app/portal/agency/portals/_portalWorkspaceData.ts`](../app/portal/agency/portals/_portalWorkspaceData.md)
- [`src/app/portal/agency/portals/editor/page.tsx`](../app/portal/agency/portals/editor/page.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../app/portal/customer/_portalData.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/brandPortfolioService.ts`](../lib/server/brandPortfolioService.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../lib/server/radar/businessIssueRadar.md)
- [`src/lib/server/radar/clientRadarService.ts`](../lib/server/radar/clientRadarService.md)
- [`src/server/clientPortalSetup.ts`](./clientPortalSetup.md)
- [`src/server/productWorkspaces.ts`](./productWorkspaces.md)
- [`src/server/zimanteTradingCompanies.ts`](./zimanteTradingCompanies.md)

