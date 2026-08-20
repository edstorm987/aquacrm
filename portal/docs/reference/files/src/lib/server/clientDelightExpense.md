# `src/lib/server/clientDelightExpense.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Wire: You-Deserve-It (client delight) spend → a Finance expense.  When a delight is delivered with a cost, record that cost as an approval-gated ("pending") finance expense, so gift spend shows up in the money-out picture without being double-counted. Idempotent on the delight id (via the expense `reference`). Record + surface only — the app never moves money; this reflects a spend that already happened.  The hook lives in the client-delight route (async); the idempotency + create live here in the Finance lane. `clientDelight.ts` itself is untouched.

## Exports (4)

- `interface DelightExpenseInput (4 members)`
- `delightExpenseReference(delightId: string): string`
- `async recordDelightExpenseInContainer(finance: AgencyFinanceContainer, input: DelightExpenseInput, actor: string): Promise<string | null>`
- `async recordDelightExpense(agencyId: string, input: DelightExpenseInput, actor: string): Promise<string | null>`

## Depends on (5)

- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../../built-ins/modules/agency-finance/src/server/foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](../../built-ins/modules/agency-finance/src/server/index.md)
- [`src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation.ts`](../../built-ins/runtime/foundation-adapters/agencyFinanceFoundation.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)

## Used by (2)

- [`scripts/smoke-finance-delight-expense.test.ts`](../../../scripts/smoke-finance-delight-expense.test.md)
- [`src/app/api/tenants/client-delight/route.ts`](../../app/api/tenants/client-delight/route.md)

