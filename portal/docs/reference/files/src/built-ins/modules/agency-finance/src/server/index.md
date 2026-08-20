# `src/built-ins/modules/agency-finance/src/server/index.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-side barrel — services + container builder + foundation adapter.

## Exports (3)

- `interface AgencyFinanceDeps (7 members)`
- `interface AgencyFinanceContainer (11 members)`
- `buildAgencyFinanceContainer(deps: AgencyFinanceDeps): AgencyFinanceContainer`

## Depends on (14)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/budgets.ts`](./budgets.md)
- [`src/built-ins/modules/agency-finance/src/server/categories.ts`](./categories.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](./expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](./income.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](./invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/operations.ts`](./operations.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](./payments.md)
- [`src/built-ins/modules/agency-finance/src/server/plans.ts`](./plans.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](./pnl.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/reports.ts`](./reports.md)

## Used by (8)

- [`src/app/api/tenants/client-payment-plans/route.ts`](../../../../../app/api/tenants/client-payment-plans/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/customer/_portalData.ts`](../../../../../app/portal/customer/_portalData.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts`](./stripeReconcile.md)
- [`src/lib/server/clients/clientDelightExpense.ts`](../../../../../lib/server/clients/clientDelightExpense.md)
- [`src/lib/server/closeDeal.ts`](../../../../../lib/server/closeDeal.md)
- [`src/lib/server/radar/clientRadarService.ts`](../../../../../lib/server/radar/clientRadarService.md)

