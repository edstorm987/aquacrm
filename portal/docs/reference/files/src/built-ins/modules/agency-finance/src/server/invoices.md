# `src/built-ins/modules/agency-finance/src/server/invoices.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Invoice service. CRUD + status transitions + per-agency sequence.  Storage: invoices/by-id/<id>          → Invoice invoices/by-client/<cid>     → string[] of invoice ids invoices/index               → string[] of all invoice ids invoices/seq/<year>          → integer (next sequence number)

## Exports (1)

- `class InvoiceService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private tenant: TenantPort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: InvoiceFilter): Promise<Invoice[]>`
    - `async getTemplate(): Promise<InvoiceTemplate>`
    - `async saveTemplate(input: UpdateInvoiceTemplateInput): Promise<InvoiceTemplate>`
    - `async get(id: string): Promise<Invoice | null>`
    - `async listForClient(clientId: ClientId): Promise<Invoice[]>`
    - `async create(input: CreateInvoiceInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<Invoice>`
    - `async update(id: string, patch: UpdateInvoicePatch, actor: UserId): Promise<Invoice | null>`
    - `async markPaid(id: string, args: { externalRef?: string; paidVia?: Invoice["paidVia"] }, actor: UserId): Promise<Invoice | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async renderInvoiceHtml(id: string): Promise<string | null>`

## Depends on (8)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-finance/src/lib/safeDate.ts`](../lib/safeDate.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (4)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](./payments.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](./pnl.md)
- [`src/built-ins/modules/agency-finance/src/server/reports.ts`](./reports.md)

