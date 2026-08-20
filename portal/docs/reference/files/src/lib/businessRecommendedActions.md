# `src/lib/businessRecommendedActions.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (1)

- `buildBusinessRecommendedActions({ radar, alerts = [], existingTaskTitles = [], now = Date.now(), limit = 5, }: { radar: BusinessIssueRadar; alerts?: OperationalAlert[]; existingTaskTitles?: string[]; now?: number; limit?: number; }): Advis…`

## Depends on (6)

- [`src/lib/advisorActions.ts`](./advisorActions.md)
- [`src/lib/businessRadar.ts`](./businessRadar.md)
- [`src/lib/inbox/evidenceSteps.ts`](./inbox/evidenceSteps.md)
- [`src/lib/inbox/resolutionExplain.ts`](./inbox/resolutionExplain.md)
- [`src/lib/operationalAttention.ts`](./operationalAttention.md)
- [`src/lib/radarClassification.ts`](./radarClassification.md)

## Used by (6)

- [`scripts/smoke-command-recommendations.test.ts`](../../scripts/smoke-command-recommendations.test.md)
- [`scripts/smoke-radar-actionable.test.ts`](../../scripts/smoke-radar-actionable.test.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](../app/portal/agency/_DashboardCommandCenter.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/lib/server/advisorContext.ts`](./server/advisorContext.md)

