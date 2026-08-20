# `src/lib/clientProductProcess.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `interface ClientProductStageHistoryEntry (4 members)`
- `interface ClientProductProcessEntry (5 members)`
- `type ClientProductProcessState`
- `cleanClientProductProcessState(value: unknown): ClientProductProcessState`
- `setClientProductStepCompletion(state: ClientProductProcessState, productId: string, stepId: string, completed: boolean, actor: string, now = Date.now()): ClientProductProcessState`
- `setClientProductStage(state: ClientProductProcessState, productId: string, stageId: string, actor: string, now = Date.now()): ClientProductProcessState`
- `clientProductStageElapsedMs(entry: ClientProductProcessEntry | undefined, stageId: string | undefined, now = Date.now()): number | null`
- `longestActiveClientProductStage(state: ClientProductProcessState, now = Date.now()): { productId: string; stageId: string; elapsedMs: number } | null`

## Used by (6)

- [`scripts/smoke-client-service-workspace.test.ts`](../../scripts/smoke-client-service-workspace.test.md)
- [`src/app/api/tenants/client-product-process/route.ts`](../app/api/tenants/client-product-process/route.md)
- [`src/app/api/tenants/product-workspaces/route.ts`](../app/api/tenants/product-workspaces/route.md)
- [`src/app/portal/clients/[clientId]/_ClientOperatingPlan.tsx`](../app/portal/clients/[clientId]/_ClientOperatingPlan.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx`](../built-ins/modules/agency-finance/src/pages/FounderDashboardPage.md)

