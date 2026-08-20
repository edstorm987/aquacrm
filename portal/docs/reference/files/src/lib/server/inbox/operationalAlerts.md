# `src/lib/server/inbox/operationalAlerts.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `OPERATIONAL_ALERT_THRESHOLDS`
- `getRequestOperationalAlerts`
- `async listOperationalAlerts(agencyId: string, now = Date.now()): Promise<OperationalAlert[]>`

## Depends on (27)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/clients/clientAquaHealth.ts`](../../clients/clientAquaHealth.md)
- [`src/lib/clients/clientContracts.ts`](../../clients/clientContracts.md)
- [`src/lib/clients/clientMarketingService.ts`](../../clients/clientMarketingService.md)
- [`src/lib/clients/clientPaymentPlans.ts`](../../clients/clientPaymentPlans.md)
- [`src/lib/clients/clientTelemetry.ts`](../../clients/clientTelemetry.md)
- [`src/lib/clients/clientWorkspace.ts`](../../clients/clientWorkspace.md)
- [`src/lib/enquiries/enquiryClassification.ts`](../../enquiries/enquiryClassification.md)
- [`src/lib/inbox/resolutionContext.ts`](../../inbox/resolutionContext.md)
- [`src/lib/inbox/resolutionFocus.ts`](../../inbox/resolutionFocus.md)
- [`src/lib/intelligence/operationalAttention.ts`](../../intelligence/operationalAttention.md)
- [`src/lib/server/assistants/externalAssistantProposals.ts`](../assistants/externalAssistantProposals.md)
- [`src/lib/server/pluginStorage.ts`](../pluginStorage.md)
- [`src/lib/server/requestNow.ts`](../requestNow.md)
- [`src/lib/server/websiteEnquiries.ts`](../websiteEnquiries.md)
- [`src/lib/shared/formatDateTime.ts`](../../shared/formatDateTime.md)
- [`src/server/agencySettings.ts`](../../../server/agencySettings.md)
- [`src/server/commandCalendar.ts`](../../../server/commandCalendar.md)
- [`src/server/legalDocuments.ts`](../../../server/legalDocuments.md)
- [`src/server/organisations.ts`](../../../server/organisations.md)
- [`src/server/people.ts`](../../../server/people.md)
- [`src/server/persons.ts`](../../../server/persons.md)
- [`src/server/pluginInstalls.ts`](../../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tasks.ts`](../../../server/tasks.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by (15)

- [`src/app/api/portal/notifications/route.ts`](../../../app/api/portal/notifications/route.md)
- [`src/app/api/portal/search/route.ts`](../../../app/api/portal/search/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/layout.tsx`](../../../app/portal/agency/layout.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../../app/portal/clients/page.md)
- [`src/lib/server/assistants/advisorContext.ts`](../assistants/advisorContext.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](../assistants/openaiAssistant.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../radar/businessIssueRadar.md)
- [`src/lib/server/radar/clientRadarService.ts`](../radar/clientRadarService.md)
- [`src/lib/server/radar/radarObservations.ts`](../radar/radarObservations.md)
- [`src/lib/server/resolutionPlans.ts`](../resolutionPlans.md)
- [`src/lib/server/sidebarAttention.ts`](../sidebarAttention.md)

