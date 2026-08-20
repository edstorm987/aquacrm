# `src/built-ins/modules/affiliates/src/server/payouts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Payout service. Manual `markPaid` for v1; Stripe Connect / PayPal API integration deferred to a future round.  Storage: payouts/by-id/<id>         → Payout payouts/by-affiliate/<aff> → string[] of payout ids payouts/index              → string[] of all payout ids

## Exports (1)

- `class PayoutService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private affiliates: AffiliateService, private attributions: AttributionServi…`
    - `async list(filter?: PayoutFilter): Promise<Payout[]>`
    - `async get(id: string): Promise<Payout | null>`
    - `async listForAffiliate(affiliateId: string): Promise<Payout[]>`
    - `async schedule(input: SchedulePayoutInput, actor: UserId, defaultMethod: PayoutMethod = "manual"): Promise<Payout | null>`
    - `async markPaid(id: string, input: MarkPayoutPaidInput, actor: UserId): Promise<Payout | null>`
    - `async processPayout(id: string, actor: UserId, args: { currency?: string; description?: string } = {}): Promise<Payout | null>`
    - `async confirmTransferPaid(transferId: string, actor?: UserId): Promise<Payout | null>`
    - `async markFailed(id: string, reason: string, actor: UserId): Promise<Payout | null>`

## Depends on (7)

- [`src/built-ins/modules/affiliates/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/affiliates/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/affiliates/src/server/affiliates.ts`](./affiliates.md)
- [`src/built-ins/modules/affiliates/src/server/attributions.ts`](./attributions.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)

