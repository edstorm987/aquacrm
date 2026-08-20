# `src/built-ins/modules/affiliates/src/server/attributions.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Attribution service. The bridge between ecommerce orders and affiliates: when an order with a `referralCodeId` lands, we persist an Attribution row pinning the commission earned + which affiliate.  Storage: attributions/by-id/<id>          → Attribution attributions/by-order/<orderId>  → attributionId  (idempotency lookup) attributions/by-affiliate/<aff>  → string[] of attribution ids attributions/index               → string[] of all attribution ids  Commission calculation (effective rate, locked at attribution time): ReferralCode.commissionPercentOverride ?? Affiliate.defaultCommissionPercent ?? install.config.defaultCommissionPercent (settings) ?? 10                        // hardcoded floor

## Exports (2)

- `interface RecordOrderArgs (5 members)`
- `class AttributionService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private affiliates: AffiliateService, private codes: ReferralCodeService, pr…`
    - `async list(filter?: AttributionFilter): Promise<Attribution[]>`
    - `async get(id: string): Promise<Attribution | null>`
    - `async getByOrder(orderId: string): Promise<Attribution | null>`
    - `async listForAffiliate(affiliateId: string): Promise<Attribution[]>`
    - `async recordOrder(args: RecordOrderArgs): Promise<Attribution | null>`
    - `async approve(id: string, actor: UserId): Promise<Attribution | null>`
    - `async reverse(id: string, actor: UserId, reason?: string): Promise<Attribution | null>`
    - `async _markPaid(ids: string[], payoutId: string): Promise<void>`

## Depends on (7)

- [`src/built-ins/modules/affiliates/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/affiliates/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/affiliates/src/server/affiliates.ts`](./affiliates.md)
- [`src/built-ins/modules/affiliates/src/server/codes.ts`](./codes.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/affiliates/src/server/payouts.ts`](./payouts.md)

