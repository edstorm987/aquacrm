# `src/built-ins/modules/agency-finance/src/lib/currencies.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (3)

- `SUPPORTED_CURRENCIES: Array<{ code: Currency; label: string }>`
- `normaliseCurrency(value: unknown, fallback: Currency = "gbp"): Currency`
- `formatMoney(cents: number, currency: string): string`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](./domain.md)

## Used by (14)

- [`scripts/smoke-truthful-surfaces.test.ts`](../../../../../../scripts/smoke-truthful-surfaces.test.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../../../../../app/api/tenants/client-payment-plans/route.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../../../../app/api/tenants/close-deal/route.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx`](../components/BudgetPotsWorkspace.md)
- [`src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx`](../components/ExpensesList.md)
- [`src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx`](../components/FinanceOperationsWorkspace.md)
- [`src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx`](../components/IncomeSheet.md)
- [`src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx`](../components/InvoicesList.md)
- [`src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx`](../pages/BudgetsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/LockInPage.tsx`](../pages/LockInPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx`](../pages/PlanningPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)
- [`src/lib/server/finance/financeCurrency.ts`](../../../../../lib/server/finance/financeCurrency.md)

