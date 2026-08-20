# `src/built-ins/modules/affiliates/src/server/codes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Referral-code service — CRUD + per-affiliate listing + collision detection.  Storage: codes/by-id/<id>            → ReferralCode codes/by-code/<CODE>        → codeId  (uppercase index for O(1) lookup) codes/index                 → string[] of all code ids

## Exports (1)

- `class ReferralCodeService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private affiliates: AffiliateService)`
    - `async list(filter?: ReferralCodeFilter): Promise<ReferralCode[]>`
    - `async get(id: string): Promise<ReferralCode | null>`
    - `async findByCode(rawCode: string): Promise<ReferralCode | null>`
    - `async create(input: CreateReferralCodeInput, actor: UserId): Promise<ReferralCode>`
    - `async update(id: string, patch: UpdateReferralCodePatch, actor: UserId): Promise<ReferralCode | null>`
    - `async _incrementRedemption(id: string): Promise<void>`

## Depends on (6)

- [`src/built-ins/modules/affiliates/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/affiliates/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/affiliates/src/server/affiliates.ts`](./affiliates.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/affiliates/src/server/attributions.ts`](./attributions.md)
- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)

