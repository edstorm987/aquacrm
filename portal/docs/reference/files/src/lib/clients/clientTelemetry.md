# `src/lib/clients/clientTelemetry.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `TELEMETRY_EVENT_TYPES`
- `type ClientTelemetryEventType`
- `interface ClientTelemetryEvent (29 members)`
- `interface ClientTelemetrySnapshot (4 members)`
- `interface ClientTelemetrySummary (5 members)`
- `summarizeClientTelemetry(events: ClientTelemetryEvent[], now = Date.now()): ClientTelemetrySummary`

## Used by (20)

- [`scripts/client-aqua-health.test.ts`](../../../scripts/client-aqua-health.test.md)
- [`src/app/api/portal/performance/reports/route.ts`](../../app/api/portal/performance/reports/route.md)
- [`src/app/api/portal/performance/search-console/route.ts`](../../app/api/portal/performance/search-console/route.md)
- [`src/app/portal/agency/development/page.tsx`](../../app/portal/agency/development/page.md)
- [`src/app/portal/agency/development/website/_WebsiteWorkspace.tsx`](../../app/portal/agency/development/website/_WebsiteWorkspace.md)
- [`src/app/portal/agency/performance/page.tsx`](../../app/portal/agency/performance/page.md)
- [`src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx`](../../app/portal/clients/[clientId]/_ClientSystemsWorkspace.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../../app/portal/customer/_CustomerPortalViews.md)
- [`src/lib/clients/clientAquaHealth.ts`](./clientAquaHealth.md)
- [`src/lib/server/auth/showcaseMode.ts`](../server/auth/showcaseMode.md)
- [`src/lib/server/brandPortfolioService.ts`](../server/brandPortfolioService.md)
- [`src/lib/server/clients/clientTelemetryService.ts`](../server/clients/clientTelemetryService.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../server/inbox/operationalAlerts.md)
- [`src/lib/server/kpi/companyHealthSnapshot.ts`](../server/kpi/companyHealthSnapshot.md)
- [`src/lib/server/radar/clientRadarService.ts`](../server/radar/clientRadarService.md)
- [`src/lib/server/radar/radarTelemetry.ts`](../server/radar/radarTelemetry.md)
- [`src/server/agencyWebsite.ts`](../../server/agencyWebsite.md)
- [`src/server/clientMilestones.ts`](../../server/clientMilestones.md)

