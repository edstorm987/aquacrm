# `src/server/agencyWebsite.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (10)

- `ensureAgencyWebsite(agencyId: string): AgencyWebsiteProject`
- `ensurePrimaryAgencyWebsite(): AgencyWebsiteProject | null`
- `updateAgencyWebsite(agencyId: string, input: Partial<Pick<AgencyWebsiteProject, "status" | "gateHeadline" | "gateMessage" | "maintenanceMessage" | "productionUrl" | "previewUrl" | "repositoryUrl" | "localPath">>, actorUserId: string): Agen…`
- `updateAgencyWebsitePage(agencyId: string, route: string, patch: Partial<Pick<AgencyWebsitePage, "status" | "message">>, actorUserId: string): AgencyWebsiteProject | null`
- `resetAgencyWebsiteTelemetryKey(agencyId: string, actorUserId: string): AgencyWebsiteProject`
- `clearAgencyWebsiteTelemetry(agencyId: string, actorUserId: string): AgencyWebsiteProject`
- `recordAgencyWebsiteTelemetry(siteKey: string, input: Record<string, unknown>, userAgent?: string): { status: "recorded"; agencyId: string; event: AgencyWebsiteTelemetryEvent } | { status: "rate-limited" } | null`
- `summarizeAgencyWebsite(project: AgencyWebsiteProject): ClientTelemetrySummary`
- `replaceAgencyWebsiteSearchEvents(agencyId: string, connectionId: string, events: PerformanceEvent[], actorUserId: string): AgencyWebsiteProject`
- `websitePageIsUpdating(project: AgencyWebsiteProject | null, route: string): AgencyWebsitePage | null`

## Depends on (6)

- [`src/lib/clients/clientTelemetry.ts`](../lib/clients/clientTelemetry.md)
- [`src/lib/performance/performanceAnalytics.ts`](../lib/performance/performanceAnalytics.md)
- [`src/lib/public/publicSites.ts`](../lib/public/publicSites.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (12)

- [`src/app/(website)/client-centre/page.tsx`](../app/(website)/client-centre/page.md)
- [`src/app/(website)/layout.tsx`](../app/(website)/layout.md)
- [`src/app/api/portal/performance/search-console/route.ts`](../app/api/portal/performance/search-console/route.md)
- [`src/app/api/portal/website/route.ts`](../app/api/portal/website/route.md)
- [`src/app/api/public/contact/route.ts`](../app/api/public/contact/route.md)
- [`src/app/api/telemetry/collect/route.ts`](../app/api/telemetry/collect/route.md)
- [`src/app/portal/agency/development/page.tsx`](../app/portal/agency/development/page.md)
- [`src/app/portal/agency/development/website/page.tsx`](../app/portal/agency/development/website/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/editing/adapters.ts`](../lib/server/editing/adapters.md)

