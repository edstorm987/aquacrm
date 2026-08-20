# `src/lib/performance/performanceAnalytics.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `interface PerformanceEvent (16 members)`
- `interface PerformanceMetricSet (9 members)`
- `interface PerformanceAnalytics (11 members)`
- `buildPerformanceAnalytics(events: PerformanceEvent[], days: number, now = Date.now()): PerformanceAnalytics`
- `buildPerformanceAnalyticsForRange(events: PerformanceEvent[], start: number, end: number): PerformanceAnalytics`
- `performanceMetricValue(events: PerformanceEvent[], metric: string): number`

## Depends on (1)

- [`src/lib/shared/formatDateTime.ts`](../shared/formatDateTime.md)

## Used by (10)

- [`scripts/smoke-performance-analytics.test.ts`](../../../scripts/smoke-performance-analytics.test.md)
- [`scripts/smoke-performance-reports.test.ts`](../../../scripts/smoke-performance-reports.test.md)
- [`src/app/api/portal/performance/reports/route.ts`](../../app/api/portal/performance/reports/route.md)
- [`src/app/portal/agency/performance/_PerformanceWorkspace.tsx`](../../app/portal/agency/performance/_PerformanceWorkspace.md)
- [`src/app/portal/agency/performance/page.tsx`](../../app/portal/agency/performance/page.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../../app/portal/customer/_CustomerPortalViews.md)
- [`src/lib/performance/performanceReports.ts`](./performanceReports.md)
- [`src/lib/server/integrations/googleSearchConsole.ts`](../server/integrations/googleSearchConsole.md)
- [`src/server/agencyWebsite.ts`](../../server/agencyWebsite.md)
- [`src/server/clientMilestones.ts`](../../server/clientMilestones.md)

