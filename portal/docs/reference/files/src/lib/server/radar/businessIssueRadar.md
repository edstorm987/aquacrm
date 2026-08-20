# `src/lib/server/radar/businessIssueRadar.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `invalidateBusinessIssueRadarCache(agencyId: string): void`
- `getCachedBusinessIssueRadar(agencyId: string, now = Date.now()): Promise<BusinessIssueRadar>`
- `async buildBusinessIssueRadar(agencyId: string, now = Date.now(), inputs: RadarInputs = {}): Promise<BusinessIssueRadar>`

## Depends on (35)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/enquiries/enquiryClassification.ts`](../../enquiries/enquiryClassification.md)
- [`src/lib/enquiries/leadTiming.ts`](../../enquiries/leadTiming.md)
- [`src/lib/intelligence/commercialLifecycle.ts`](../../intelligence/commercialLifecycle.md)
- [`src/lib/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/lib/radar/radarCheckEngine.ts`](../../radar/radarCheckEngine.md)
- [`src/lib/radar/radarClassification.ts`](../../radar/radarClassification.md)
- [`src/lib/radar/radarCorrelations.ts`](../../radar/radarCorrelations.md)
- [`src/lib/radar/radarCoverageRegistry.ts`](../../radar/radarCoverageRegistry.md)
- [`src/lib/radar/radarInfraChecks.ts`](../../radar/radarInfraChecks.md)
- [`src/lib/radar/radarPolicyEngine.ts`](../../radar/radarPolicyEngine.md)
- [`src/lib/radar/radarRuleCatalog.ts`](../../radar/radarRuleCatalog.md)
- [`src/lib/radar/radarSentinels.ts`](../../radar/radarSentinels.md)
- [`src/lib/radar/radarSyntheticChecks.ts`](../../radar/radarSyntheticChecks.md)
- [`src/lib/server/inbox/inboxStore.ts`](../inbox/inboxStore.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../inbox/operationalAlerts.md)
- [`src/lib/server/kpi/companyHealthSnapshot.ts`](../kpi/companyHealthSnapshot.md)
- [`src/lib/server/pluginStorage.ts`](../pluginStorage.md)
- [`src/lib/server/radar/clientRadarService.ts`](./clientRadarService.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](./radarEvidenceVault.md)
- [`src/lib/server/radar/radarMemory.ts`](./radarMemory.md)
- [`src/lib/server/radar/radarObservations.ts`](./radarObservations.md)
- [`src/lib/server/radar/radarSeeding.ts`](./radarSeeding.md)
- [`src/lib/server/radar/radarTelemetry.ts`](./radarTelemetry.md)
- [`src/lib/server/websiteEnquiries.ts`](../websiteEnquiries.md)
- [`src/lib/shared/formatDateTime.ts`](../../shared/formatDateTime.md)
- [`src/server/agencyProducts.ts`](../../../server/agencyProducts.md)
- [`src/server/agencySettings.ts`](../../../server/agencySettings.md)
- [`src/server/commandCalendar.ts`](../../../server/commandCalendar.md)
- [`src/server/legalDocuments.ts`](../../../server/legalDocuments.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tasks.ts`](../../../server/tasks.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/tradingCompanies.ts`](../../../server/tradingCompanies.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by (21)

- [`scripts/smoke-radar-actionable.test.ts`](../../../../scripts/smoke-radar-actionable.test.md)
- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../../../scripts/smoke-radar-coverage-seeding.test.md)
- [`scripts/smoke-radar-finding-groups.test.ts`](../../../../scripts/smoke-radar-finding-groups.test.md)
- [`scripts/smoke-radar-golden-sweep.test.ts`](../../../../scripts/smoke-radar-golden-sweep.test.md)
- [`scripts/smoke-radar-sweep-isolation.test.ts`](../../../../scripts/smoke-radar-sweep-isolation.test.md)
- [`src/app/api/portal/advisor/radar/route.ts`](../../../app/api/portal/advisor/radar/route.md)
- [`src/app/api/portal/calendar/route.ts`](../../../app/api/portal/calendar/route.md)
- [`src/app/api/portal/calendar/sync/route.ts`](../../../app/api/portal/calendar/sync/route.md)
- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/app/api/portal/search/route.ts`](../../../app/api/portal/search/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/assistant/page.tsx`](../../../app/portal/agency/assistant/page.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)
- [`src/components/chrome/AdvisorDrawerControl.tsx`](../../../components/chrome/AdvisorDrawerControl.md)
- [`src/components/chrome/RadarQuickLookControl.tsx`](../../../components/chrome/RadarQuickLookControl.md)
- [`src/lib/server/assistants/advisorContext.ts`](../assistants/advisorContext.md)
- [`src/lib/server/marketingIntelligence.ts`](../marketingIntelligence.md)
- [`src/lib/server/radar/radarSeeding.ts`](./radarSeeding.md)
- [`src/lib/server/radar/radarSweeps.ts`](./radarSweeps.md)
- [`src/lib/server/resolutionPlans.ts`](../resolutionPlans.md)
- [`src/server/staffCapacity.ts`](../../../server/staffCapacity.md)

