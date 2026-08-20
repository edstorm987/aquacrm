# `src/server/tradingCompanies.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (8)

- `interface TradingCompanyInput (6 members)`
- `listTradingCompanies(agencyId: string, includeArchived = false): TradingCompany[]`
- `getTradingCompany(agencyId: string, companyId: string): TradingCompany | null`
- `createTradingCompany(agencyId: string, input: TradingCompanyInput, actorUserId: string): TradingCompany`
- `updateTradingCompany(agencyId: string, companyId: string, input: Partial<TradingCompanyInput>, actorUserId: string): TradingCompany | null`
- `markTradingCompanyPortalCreated(agencyId: string, companyId: string, portalAgencyId: string, actorUserId: string): TradingCompany | null`
- `tradingCompanyHasOwnPortal(agencyId: string, companyId: string): boolean`
- `recordBelongsToCompany(companyIds: string[] | undefined, activeCompanyId: string | null): boolean`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (34)

- [`scripts/smoke-company-portal.test.ts`](../../scripts/smoke-company-portal.test.md)
- [`scripts/verify-marketing-runtime.ts`](../../scripts/verify-marketing-runtime.md)
- [`src/app/api/portal/agency/companies/[companyId]/portal/route.ts`](../app/api/portal/agency/companies/[companyId]/portal/route.md)
- [`src/app/api/portal/agency/users/route.ts`](../app/api/portal/agency/users/route.md)
- [`src/app/api/portal/company/legal/route.ts`](../app/api/portal/company/legal/route.md)
- [`src/app/api/portal/company/route.ts`](../app/api/portal/company/route.md)
- [`src/app/api/portal/compliance/frameworks/route.ts`](../app/api/portal/compliance/frameworks/route.md)
- [`src/app/api/portal/compliance/posture/route.ts`](../app/api/portal/compliance/posture/route.md)
- [`src/app/api/portal/fulfillment/clients/route.ts`](../app/api/portal/fulfillment/clients/route.md)
- [`src/app/api/portal/trading-companies/route.ts`](../app/api/portal/trading-companies/route.md)
- [`src/app/api/portal/website-sources/route.ts`](../app/api/portal/website-sources/route.md)
- [`src/app/api/tenants/client-products/route.ts`](../app/api/tenants/client-products/route.md)
- [`src/app/api/tenants/client-workspaces/route.ts`](../app/api/tenants/client-workspaces/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/app/portal/agency/portals/_portalWorkspaceData.ts`](../app/portal/agency/portals/_portalWorkspaceData.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx`](../built-ins/modules/agency-finance/src/pages/BudgetsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/OperationsPage.tsx`](../built-ins/modules/agency-finance/src/pages/OperationsPage.md)
- [`src/lib/server/brandPortfolioService.ts`](../lib/server/brandPortfolioService.md)
- [`src/lib/server/clients/clientPortalProvider.ts`](../lib/server/clients/clientPortalProvider.md)
- [`src/lib/server/compliancePostureSource.ts`](../lib/server/compliancePostureSource.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../lib/server/radar/businessIssueRadar.md)
- [`src/lib/server/websiteEnquiries.ts`](../lib/server/websiteEnquiries.md)
- [`src/server/websiteSources.ts`](./websiteSources.md)
- [`src/server/zimanteTradingCompanies.ts`](./zimanteTradingCompanies.md)

