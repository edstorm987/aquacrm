# `src/built-ins/modules/agency-finance/src/server/operations.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (1)

- `class FinanceOperationsService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private budgets: BudgetService)`
    - `async listObligations(includeArchived = false): Promise<FinanceObligation[]>`
    - `async getObligation(id: string): Promise<FinanceObligation | null>`
    - `async createObligation(actor: UserId, input: CreateFinanceObligationInput, defaultCurrency: Currency = "gbp"): Promise<FinanceObligation>`
    - `async updateObligation(actor: UserId, id: string, patch: UpdateFinanceObligationPatch): Promise<FinanceObligation | null>`
    - `async listCompensationProfiles(includeArchived = false): Promise<CompensationProfile[]>`
    - `async getCompensationProfile(id: string): Promise<CompensationProfile | null>`
    - `async createCompensationProfile(actor: UserId, input: CreateCompensationProfileInput, defaultCurrency: Currency = "gbp"): Promise<CompensationProfile>`
    - `async updateCompensationProfile(actor: UserId, id: string, patch: UpdateCompensationProfilePatch): Promise<CompensationProfile | null>`
    - `async listCompensationPayments(includeCancelled = false): Promise<CompensationPayment[]>`
    - `async getCompensationPayment(id: string): Promise<CompensationPayment | null>`
    - `async createCompensationPayment(actor: UserId, input: CreateCompensationPaymentInput): Promise<CompensationPayment>`
    - `async updateCompensationPayment(actor: UserId, id: string, patch: UpdateCompensationPaymentPatch): Promise<CompensationPayment | null>`

## Depends on (8)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/budgets.ts`](./budgets.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (2)

- [`scripts/smoke-finance-operations.test.ts`](../../../../../../scripts/smoke-finance-operations.test.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)

