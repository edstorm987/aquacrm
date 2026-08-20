# `src/built-ins/modules/agency-finance/src/server/pnl.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** PnLService — founder-dashboard projections (MRR / ARR / churn / trailing P&L) over plans + payments + expenses + invoices.  Honesty contract: when there are zero invoices AND zero plans we return `hasData: false` so the dashboard renders "Connect billing to see live numbers" rather than fabricated zeroes.

## Exports (1)

- `class PnLService`
    - `constructor(private agencyId: AgencyId, private invoices: InvoiceService, private payments: PaymentService, private income: IncomeService, private expenses: ExpenseService, private plans: PlanService)`
    - `async trailingMonths(refNow: number, count = 12): Promise<PnLMonth[]>`
    - `async founderSnapshot(refNow: number, windowDays = 30): Promise<FounderSnapshot>`
    - `async lockInRows(): Promise<Array<{ clientId: ClientId; planId: string; planLabel: string; lockInMonths: number; lockInFeeCents: number; paidCents: number; paid: boolean; }>>`

## Depends on (7)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](./expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](./income.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](./invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](./payments.md)
- [`src/built-ins/modules/agency-finance/src/server/plans.ts`](./plans.md)

## Used by (1)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)

