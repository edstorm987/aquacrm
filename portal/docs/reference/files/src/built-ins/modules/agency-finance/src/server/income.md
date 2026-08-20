# `src/built-ins/modules/agency-finance/src/server/income.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (1)

- `class IncomeService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter: IncomeEntryFilter = {}): Promise<IncomeEntry[]>`
    - `async create(actor: UserId, input: CreateIncomeEntryInput, defaultCurrency: Currency = "gbp"): Promise<IncomeEntry>`

## Depends on (6)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (3)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](./pnl.md)
- [`src/built-ins/modules/agency-finance/src/server/reports.ts`](./reports.md)

