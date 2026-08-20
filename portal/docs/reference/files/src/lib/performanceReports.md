# `src/lib/performance/performanceReports.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `type MonthlyPerformanceReportStatus`
- `interface MonthlyPerformanceReport (11 members)`
- `cleanMonthlyPerformanceReports(value: unknown): MonthlyPerformanceReport[]`
- `reportMonthRange(month: string): { start: number; end: number; label: string }`
- `reportHighlights(analytics: PerformanceAnalytics): string[]`
- `reportNextSteps(analytics: PerformanceAnalytics): string[]`

## Depends on (1)

- [`src/lib/performance/performanceAnalytics.ts`](./performanceAnalytics.md)

## Used by (6)

- [`scripts/smoke-performance-reports.test.ts`](../../scripts/smoke-performance-reports.test.md)
- [`src/app/api/portal/performance/reports/route.ts`](../app/api/portal/performance/reports/route.md)
- [`src/app/portal/agency/performance/_AquaTagDashboard.tsx`](../app/portal/agency/performance/_AquaTagDashboard.md)
- [`src/app/portal/agency/performance/_PerformanceWorkspace.tsx`](../app/portal/agency/performance/_PerformanceWorkspace.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../app/portal/customer/_CustomerPortalViews.md)

