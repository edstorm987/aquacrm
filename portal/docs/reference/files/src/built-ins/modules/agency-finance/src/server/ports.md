# `src/built-ins/modules/agency-finance/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the agency-finance plugin.  Six ports — same discipline as memberships + agency-HR. Notably no cross-plugin EcommerceOrdersPort or StripePort: invoices are generated-and-tracked, not billed-through-Stripe in v1 (real Stripe Invoice sync deferred to a future round).

## Exports (9)

- `interface StoragePort (4 members)`
- `interface TenantPort (4 members)`
- `interface UserPort (1 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type FinanceEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (20)

- [`scripts/smoke-client-journey.test.ts`](../../../../../../scripts/smoke-client-journey.test.md)
- [`scripts/smoke-finance-budget-control.test.ts`](../../../../../../scripts/smoke-finance-budget-control.test.md)
- [`scripts/smoke-finance-close-deal.test.ts`](../../../../../../scripts/smoke-finance-close-deal.test.md)
- [`scripts/smoke-finance-delight-expense.test.ts`](../../../../../../scripts/smoke-finance-delight-expense.test.md)
- [`scripts/smoke-finance-idempotency.test.ts`](../../../../../../scripts/smoke-finance-idempotency.test.md)
- [`scripts/smoke-finance-operations.test.ts`](../../../../../../scripts/smoke-finance-operations.test.md)
- [`scripts/smoke-finance-stripe.test.ts`](../../../../../../scripts/smoke-finance-stripe.test.md)
- [`src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts`](../__smoke__/finance.test.md)
- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/server/budgets.ts`](./budgets.md)
- [`src/built-ins/modules/agency-finance/src/server/categories.ts`](./categories.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](./expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](./income.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](./invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/operations.ts`](./operations.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](./payments.md)
- [`src/built-ins/modules/agency-finance/src/server/plans.ts`](./plans.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

