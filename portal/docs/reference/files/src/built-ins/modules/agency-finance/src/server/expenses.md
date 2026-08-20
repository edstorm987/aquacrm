# `src/built-ins/modules/agency-finance/src/server/expenses.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Expense service. CRUD + approval workflow.  Storage: expenses/by-id/<id>            → Expense expenses/by-category/<catId>   → string[] of expense ids expenses/by-staff/<staffId>    → string[] of expense ids expenses/index                 → string[] of all expense ids

## Exports (1)

- `class ExpenseService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private categories: CategoryService, private budgets: BudgetService)`
    - `async list(filter?: ExpenseFilter): Promise<Expense[]>`
    - `async get(id: string): Promise<Expense | null>`
    - `async listForCategory(categoryId: string): Promise<Expense[]>`
    - `async create(input: CreateExpenseInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<Expense>`
    - `async createDetailed(input: CreateExpenseInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<{ expense: Expense; deduped: boolean }>`
    - `async update(id: string, patch: UpdateExpensePatch, actor: UserId): Promise<Expense | null>`
    - `async approve(id: string, actor: UserId, decisionNote?: string): Promise<Expense | null>`
    - `async reject(id: string, actor: UserId, decisionNote?: string): Promise<Expense | null>`
    - `async reimburse(id: string, actor: UserId): Promise<Expense | null>`
    - `async postNextOccurrence(id: string, actor: UserId): Promise<{ source: Expense; expense: Expense } | null>`

## Depends on (8)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/budgets.ts`](./budgets.md)
- [`src/built-ins/modules/agency-finance/src/server/categories.ts`](./categories.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (4)

- [`scripts/smoke-finance-budget-control.test.ts`](../../../../../../scripts/smoke-finance-budget-control.test.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](./pnl.md)
- [`src/built-ins/modules/agency-finance/src/server/reports.ts`](./reports.md)

