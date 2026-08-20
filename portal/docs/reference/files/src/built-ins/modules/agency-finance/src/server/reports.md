# `src/built-ins/modules/agency-finance/src/server/reports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Report service. Walks invoice + expense rows over a date window and returns aggregates. No graphs; raw numbers only — T3's website-editor blocks could later visualise.  Multi-currency note: this v1 implementation reports per-currency when invoices/expenses span currencies. The default snapshot uses the install's default currency (or "gbp" fallback) and only counts rows in that currency. Cross-currency consolidation is a future round.

## Exports (1)

- `class ReportService`
    - `constructor(private agencyId: AgencyId, private invoices: InvoiceService, private expenses: ExpenseService, private categories: CategoryService, private income: IncomeService)`
    - `async revenueSnapshot(args: { from: number; to: number; currency?: Currency; }): Promise<RevenueSnapshot>`

## Depends on (6)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/categories.ts`](./categories.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](./expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](./income.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](./invoices.md)

## Used by (1)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)

