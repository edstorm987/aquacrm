# `src/built-ins/modules/agency-finance/src/server/budgets.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (1)

- `class BudgetService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(includeClosed = false): Promise<BudgetPot[]>`
    - `async get(id: string): Promise<BudgetPot | null>`
    - `async create(actor: UserId, input: CreateBudgetPotInput, defaultCurrency: Currency = "gbp"): Promise<BudgetPot>`
    - `async update(actor: UserId, id: string, patch: UpdateBudgetPotPatch): Promise<BudgetPot | null>`

## Depends on (6)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (5)

- [`scripts/smoke-finance-budget-control.test.ts`](../../../../../../scripts/smoke-finance-budget-control.test.md)
- [`scripts/smoke-finance-operations.test.ts`](../../../../../../scripts/smoke-finance-operations.test.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](./expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/operations.ts`](./operations.md)

