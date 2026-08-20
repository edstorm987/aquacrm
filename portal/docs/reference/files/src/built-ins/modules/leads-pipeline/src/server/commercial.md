# `src/built-ins/modules/leads-pipeline/src/server/commercial.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (1)

- `class CommercialService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort, private email?: EmailEnqueuePort)`
    - `async get(kind: CommercialPartyKind, partyId: string): Promise<CommercialPack | null>`
    - `async getByToken(token: string): Promise<CommercialPack | null>`
    - `async save(input: SaveCommercialPackInput, actor: UserId): Promise<CommercialPack>`
    - `async attachStripe(kind: CommercialPartyKind, partyId: string, checkout: { id: string; url: string }): Promise<CommercialPack | null>`
    - `async attachStripeSubscription(kind: CommercialPartyKind, partyId: string, subscriptionId: string): Promise<CommercialPack | null>`
    - `async send(kind: CommercialPartyKind, partyId: string, baseUrl: string, actor: UserId): Promise<CommercialPack>`
    - `async accept(token: string, acceptedBy: string): Promise<CommercialPack | null>`
    - `async recordPayment(kind: CommercialPartyKind, partyId: string, input: { amountCents: number; method: CommercialPaymentMethod; reference?: string; paidAt?: number; }, actor: UserId): Promise<CommercialPack | null>`
    - `async setFinanceInvoiceId(kind: CommercialPartyKind, partyId: string, financeInvoiceId: string): Promise<void>`
    - `async stripIdentityForErasure(kind: CommercialPartyKind, partyId: string): Promise<boolean>`

## Depends on (6)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)

