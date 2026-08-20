# `src/lib/server/operationalAlerts.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `OPERATIONAL_ALERT_THRESHOLDS`
- `getRequestOperationalAlerts`
- `async listOperationalAlerts(agencyId: string, now = Date.now()): Promise<OperationalAlert[]>`

## Depends on (27)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/clientAquaHealth.ts`](../clientAquaHealth.md)
- [`src/lib/clientContracts.ts`](../clientContracts.md)
- [`src/lib/clientMarketingService.ts`](../clientMarketingService.md)
- [`src/lib/clientPaymentPlans.ts`](../clientPaymentPlans.md)
- [`src/lib/clientTelemetry.ts`](../clientTelemetry.md)
- [`src/lib/clientWorkspace.ts`](../clientWorkspace.md)
- [`src/lib/enquiryClassification.ts`](../enquiryClassification.md)
- [`src/lib/formatDateTime.ts`](../formatDateTime.md)
- [`src/lib/inbox/resolutionContext.ts`](../inbox/resolutionContext.md)
- [`src/lib/inbox/resolutionFocus.ts`](../inbox/resolutionFocus.md)
- [`src/lib/operationalAttention.ts`](../operationalAttention.md)
- [`src/lib/server/externalAssistantProposals.ts`](./externalAssistantProposals.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/lib/server/requestNow.ts`](./requestNow.md)
- [`src/lib/server/websiteEnquiries.ts`](./websiteEnquiries.md)
- [`src/server/agencySettings.ts`](../../server/agencySettings.md)
- [`src/server/commandCalendar.ts`](../../server/commandCalendar.md)
- [`src/server/legalDocuments.ts`](../../server/legalDocuments.md)
- [`src/server/organisations.ts`](../../server/organisations.md)
- [`src/server/people.ts`](../../server/people.md)
- [`src/server/persons.ts`](../../server/persons.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tasks.ts`](../../server/tasks.md)
- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/users.ts`](../../server/users.md)

## Used by (15)

- [`src/app/api/portal/notifications/route.ts`](../../app/api/portal/notifications/route.md)
- [`src/app/api/portal/search/route.ts`](../../app/api/portal/search/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/agency/page.tsx`](../../app/portal/agency/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/lib/server/advisorContext.ts`](./advisorContext.md)
- [`src/lib/server/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/clientRadar.ts`](./clientRadar.md)
- [`src/lib/server/openaiAssistant.ts`](./openaiAssistant.md)
- [`src/lib/server/radarObservations.ts`](./radarObservations.md)
- [`src/lib/server/resolutionPlans.ts`](./resolutionPlans.md)
- [`src/lib/server/sidebarAttention.ts`](./sidebarAttention.md)

