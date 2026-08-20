# `src/built-ins/modules/agency-finance/src/server/payments.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** PaymentService — money-in events tied to invoices. R007 addition.  Storage layout: payments/index               → string[] of payment ids (a fast path; reads also scan by-id, see server/rowIndex.ts) payments/by-id/<id>          → Payment  There used to be `payments/by-invoice/<invId>` and `payments/by-client/<cid>` arrays here. Nothing ever read them — `listForInvoice`/`list({clientId})` go through `list()` — so every recorded payment paid for four storage ops (and two more racy read-modify-writes) maintaining indexes no query used. Removed. Any left in existing stores are inert: unread keys in the plugin's own slice.  Recording a payment optionally transitions the linked Invoice to `paid` (when the full total is covered, considering prior payments).

## Exports (1)

- `class PaymentService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private invoices: InvoiceService)`
    - `async list(filter: PaymentFilter = {}): Promise<Payment[]>`
    - `async get(id: string): Promise<Payment | null>`
    - `async listForInvoice(invoiceId: string): Promise<Payment[]>`
    - `async findByExternalRef(externalRef: string): Promise<Payment | null>`
    - `async markRefunded(externalRef: string, actor: UserId): Promise<{ payment: Payment; invoice: Invoice | null } | null>`
    - `async markDisputed(externalRef: string | undefined, actor: UserId): Promise<Payment | null>`
    - `async record(actor: UserId, input: CreatePaymentInput): Promise<{ payment: Payment; invoice: Invoice; settled: boolean; deduped: boolean }>`

## Depends on (7)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](./invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (2)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](./pnl.md)

