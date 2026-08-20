# `src/app/portal/customer/_CustomerPortalViews.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (3)

- `type CustomerPortalSection`
- `async CustomerPortalView({ section, productId, moduleId, customPageSlug }: { section: CustomerPortalSection; productId?: string; moduleId?: string; customPageSlug?: string })`
- `CustomerPortalContent({ section, client, data, previewHrefPrefix, productId, moduleId, customPageSlug, providerName = "Milesymedia", workspaceRole = "preview", }: { section: CustomerPortalSection; client: Client; data: CustomerPortalData; …`

## Depends on (20)

- [`src/app/portal/customer/_CustomerPortalActions.tsx`](./_CustomerPortalActions.md)
- [`src/app/portal/customer/_PortalPageComposition.tsx`](./_PortalPageComposition.md)
- [`src/app/portal/customer/_ProductWorkspaceApplication.tsx`](./_ProductWorkspaceApplication.md)
- [`src/app/portal/customer/_portalData.ts`](./_portalData.md)
- [`src/lib/brands/authBrand.ts`](../../../lib/brands/authBrand.md)
- [`src/lib/clients/clientTelemetry.ts`](../../../lib/clients/clientTelemetry.md)
- [`src/lib/performance/performanceAnalytics.ts`](../../../lib/performance/performanceAnalytics.md)
- [`src/lib/performance/performanceReports.ts`](../../../lib/performance/performanceReports.md)
- [`src/lib/portal/clientPortalBuilder.ts`](../../../lib/portal/clientPortalBuilder.md)
- [`src/lib/portal/clientPortalDesign.ts`](../../../lib/portal/clientPortalDesign.md)
- [`src/lib/portal/portalProductModules.ts`](../../../lib/portal/portalProductModules.md)
- [`src/lib/portal/portalProductWorkspaces.ts`](../../../lib/portal/portalProductWorkspaces.md)
- [`src/lib/portal/portalProducts.ts`](../../../lib/portal/portalProducts.md)
- [`src/lib/server/auth/auth.ts`](../../../lib/server/auth/auth.md)
- [`src/lib/server/clients/clientPortalProvider.ts`](../../../lib/server/clients/clientPortalProvider.md)
- [`src/lib/shared/formatDateTime.ts`](../../../lib/shared/formatDateTime.md)
- [`src/server/clientMilestones.ts`](../../../server/clientMilestones.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (3)

- [`src/app/client-preview/[clientId]/page.tsx`](../../client-preview/[clientId]/page.md)
- [`src/app/portal/customer/[...rest]/page.tsx`](./[...rest]/page.md)
- [`src/app/portal/customer/page.tsx`](./page.md)

