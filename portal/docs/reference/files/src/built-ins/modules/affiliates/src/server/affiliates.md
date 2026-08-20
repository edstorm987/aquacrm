# `src/built-ins/modules/affiliates/src/server/affiliates.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Affiliate service — CRUD + status transitions.  Storage: affiliates/by-id/<id>            → Affiliate affiliates/by-user/<userId>      → affiliateId (uniqueness lookup) affiliates/index                 → string[] of affiliate ids

## Exports (1)

- `class AffiliateService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private user: UserPort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: AffiliateFilter): Promise<Affiliate[]>`
    - `async get(id: string): Promise<Affiliate | null>`
    - `async getByUser(userId: UserId): Promise<Affiliate | null>`
    - `async enroll(input: CreateAffiliateInput, actor: UserId): Promise<Affiliate>`
    - `async update(id: string, patch: UpdateAffiliatePatch, actor: UserId): Promise<Affiliate | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async _setStripe(id: string, patch: { stripeAccountId?: string; stripeOnboardingStatus?: StripeOnboardingStatus }): Promise<Affiliate | null>`
    - `async getByStripeAccount(accountId: string): Promise<Affiliate | null>`
    - `async _incrementCounters(id: string, args: { addReferred?: number; addEarningsCents?: number }): Promise<void>`

## Depends on (5)

- [`src/built-ins/modules/affiliates/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/affiliates/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](./ports.md)

## Used by (5)

- [`src/built-ins/modules/affiliates/src/server/attributions.ts`](./attributions.md)
- [`src/built-ins/modules/affiliates/src/server/codes.ts`](./codes.md)
- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/affiliates/src/server/onboarding.ts`](./onboarding.md)
- [`src/built-ins/modules/affiliates/src/server/payouts.ts`](./payouts.md)

