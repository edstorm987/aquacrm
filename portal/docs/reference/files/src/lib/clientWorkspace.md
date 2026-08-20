# `src/lib/clientWorkspace.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `CLIENT_WORKSPACE_TABS`
- `type ClientWorkspaceTabId`
- `clientWorkspaceDisplayName(client: { name: string; workspaceLabel?: string | null }): string`
- `resolveClientWorkspaceTab(value: string | undefined): ClientWorkspaceTabId`
- `clientWorkspaceHref(clientId: string, tab: ClientWorkspaceTabId, extra: Record<string, string | undefined> = {}): string`

## Used by (25)

- [`scripts/client-workspace-navigation.test.ts`](../../scripts/client-workspace-navigation.test.md)
- [`src/app/portal/agency/development/page.tsx`](../app/portal/agency/development/page.md)
- [`src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx`](../app/portal/agency/fulfilment/_FulfilmentWorkspace.md)
- [`src/app/portal/agency/inbox/page.tsx`](../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/portals/editor/page.tsx`](../app/portal/agency/portals/editor/page.md)
- [`src/app/portal/clients/[clientId]/_ClientDeliveryOverview.tsx`](../app/portal/clients/[clientId]/_ClientDeliveryOverview.md)
- [`src/app/portal/clients/[clientId]/_ClientFulfilmentHub.tsx`](../app/portal/clients/[clientId]/_ClientFulfilmentHub.md)
- [`src/app/portal/clients/[clientId]/_ClientOperatingPlan.tsx`](../app/portal/clients/[clientId]/_ClientOperatingPlan.md)
- [`src/app/portal/clients/[clientId]/_ClientServiceSwitcher.tsx`](../app/portal/clients/[clientId]/_ClientServiceSwitcher.md)
- [`src/app/portal/clients/[clientId]/_ClientSopsTab.tsx`](../app/portal/clients/[clientId]/_ClientSopsTab.md)
- [`src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx`](../app/portal/clients/[clientId]/_ClientSpineOverview.md)
- [`src/app/portal/clients/[clientId]/_ClientWorkspaceHeader.tsx`](../app/portal/clients/[clientId]/_ClientWorkspaceHeader.md)
- [`src/app/portal/clients/[clientId]/_OverviewTabs.tsx`](../app/portal/clients/[clientId]/_OverviewTabs.md)
- [`src/app/portal/clients/[clientId]/_tabs.ts`](../app/portal/clients/[clientId]/_tabs.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/components/chrome/ClientRadarQuickLookButton.tsx`](../components/chrome/ClientRadarQuickLookButton.md)
- [`src/lib/server/advisorSkillContext.ts`](./server/advisorSkillContext.md)
- [`src/lib/server/commandIntelligence.ts`](./server/commandIntelligence.md)
- [`src/lib/server/externalAssistantApi.ts`](./server/externalAssistantApi.md)
- [`src/lib/server/operationalAlerts.ts`](./server/operationalAlerts.md)
- [`src/lib/server/radarSyntheticProbes.ts`](./server/radarSyntheticProbes.md)
- [`src/lib/server/radarTelemetry.ts`](./server/radarTelemetry.md)
- [`src/lib/server/resolutionPlans.ts`](./server/resolutionPlans.md)

