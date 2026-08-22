# `src/server/pluginInstalls.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (10)

- `makeInstallId(scope: PluginInstallScope, pluginId: string): string`
- `getInstall(scope: PluginInstallScope, pluginId: string): PluginInstall | null`
- `getInstallById(id: string): PluginInstall | null`
- `listInstalledFor(scope: PluginInstallScope): PluginInstall[]`
- `listInstalledForClientOnly(scope: PluginInstallScope): PluginInstall[]`
- `listInstalledForAgencyOnly(agencyId: string): PluginInstall[]`
- `interface UpsertPluginInstallInput (7 members)`
- `upsertInstall(input: UpsertPluginInstallInput): PluginInstall`
- `patchInstall(scope: PluginInstallScope, pluginId: string, patch: Partial<Pick<PluginInstall, "enabled" | "config" | "features" | "setupAnswers">>): PluginInstall | null`
- `deleteInstall(scope: PluginInstallScope, pluginId: string): boolean`

## Depends on (2)

- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (58)

- [`scripts/smoke-finance-section-gates.test.ts`](../../scripts/smoke-finance-section-gates.test.md)
- [`scripts/smoke-plugin-api-host-gates.test.ts`](../../scripts/smoke-plugin-api-host-gates.test.md)
- [`scripts/smoke-plugin-api-tenancy.test.ts`](../../scripts/smoke-plugin-api-tenancy.test.md)
- [`scripts/smoke-plugin-page-host-gates.test.ts`](../../scripts/smoke-plugin-page-host-gates.test.md)
- [`scripts/smoke-plugin-settings-surface.test.ts`](../../scripts/smoke-plugin-settings-surface.test.md)
- [`scripts/smoke-truthful-surfaces.test.ts`](../../scripts/smoke-truthful-surfaces.test.md)
- [`scripts/smoke-website-signup-lead.test.ts`](../../scripts/smoke-website-signup-lead.test.md)
- [`src/app/api/auth/signup/route.ts`](../app/api/auth/signup/route.md)
- [`src/app/api/portal/journey/payment-request/route.ts`](../app/api/portal/journey/payment-request/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/portal/settings/route.ts`](../app/api/portal/settings/route.md)
- [`src/app/api/portal/website-enquiries/classification/route.ts`](../app/api/portal/website-enquiries/classification/route.md)
- [`src/app/api/portal/website-enquiries/lead/route.ts`](../app/api/portal/website-enquiries/lead/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/contact/route.ts`](../app/api/public/contact/route.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../app/api/tenants/client-payment-plans/route.md)
- [`src/app/api/tenants/close-deal/route.ts`](../app/api/tenants/close-deal/route.md)
- [`src/app/client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx`](../app/client-website-preview/[clientId]/[siteId]/[pageId]/page.md)
- [`src/app/portal/agency/[...rest]/page.tsx`](../app/portal/agency/[...rest]/page.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/development/page.tsx`](../app/portal/agency/development/page.md)
- [`src/app/portal/agency/layout.tsx`](../app/portal/agency/layout.md)
- [`src/app/portal/agency/marketing/page.tsx`](../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx`](../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.md)
- [`src/app/portal/agency/pipelines/[slug]/page.tsx`](../app/portal/agency/pipelines/[slug]/page.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../app/portal/customer/_portalData.md)
- [`src/app/portal/customer/_subroute.tsx`](../app/portal/customer/_subroute.md)
- [`src/app/portal/customer/orders/page.tsx`](../app/portal/customer/orders/page.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/CampaignsPage.tsx`](../built-ins/modules/leads-pipeline/src/pages/CampaignsPage.md)
- [`src/built-ins/runtime/_routeResolver.ts`](../built-ins/runtime/_routeResolver.md)
- [`src/built-ins/runtime/_runtime.ts`](../built-ins/runtime/_runtime.md)
- [`src/built-ins/runtime/foundation-adapters/_crossPluginPorts.ts`](../built-ins/runtime/foundation-adapters/_crossPluginPorts.md)
- [`src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts`](../built-ins/runtime/foundation-adapters/_eventSubscribers.md)
- [`src/built-ins/runtime/foundation-adapters/_foundationPorts.ts`](../built-ins/runtime/foundation-adapters/_foundationPorts.md)
- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/pluginInstallStoreAdapter.ts`](../built-ins/runtime/foundation-adapters/pluginInstallStoreAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/portalVariantAdapter.ts`](../built-ins/runtime/foundation-adapters/portalVariantAdapter.md)
- [`src/engines/data/server/kpi/companyHealthSnapshot.ts`](../engines/data/server/kpi/companyHealthSnapshot.md)
- [`src/engines/data/server/radar/clientRadarService.ts`](../engines/data/server/radar/clientRadarService.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/brandPortfolioService.ts`](../lib/server/brandPortfolioService.md)
- [`src/lib/server/clients/clientDelightExpense.ts`](../lib/server/clients/clientDelightExpense.md)
- [`src/lib/server/commandIntelligenceService.ts`](../lib/server/commandIntelligenceService.md)
- [`src/lib/server/commercialProposal.ts`](../lib/server/commercialProposal.md)
- [`src/lib/server/embedAllowResolver.ts`](../lib/server/embedAllowResolver.md)
- [`src/lib/server/finance/financeBudgetCampaigns.ts`](../lib/server/finance/financeBudgetCampaigns.md)
- [`src/lib/server/finance/financeCurrency.ts`](../lib/server/finance/financeCurrency.md)
- [`src/lib/server/finance/financeWorkforce.ts`](../lib/server/finance/financeWorkforce.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/plugins/pluginSettingsSurface.ts`](../lib/server/plugins/pluginSettingsSurface.md)
- [`src/lib/server/seeds/aquaOasisSeed.ts`](../lib/server/seeds/aquaOasisSeed.md)
- [`src/lib/server/seeds/demoSeed.ts`](../lib/server/seeds/demoSeed.md)
- [`src/lib/server/websiteEnquiryLeadSync.ts`](../lib/server/websiteEnquiryLeadSync.md)

