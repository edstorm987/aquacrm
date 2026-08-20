# `src/built-ins/modules/agency-finance/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Agency-finance domain. Persisted under per-install plugin storage.  Scope: per-agency. Both Invoice and Expense rows carry `agencyId`; Invoice additionally carries `clientId` (the client being billed). All money is integer cents — no floats.

## Exports (58)

- `type InvoiceStatus`
- `type Currency`
- `interface InvoiceLineItem (4 members)`
- `interface Invoice (19 members)`
- `interface CreateInvoiceInput (9 members)`
- `interface UpdateInvoicePatch (7 members)`
- `interface InvoiceTemplate (8 members)`
- `type UpdateInvoiceTemplateInput`
- `type ExpenseStatus`
- `type ExpenseRecurrence`
- `interface ExpenseAttachment (8 members)`
- `interface Expense (33 members)`
- `interface CreateExpenseInput (25 members)`
- `interface UpdateExpensePatch (23 members)`
- `type ExpenseCategoryStatus`
- `interface ExpenseCategory (8 members)`
- `interface CreateCategoryInput (2 members)`
- `interface UpdateCategoryPatch (3 members)`
- `type BudgetPotPurpose`
- `type BudgetPotPeriod`
- `type BudgetPotStatus`
- `interface BudgetPot (16 members)`
- `interface CreateBudgetPotInput (10 members)`
- `interface UpdateBudgetPotPatch (10 members)`
- `type FinanceObligationType`
- `type FinanceObligationFrequency`
- `type FinanceObligationStatus`
- `interface FinanceObligation (24 members)`
- `interface CreateFinanceObligationInput (18 members)`
- `interface UpdateFinanceObligationPatch (8 members)`
- `type PayeeType`
- `type CompensationRateBasis`
- `type CompensationFrequency`
- `type CompensationProfileStatus`
- `interface CompensationProfile (26 members)`
- `interface CreateCompensationProfileInput (20 members)`
- `interface UpdateCompensationProfilePatch (8 members)`
- `type CompensationPaymentKind`
- `type CompensationPaymentStatus`
- `interface CompensationPayment (17 members)`
- `interface CreateCompensationPaymentInput (13 members)`
- `interface UpdateCompensationPaymentPatch (2 members)`
- `interface InvoiceFilter (5 members)`
- `interface ExpenseFilter (6 members)`
- `interface RevenueSnapshot (12 members)`
- `type PaymentMethod`
- `interface Payment (11 members)`
- `interface CreatePaymentInput (8 members)`
- `interface IncomeEntry (15 members)`
- `interface CreateIncomeEntryInput (11 members)`
- `interface IncomeEntryFilter (4 members)`
- `type PlanTier`
- `interface Plan (12 members)`
- `interface CreatePlanInput (8 members)`
- `interface UpdatePlanPatch (5 members)`
- `interface PnLMonth (5 members)`
- `interface FounderSnapshot (9 members)`
- `interface PaymentFilter (5 members)`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](./tenancy.md)

## Used by (35)

- [`src/app/api/portal/finance/expense-attachments/upload/route.ts`](../../../../../app/api/portal/finance/expense-attachments/upload/route.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../../../../../app/api/tenants/client-payment-plans/route.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../../../../app/api/tenants/close-deal/route.md)
- [`src/app/portal/clients/page.tsx`](../../../../../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../../../../../app/portal/customer/_portalData.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-budgets.ts`](../api/handlers-budgets.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-operations.ts`](../api/handlers-operations.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers-r007.ts`](../api/handlers-r007.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx`](../components/BudgetPotsWorkspace.md)
- [`src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx`](../components/ExpensesList.md)
- [`src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx`](../components/FinanceOperationsWorkspace.md)
- [`src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx`](../components/IncomeSheet.md)
- [`src/built-ins/modules/agency-finance/src/components/InvoiceDetailClient.tsx`](../components/InvoiceDetailClient.md)
- [`src/built-ins/modules/agency-finance/src/components/InvoiceTemplateEditor.tsx`](../components/InvoiceTemplateEditor.md)
- [`src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx`](../components/InvoicesList.md)
- [`src/built-ins/modules/agency-finance/src/lib/budgetHealth.ts`](./budgetHealth.md)
- [`src/built-ins/modules/agency-finance/src/lib/channels.ts`](./channels.md)
- [`src/built-ins/modules/agency-finance/src/lib/currencies.ts`](./currencies.md)
- [`src/built-ins/modules/agency-finance/src/lib/moneyIn.ts`](./moneyIn.md)
- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](./stripe.md)
- [`src/built-ins/modules/agency-finance/src/lib/workforceCosts.ts`](./workforceCosts.md)
- [`src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)
- [`src/built-ins/modules/agency-finance/src/server/budgets.ts`](../server/budgets.md)
- [`src/built-ins/modules/agency-finance/src/server/categories.ts`](../server/categories.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](../server/expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](../server/income.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](../server/invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/operations.ts`](../server/operations.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](../server/payments.md)
- [`src/built-ins/modules/agency-finance/src/server/plans.ts`](../server/plans.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](../server/pnl.md)
- [`src/built-ins/modules/agency-finance/src/server/reports.ts`](../server/reports.md)
- [`src/lib/server/closeDeal.ts`](../../../../../lib/server/closeDeal.md)
- [`src/lib/server/finance/financeCurrency.ts`](../../../../../lib/server/finance/financeCurrency.md)

