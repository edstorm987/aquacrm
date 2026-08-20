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
- [`src/lib/authBrand.ts`](../../../lib/authBrand.md)
- [`src/lib/clientPortalBuilder.ts`](../../../lib/clientPortalBuilder.md)
- [`src/lib/clientPortalDesign.ts`](../../../lib/clientPortalDesign.md)
- [`src/lib/clientTelemetry.ts`](../../../lib/clientTelemetry.md)
- [`src/lib/formatDateTime.ts`](../../../lib/formatDateTime.md)
- [`src/lib/performanceAnalytics.ts`](../../../lib/performanceAnalytics.md)
- [`src/lib/performanceReports.ts`](../../../lib/performanceReports.md)
- [`src/lib/portalProductModules.ts`](../../../lib/portalProductModules.md)
- [`src/lib/portalProductWorkspaces.ts`](../../../lib/portalProductWorkspaces.md)
- [`src/lib/portalProducts.ts`](../../../lib/portalProducts.md)
- [`src/lib/server/auth.ts`](../../../lib/server/auth.md)
- [`src/lib/server/clientPortalProvider.ts`](../../../lib/server/clientPortalProvider.md)
- [`src/server/clientMilestones.ts`](../../../server/clientMilestones.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (3)

- [`src/app/client-preview/[clientId]/page.tsx`](../../client-preview/[clientId]/page.md)
- [`src/app/portal/customer/[...rest]/page.tsx`](./[...rest]/page.md)
- [`src/app/portal/customer/page.tsx`](./page.md)

