# `src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as agency-HR + memberships + affiliates.

## Exports (9)

- `interface AgencyFinanceFoundation (5 members)`
- `registerAgencyFinanceFoundation(deps: AgencyFinanceFoundation): void`
- `clearAgencyFinanceFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): AgencyFinanceFoundation`
- `interface ContainerForArgs (3 members)`
- `containerFor(args: ContainerForArgs): AgencyFinanceContainer`
- `containerWithDeps(args: { agencyId: AgencyId; storage: PluginStorage; tenant: TenantPort; user: UserPort; activity: ActivityLogPort; events: EventBusPort; pluginInstalls: PluginInstallStorePort; }): AgencyFinanceContainer`
- `_containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage; }): AgencyFinanceContainer | null`

## Depends on (4)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)

## Used by (31)

- [`scripts/smoke-finance-close-deal.test.ts`](../../../../../../scripts/smoke-finance-close-deal.test.md)
- [`scripts/smoke-finance-delight-expense.test.ts`](../../../../../../scripts/smoke-finance-delight-expense.test.md)
- [`scripts/smoke-finance-idempotency.test.ts`](../../../../../../scripts/smoke-finance-idempotency.test.md)
- [`scripts/smoke-finance-stripe.test.ts`](../../../../../../scripts/smoke-finance-stripe.test.md)
- [`src/app/api/portal/journey/payment-request/route.ts`](../../../../../app/api/portal/journey/payment-request/route.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../../../../app/api/tenants/close-deal/route.md)
- [`src/app/portal/agency/performance/page.tsx`](../../../../../app/portal/agency/performance/page.md)
- [`src/app/portal/clients/page.tsx`](../../../../../app/portal/clients/page.md)
- [`src/built-ins/modules/agency-finance/index.ts`](../../index.md)
- [`src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts`](../__smoke__/finance.test.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-budgets.ts`](../api/handlers-budgets.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-operations.ts`](../api/handlers-operations.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-r007.ts`](../api/handlers-r007.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts`](../api/handlers-stripe.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx`](../pages/BudgetsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/ExpensesPage.tsx`](../pages/ExpensesPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx`](../pages/FounderDashboardPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/InvoiceDetailPage.tsx`](../pages/InvoiceDetailPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/InvoicesPage.tsx`](../pages/InvoicesPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/LockInPage.tsx`](../pages/LockInPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/OperationsPage.tsx`](../pages/OperationsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/PaymentsPage.tsx`](../pages/PaymentsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx`](../pages/PlanningPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/PlansPage.tsx`](../pages/PlansPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/lib/server/brandPortfolio.ts`](../../../../../lib/server/brandPortfolio.md)
- [`src/lib/server/clientDelightExpense.ts`](../../../../../lib/server/clientDelightExpense.md)
- [`src/lib/server/companyHealthSnapshot.ts`](../../../../../lib/server/companyHealthSnapshot.md)

