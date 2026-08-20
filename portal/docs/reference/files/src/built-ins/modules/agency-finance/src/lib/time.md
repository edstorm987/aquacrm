# `src/built-ins/modules/agency-finance/src/lib/time.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Clock indirection for stubable tests.

## Exports (6)

- `type Clock`
- `now(): number`
- `setClock(c: Clock): void`
- `resetClock(): void`
- `toDateString(epochMs: number): string`
- `yearOf(epochMs: number): number`

## Used by (8)

- [`src/built-ins/modules/agency-finance/src/server/budgets.ts`](../server/budgets.md)
- [`src/built-ins/modules/agency-finance/src/server/categories.ts`](../server/categories.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](../server/expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](../server/income.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](../server/invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/operations.ts`](../server/operations.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](../server/payments.md)
- [`src/built-ins/modules/agency-finance/src/server/plans.ts`](../server/plans.md)

