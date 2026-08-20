# `src/lib/clients/clientPaymentPlans.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (15)

- `CLIENT_PAYMENT_PLAN_STATUSES`
- `CLIENT_PAYMENT_MILESTONE_STATUSES`
- `type ClientPaymentPlanStatus`
- `type ClientPaymentMilestoneStatus`
- `interface ClientPaymentMilestone (12 members)`
- `interface ClientPaymentPlan (13 members)`
- `interface PaymentPlanInvoiceEvidence (7 members)`
- `type ClientPaymentPositionState`
- `interface ClientPaymentPosition (12 members)`
- `cleanClientPaymentPlans(value: unknown): ClientPaymentPlan[]`
- `reconcileClientPaymentPlan(plan: ClientPaymentPlan, invoices: readonly PaymentPlanInvoiceEvidence[]): ClientPaymentPlan`
- `paymentPlanTotal(plan: ClientPaymentPlan): number`
- `paymentPlanPaid(plan: ClientPaymentPlan): number`
- `customerVisiblePaymentPlans(plans: readonly ClientPaymentPlan[]): ClientPaymentPlan[]`
- `summariseClientPaymentPosition(plans: readonly ClientPaymentPlan[], invoices: readonly PaymentPlanInvoiceEvidence[], now = Date.now()): ClientPaymentPosition`

## Used by (15)

- [`scripts/smoke-client-payment-plans.test.ts`](../../scripts/smoke-client-payment-plans.test.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/tenants/client-files/route.ts`](../app/api/tenants/client-files/route.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../app/api/tenants/client-payment-plans/route.md)
- [`src/app/portal/clients/[clientId]/_FinanceTabClient.tsx`](../app/portal/clients/[clientId]/_FinanceTabClient.md)
- [`src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx`](../app/portal/clients/[clientId]/_PaymentPlansPanel.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/_JourneyCommercialWorkspace.tsx`](../app/portal/clients/_JourneyCommercialWorkspace.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../app/portal/customer/_portalData.md)
- [`src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx`](../built-ins/modules/agency-finance/src/pages/FounderDashboardPage.md)
- [`src/lib/radar/clientRadar.ts`](./clientRadar.md)
- [`src/lib/server/radar/clientRadarService.ts`](./server/clientRadar.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](./server/operationalAlerts.md)
- [`src/lib/server/resolutionPlans.ts`](./server/resolutionPlans.md)

