# `src/engines/data/server/radar/clientRadarService.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (2)

- `async buildClientRadarFleet(agencyId: string, options: ClientRadarFleetOptions = {}): Promise<ClientRadarSnapshot[]>`
- `async buildClientRadar(agencyId: string, clientId: string, options: Omit<ClientRadarFleetOptions, "clients"> = {}): Promise<ClientRadarSnapshot | null>`

## Depends on (22)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](../../../../built-ins/modules/agency-finance/src/server/index.md)
- [`src/engines/data/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/engines/data/radar/clientRadar.ts`](../../radar/clientRadar.md)
- [`src/engines/data/server/radar/radarTelemetry.ts`](./radarTelemetry.md)
- [`src/lib/clients/clientAquaHealth.ts`](../../../../lib/clients/clientAquaHealth.md)
- [`src/lib/clients/clientContracts.ts`](../../../../lib/clients/clientContracts.md)
- [`src/lib/clients/clientMarketingService.ts`](../../../../lib/clients/clientMarketingService.md)
- [`src/lib/clients/clientPaymentPlans.ts`](../../../../lib/clients/clientPaymentPlans.md)
- [`src/lib/clients/clientRequests.ts`](../../../../lib/clients/clientRequests.md)
- [`src/lib/clients/clientServiceWorkspace.ts`](../../../../lib/clients/clientServiceWorkspace.md)
- [`src/lib/clients/clientTelemetry.ts`](../../../../lib/clients/clientTelemetry.md)
- [`src/lib/portal/portalProductWorkspaces.ts`](../../../../lib/portal/portalProductWorkspaces.md)
- [`src/lib/products/productAssignments.ts`](../../../../lib/products/productAssignments.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../../../../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/pluginStorage.ts`](../../../../lib/server/pluginStorage.md)
- [`src/server/agencyProducts.ts`](../../../../server/agencyProducts.md)
- [`src/server/clientMilestones.ts`](../../../../server/clientMilestones.md)
- [`src/server/pluginInstalls.ts`](../../../../server/pluginInstalls.md)
- [`src/server/productWorkspaces.ts`](../../../../server/productWorkspaces.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../server/tenants.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by (5)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../../app/portal/clients/[clientId]/page.md)
- [`src/components/chrome/ClientRadarQuickLookControl.tsx`](../../../../components/chrome/ClientRadarQuickLookControl.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/clients/clientAttention.ts`](../../../../lib/server/clients/clientAttention.md)

