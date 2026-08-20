# `src/built-ins/modules/agency-finance/src/server/categories.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Expense category service. CRUD + idempotent seedDefaults. Mirrors agency-HR's department service shape (same patterns: index list, uniqueness check on name).

## Exports (2)

- `DEFAULT_CATEGORIES: readonly { name: string; description?: string }[]`
- `class CategoryService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(): Promise<ExpenseCategory[]>`
    - `async listActive(): Promise<ExpenseCategory[]>`
    - `async get(id: string): Promise<ExpenseCategory | null>`
    - `async create(input: CreateCategoryInput, actor: UserId): Promise<ExpenseCategory>`
    - `async update(id: string, patch: UpdateCategoryPatch, actor: UserId): Promise<ExpenseCategory | null>`
    - `async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }>`

## Depends on (6)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (4)

- [`scripts/smoke-finance-budget-control.test.ts`](../../../../../../scripts/smoke-finance-budget-control.test.md)
- [`src/built-ins/modules/agency-finance/src/server/expenses.ts`](./expenses.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/reports.ts`](./reports.md)

