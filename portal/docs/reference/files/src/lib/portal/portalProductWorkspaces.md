# `src/lib/portal/portalProductWorkspaces.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (21)

- `type PortalWorkspaceActor`
- `type PortalWorkspaceOutputStatus`
- `type PortalWorkspaceCollectionStatus`
- `type PortalWorkspaceDecisionStatus`
- `type PortalWorkspaceAssetStatus`
- `interface PortalWorkspaceChecklistItem (6 members)`
- `interface PortalWorkspacePageState (5 members)`
- `interface PortalWorkspaceUpdate (6 members)`
- `interface PortalWorkspaceDecision (10 members)`
- `interface PortalWorkspaceAsset (11 members)`
- `interface PortalWorkspaceCollection (12 members)`
- `interface PortalProductWorkspace (10 members)`
- `interface PortalWorkspaceFieldDefinition (4 members)`
- `createPortalProductWorkspace(product: PortalProductSelection, stage: PortalProductMode = "onboarding", now = Date.now()): PortalProductWorkspace`
- `cleanPortalProductWorkspace(value: unknown, product: PortalProductSelection, fallbackStage: PortalProductMode = "onboarding", now = Date.now()): PortalProductWorkspace`
- `portalProductWorkspaceStore(value: unknown): Record<string, unknown>`
- `cleanPortalProductWorkspaces(value: unknown, products: PortalProductSelection[], fallbackStage: PortalProductMode = "onboarding"): PortalProductWorkspace[]`
- `mergePortalProductWorkspaceStore(value: unknown, workspaces: PortalProductWorkspace[]): Record<string, unknown>`
- `portalWorkspacePageFields(product: PortalProductSelection, page: PortalProductModulePage): PortalWorkspaceFieldDefinition[]`
- `portalWorkspaceProgress(workspace: PortalProductWorkspace): number`
- `portalWorkspaceIsMedia(product: PortalProductSelection): boolean`

## Depends on (2)

- [`src/lib/portal/portalProductModules.ts`](./portalProductModules.md)
- [`src/lib/portal/portalProducts.ts`](./portalProducts.md)

## Used by (9)

- [`scripts/smoke-product-workspace-application.test.ts`](../../../scripts/smoke-product-workspace-application.test.md)
- [`src/app/api/tenants/product-workspaces/route.ts`](../../app/api/tenants/product-workspaces/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../../app/portal/customer/_CustomerPortalViews.md)
- [`src/app/portal/customer/_ProductWorkspaceApplication.tsx`](../../app/portal/customer/_ProductWorkspaceApplication.md)
- [`src/app/portal/customer/_portalData.ts`](../../app/portal/customer/_portalData.md)
- [`src/engines/data/server/radar/clientRadarService.ts`](../../engines/data/server/radar/clientRadarService.md)
- [`src/server/productWorkspaces.ts`](../../server/productWorkspaces.md)

